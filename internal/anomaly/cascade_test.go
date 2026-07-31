package anomaly

import (
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

// seedCascadeFK registers a parent users←child orders FK with the given
// on-delete action on the file.
func seedCascadeFK(t *testing.T, s *store.Store, fid int64, onDelete string) {
	t.Helper()
	if err := s.InsertFKeys(fid, []store.FKey{{
		ChildDB: "shop", ChildTable: "orders", ChildCols: "user_id",
		ParentDB: "shop", ParentTable: "users", ParentCols: "id",
		OnDelete: onDelete,
	}}); err != nil {
		t.Fatal(err)
	}
}

func TestCascadeRiskFlagsMissingChildDeletes(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	seedCascadeFK(t, s, fid, "CASCADE")
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 100, TypeName: "DELETE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "users", RowsCount: 1},
	}); err != nil {
		t.Fatal(err)
	}
	got, err := CascadeRisk{}.Detect(s, fid, Thresholds{})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 anomaly, got %d: %+v", len(got), got)
	}
	a := got[0]
	if a.Detector != "cascade_risk" || a.Severity != SeverityHigh {
		t.Errorf("detector/severity wrong: %+v", a)
	}
	if a.DBName != "shop" || a.TableName != "users" {
		t.Errorf("db/table wrong: %+v", a)
	}
	if a.TxnID != 1 || a.EventPos != 100 {
		t.Errorf("txn/pos wrong: %+v", a)
	}
}

func TestCascadeRiskSkipsAutocommitTxn0(t *testing.T) {
	// txn_id==0 (autocommit / GTID-off) is not analyzed: events share the
	// sentinel txn, so cross-statement matching would be unreliable. A parent
	// DELETE with no child must NOT be flagged here (vs txn>0 which IS flagged).
	s := newStore(t)
	fid := seedFile(t, s)
	seedCascadeFK(t, s, fid, "CASCADE")
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 100, TypeName: "DELETE_ROWS_V2", TxnID: 0, DBName: "shop", TableName: "users", RowsCount: 1},
	}); err != nil {
		t.Fatal(err)
	}
	got, err := CascadeRisk{}.Detect(s, fid, Thresholds{})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("autocommit (txn 0) deletes must be skipped, got %d: %+v", len(got), got)
	}
}

func TestCascadeRiskQuietWhenChildDeletesPresent(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	seedCascadeFK(t, s, fid, "CASCADE")
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 100, TypeName: "DELETE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "users", RowsCount: 1},
		{FileID: fid, Pos: 120, TypeName: "DELETE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "orders", RowsCount: 2},
	}); err != nil {
		t.Fatal(err)
	}
	got, err := CascadeRisk{}.Detect(s, fid, Thresholds{})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("child delete present in same txn → no anomaly, got %d: %+v", len(got), got)
	}
}

func TestCascadeRiskDedupesPerTxnChild(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	seedCascadeFK(t, s, fid, "CASCADE")
	// Two DELETE chunks on the parent (shop.users) in the same txn, no child
	// deletes on shop.orders → should still emit exactly ONE anomaly.
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 100, TypeName: "DELETE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "users", RowsCount: 1},
		{FileID: fid, Pos: 120, TypeName: "DELETE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "users", RowsCount: 1},
	}); err != nil {
		t.Fatal(err)
	}
	got, err := CascadeRisk{}.Detect(s, fid, Thresholds{})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("want exactly 1 deduped anomaly, got %d: %+v", len(got), got)
	}
}

func TestCascadeRiskIgnoresNonCascade(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	seedCascadeFK(t, s, fid, "RESTRICT")
	if err := s.InsertEvents([]*store.EventRow{
		{FileID: fid, Pos: 100, TypeName: "DELETE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "users", RowsCount: 1},
	}); err != nil {
		t.Fatal(err)
	}
	got, err := CascadeRisk{}.Detect(s, fid, Thresholds{})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("non-CASCADE FK → no anomaly, got %d: %+v", len(got), got)
	}
}
