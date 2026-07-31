package anomaly

import (
	"fmt"
	"strings"

	"github.com/adrijshikhar/binsight/internal/store"
)

// CascadeRisk is the schema-aware detector. It flags a DELETE on a table that
// is a FK parent with ON DELETE CASCADE children when the SAME transaction
// carries no DELETE row event for the child table: InnoDB silently applied the
// child deletes, and they are absent from the binlog.
type CascadeRisk struct{}

func (CascadeRisk) Name() string { return "cascade_risk" }

func (CascadeRisk) Detect(s *store.Store, fileID int64, _ Thresholds) ([]*store.Anomaly, error) {
	dels, err := s.DeleteRowEventsByTable(fileID)
	if err != nil {
		return nil, err
	}
	// Index every (txn, db, table) that has an observed DELETE in the binlog.
	// Skip txn_id==0 (autocommit, or GTID-off): such events share the sentinel
	// txn, so a child DELETE from one autocommit statement would falsely "match"
	// a parent DELETE from an unrelated one. InnoDB cascade fires within a single
	// transaction, so without a real txn id there is no reliable partner to match
	// — we conservatively don't analyze those (avoids false negatives AND false
	// positives across unrelated autocommit statements).
	childDel := map[string]bool{}
	for _, d := range dels {
		if d.Txn == 0 {
			continue
		}
		childDel[cascadeKey(d.Txn, d.DB, d.Table)] = true
	}
	// fkCache loads each table's parent FKs once (the FK graph is fixed per file)
	// instead of re-querying per DELETE event — avoids an N+1 over thousands of deletes.
	fkCache := map[string][]store.FKey{}
	// seen dedupes anomalies for the same (txn, child) pair: multiple DELETE
	// row-event chunks on the same parent table within one transaction would
	// otherwise emit N identical anomalies.
	seen := map[string]bool{}
	var out []*store.Anomaly
	for _, d := range dels {
		if d.Txn == 0 {
			continue
		}
		tk := d.DB + "\x00" + d.Table
		fks, ok := fkCache[tk]
		if !ok {
			fks, err = s.ParentFKeys(fileID, d.DB, d.Table)
			if err != nil {
				return nil, err
			}
			fkCache[tk] = fks
		}
		for _, fk := range fks {
			if !strings.EqualFold(fk.OnDelete, "CASCADE") {
				continue
			}
			if childDel[cascadeKey(d.Txn, fk.ChildDB, fk.ChildTable)] {
				continue
			}
			sk := cascadeKey(d.Txn, fk.ChildDB, fk.ChildTable)
			if seen[sk] {
				continue
			}
			seen[sk] = true
			out = append(out, &store.Anomaly{
				FileID:    fileID,
				Detector:  "cascade_risk",
				Severity:  SeverityHigh,
				TxnID:     d.Txn,
				EventPos:  int64(d.Pos),
				DBName:    d.DB,
				TableName: d.Table,
				Message: fmt.Sprintf(
					"DELETE on %s.%s cascades to %s.%s (ON DELETE CASCADE); "+
						"InnoDB applies child deletes that are NOT in the binlog",
					d.DB, d.Table, fk.ChildDB, fk.ChildTable),
			})
		}
	}
	return out, nil
}

// cascadeKey builds a collision-safe map key from txn + db + table.
func cascadeKey(txn int64, db, table string) string {
	return fmt.Sprintf("%d\x00%s\x00%s", txn, db, table)
}
