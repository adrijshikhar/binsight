package anomaly

import (
	"fmt"

	"github.com/adrijshikhar/binsight/internal/store"
)

// HugeTxnBytes flags transactions whose byte span (end_pos-start_pos) is huge,
// up to (but excluding) the 4 GiB uint32 boundary. Transactions at/above 4 GiB
// are flagged by the more specific, critical pos_wrap detector instead, so we
// suppress them here to avoid a redundant high+critical pair for one txn.
type HugeTxnBytes struct{}

func (HugeTxnBytes) Name() string { return "huge_txn_bytes" }
func (HugeTxnBytes) Detect(s *store.Store, fileID int64, t Thresholds) ([]*store.Anomaly, error) {
	txns, err := s.ListTxns(fileID)
	if err != nil {
		return nil, err
	}
	var out []*store.Anomaly
	for _, tx := range txns {
		span := tx.EndPos - tx.StartPos
		// >= 4 GiB txns are owned by pos_wrap (critical); don't double-flag.
		if tx.EndPos > 0 && span >= t.TxnBytes && span < uint32Boundary {
			out = append(out, &store.Anomaly{
				FileID: fileID, Detector: "huge_txn_bytes", Severity: SeverityHigh,
				TxnID: tx.ID, Metric: span, Threshold: t.TxnBytes,
				Message: fmt.Sprintf("transaction spans %d bytes (threshold %d)", span, t.TxnBytes),
			})
		}
	}
	return out, nil
}

// Note: only LongTxn filters to committed txns (it needs commit_ts). HugeTxnBytes
// and HugeTxnRows intentionally flag by size regardless of status — a large
// incomplete/rolled-back txn still strained the server and is worth surfacing.

// HugeTxnRows flags transactions touching a huge number of rows.
type HugeTxnRows struct{}

func (HugeTxnRows) Name() string { return "huge_txn_rows" }
func (HugeTxnRows) Detect(s *store.Store, fileID int64, t Thresholds) ([]*store.Anomaly, error) {
	txns, err := s.ListTxns(fileID)
	if err != nil {
		return nil, err
	}
	var out []*store.Anomaly
	for _, tx := range txns {
		rows := tx.RowsInserted + tx.RowsUpdated + tx.RowsDeleted
		if rows >= t.TxnRows {
			out = append(out, &store.Anomaly{
				FileID: fileID, Detector: "huge_txn_rows", Severity: SeverityMedium,
				TxnID: tx.ID, Metric: rows, Threshold: t.TxnRows,
				Message: fmt.Sprintf("transaction touches %d rows (threshold %d)", rows, t.TxnRows),
			})
		}
	}
	return out, nil
}

// LongTxn flags committed transactions that took a long wall-clock time.
type LongTxn struct{}

func (LongTxn) Name() string { return "long_txn" }
func (LongTxn) Detect(s *store.Store, fileID int64, t Thresholds) ([]*store.Anomaly, error) {
	txns, err := s.ListTxns(fileID)
	if err != nil {
		return nil, err
	}
	var out []*store.Anomaly
	for _, tx := range txns {
		if tx.Status != "committed" || tx.CommitTS == 0 || tx.StartTS == 0 {
			continue
		}
		dur := tx.CommitTS - tx.StartTS
		if dur >= t.TxnSeconds {
			out = append(out, &store.Anomaly{
				FileID: fileID, Detector: "long_txn", Severity: SeverityLow,
				TxnID: tx.ID, Metric: dur, Threshold: t.TxnSeconds,
				Message: fmt.Sprintf("transaction open for %ds (threshold %ds)", dur, t.TxnSeconds),
			})
		}
	}
	return out, nil
}

// IncompleteTxn flags transactions left incomplete or rolled back.
type IncompleteTxn struct{}

func (IncompleteTxn) Name() string { return "incomplete_txn" }
func (IncompleteTxn) Detect(s *store.Store, fileID int64, _ Thresholds) ([]*store.Anomaly, error) {
	txns, err := s.ListTxns(fileID)
	if err != nil {
		return nil, err
	}
	var out []*store.Anomaly
	for _, tx := range txns {
		if tx.Status == "incomplete" || tx.Status == "rolled_back" {
			out = append(out, &store.Anomaly{
				FileID: fileID, Detector: "incomplete_txn", Severity: SeverityMedium,
				TxnID: tx.ID, Message: "transaction status: " + tx.Status,
			})
		}
	}
	return out, nil
}

// BulkRowEvent flags a single row event carrying a huge row-image batch.
type BulkRowEvent struct{}

func (BulkRowEvent) Name() string { return "bulk_row_event" }
func (BulkRowEvent) Detect(s *store.Store, fileID int64, t Thresholds) ([]*store.Anomaly, error) {
	evs, err := s.RowEventsAtLeast(fileID, t.EventRows)
	if err != nil {
		return nil, err
	}
	var out []*store.Anomaly
	for _, e := range evs {
		out = append(out, &store.Anomaly{
			FileID: fileID, Detector: "bulk_row_event", Severity: SeverityMedium,
			EventPos: e.Pos, DBName: e.DBName, TableName: e.TableName,
			Metric: e.RowsCount, Threshold: t.EventRows,
			Message: fmt.Sprintf("%s carries %d rows (threshold %d)", e.TypeName, e.RowsCount, t.EventRows),
		})
	}
	return out, nil
}

// SchemaChurn flags DDL in a file that also carries DML (mixed schema+data
// churn). One finding per DDL event; severity by DDL keyword.
type SchemaChurn struct{}

func (SchemaChurn) Name() string { return "schema_churn" }
func (SchemaChurn) Detect(s *store.Store, fileID int64, _ Thresholds) ([]*store.Anomaly, error) {
	dmlCount, err := s.CountRowEvents(fileID)
	if err != nil {
		return nil, err
	}
	if dmlCount == 0 {
		return nil, nil
	}
	ddl, err := s.DDLEvents(fileID)
	if err != nil {
		return nil, err
	}
	var out []*store.Anomaly
	for _, e := range ddl {
		sev, ok := classifyDDL(e.Summary)
		if !ok {
			continue
		}
		out = append(out, &store.Anomaly{
			FileID: fileID, Detector: "schema_churn", Severity: sev,
			EventPos: e.Pos, DBName: e.DBName, TableName: e.TableName,
			Message: "DDL alongside DML: " + e.Summary,
		})
	}
	return out, nil
}
