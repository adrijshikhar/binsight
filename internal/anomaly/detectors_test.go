package anomaly

import (
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

func newStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func seedFile(t *testing.T, s *store.Store) int64 {
	t.Helper()
	f := &store.File{Path: "/data/x", MagicOK: true, State: store.FileStateReady}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	return f.ID
}

func TestHugeTxnBytes(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	thr := Thresholds{TxnBytes: 1000}
	mk := func(start, end int64) *store.Txn {
		return &store.Txn{FileID: fid, StartPos: start, EndPos: end, Status: "committed"}
	}
	for _, tx := range []*store.Txn{mk(0, 1000), mk(2000, 2999)} {
		if _, err := s.InsertTxn(tx); err != nil {
			t.Fatal(err)
		}
		if err := s.UpdateTxn(tx); err != nil {
			t.Fatal(err)
		}
	}
	got, err := HugeTxnBytes{}.Detect(s, fid, thr)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 finding (span 1000 >= 1000; span 999 < 1000), got %d", len(got))
	}
	if got[0].Severity != SeverityHigh || got[0].Metric != 1000 || got[0].Threshold != 1000 {
		t.Fatalf("finding fields wrong: %+v", got[0])
	}
}

// A >= 4 GiB txn is owned by pos_wrap (critical); huge_txn_bytes must NOT also
// flag it (no redundant high+critical pair for one transaction).
func TestHugeTxnBytesSuppressesAt4GiB(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	tx := &store.Txn{FileID: fid, StartPos: 377, EndPos: 377 + uint32Boundary, Status: "committed"} // span == 4 GiB
	if _, err := s.InsertTxn(tx); err != nil {
		t.Fatal(err)
	}
	got, err := HugeTxnBytes{}.Detect(s, fid, Thresholds{TxnBytes: 1 << 30})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("huge_txn_bytes must suppress >= 4 GiB txns (pos_wrap owns them), got %d: %+v", len(got), got)
	}
}

func TestHugeTxnRows(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	tx := &store.Txn{FileID: fid, RowsInserted: 60, RowsUpdated: 40, RowsDeleted: 1, Status: "committed"}
	if _, err := s.InsertTxn(tx); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateTxn(tx); err != nil {
		t.Fatal(err)
	}
	got, _ := HugeTxnRows{}.Detect(s, fid, Thresholds{TxnRows: 100})
	if len(got) != 1 || got[0].Metric != 101 || got[0].Severity != SeverityMedium {
		t.Fatalf("huge_txn_rows wrong: %+v", got)
	}
	none, _ := HugeTxnRows{}.Detect(s, fid, Thresholds{TxnRows: 102})
	if len(none) != 0 {
		t.Fatalf("should not fire below threshold: %+v", none)
	}
}

func TestLongTxn(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	tx := &store.Txn{FileID: fid, StartTS: 1000, CommitTS: 1060, Status: "committed"}
	if _, err := s.InsertTxn(tx); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateTxn(tx); err != nil {
		t.Fatal(err)
	}
	got, _ := LongTxn{}.Detect(s, fid, Thresholds{TxnSeconds: 60})
	if len(got) != 1 || got[0].Metric != 60 || got[0].Severity != SeverityLow {
		t.Fatalf("long_txn wrong: %+v", got)
	}
}

func TestIncompleteTxn(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	for _, st := range []string{"committed", "incomplete", "rolled_back"} {
		tx := &store.Txn{FileID: fid, Status: st}
		if _, err := s.InsertTxn(tx); err != nil {
			t.Fatal(err)
		}
		if err := s.UpdateTxn(tx); err != nil {
			t.Fatal(err)
		}
	}
	got, _ := IncompleteTxn{}.Detect(s, fid, Thresholds{})
	if len(got) != 2 {
		t.Fatalf("incomplete_txn should fire for incomplete + rolled_back, got %d", len(got))
	}
}

func TestBulkRowEvent(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 10, TypeName: "DELETE_ROWS_V2", RowsCount: 50000, DBName: "d", TableName: "t"},
		{FileID: fid, Pos: 20, TypeName: "WRITE_ROWS_V2", RowsCount: 10},
	}); err != nil {
		t.Fatal(err)
	}
	got, _ := BulkRowEvent{}.Detect(s, fid, Thresholds{EventRows: 50000})
	if len(got) != 1 || got[0].EventPos != 10 || got[0].Severity != SeverityMedium {
		t.Fatalf("bulk_row_event wrong: %+v", got)
	}
}

func TestSchemaChurn(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 10, TypeName: "WRITE_ROWS_V2", RowsCount: 5, DBName: "d", TableName: "t"},
		{FileID: fid, Pos: 20, TypeName: "QUERY", Summary: "DROP TABLE t"},
		{FileID: fid, Pos: 30, TypeName: "QUERY", Summary: "CREATE TABLE u (a int)"},
		{FileID: fid, Pos: 40, TypeName: "QUERY", Summary: "BEGIN"},
	}); err != nil {
		t.Fatal(err)
	}
	got, _ := SchemaChurn{}.Detect(s, fid, Thresholds{})
	if len(got) != 2 {
		t.Fatalf("schema_churn should fire once per DDL (DROP+CREATE), got %d: %+v", len(got), got)
	}
	bySev := map[string]int{}
	for _, a := range got {
		bySev[a.Severity]++
	}
	if bySev[SeverityHigh] != 1 || bySev[SeverityLow] != 1 {
		t.Fatalf("severity classification wrong: %+v", bySev)
	}
}

func TestSchemaChurnNoDML(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 20, TypeName: "QUERY", Summary: "DROP TABLE t"},
	}); err != nil {
		t.Fatal(err)
	}
	got, _ := SchemaChurn{}.Detect(s, fid, Thresholds{})
	if len(got) != 0 {
		t.Fatalf("schema_churn must not fire when file has no DML, got %d", len(got))
	}
}
