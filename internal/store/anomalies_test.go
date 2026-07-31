package store

import "testing"

func seedFile(t *testing.T, s *Store) int64 {
	t.Helper()
	f := &File{Path: "/data/binlog.000009", MagicOK: true, State: FileStateReady}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	return f.ID
}

func TestAnomaliesInsertListClear(t *testing.T) {
	s := newTestStore(t)
	fid := seedFile(t, s)

	in := []*Anomaly{
		{FileID: fid, Detector: "huge_txn_bytes", Severity: "high", TxnID: 3, Metric: 2 << 30, Threshold: 1 << 30, Message: "big"},
		{FileID: fid, Detector: "long_txn", Severity: "low", TxnID: 4, Metric: 90, Threshold: 60, Message: "slow", DetailJSON: "{}"},
		{FileID: fid, Detector: "schema_churn", Severity: "critical", EventPos: 1200, Message: "drop"},
	}
	if err := s.InsertAnomalies(in); err != nil {
		t.Fatal(err)
	}

	all, err := s.ListAnomalies(fid, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Fatalf("want 3, got %d", len(all))
	}
	if all[0].Severity != "critical" || all[1].Severity != "high" || all[2].Severity != "low" {
		t.Fatalf("severity order wrong: %v %v %v", all[0].Severity, all[1].Severity, all[2].Severity)
	}
	if all[0].TxnID != 0 || all[0].EventPos != 1200 {
		t.Fatalf("nullable round-trip wrong: %+v", all[0])
	}

	high, err := s.ListAnomalies(fid, "high")
	if err != nil {
		t.Fatal(err)
	}
	if len(high) != 1 || high[0].Detector != "huge_txn_bytes" {
		t.Fatalf("severity filter wrong: %+v", high)
	}

	if err := s.ClearAnomalies(fid); err != nil {
		t.Fatal(err)
	}
	after, err := s.ListAnomalies(fid, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != 0 {
		t.Fatalf("clear failed: %d remain", len(after))
	}
}

func TestAnomalyFileSummary(t *testing.T) {
	s := newTestStore(t)
	fid := seedFile(t, s)
	if err := s.InsertAnomalies([]*Anomaly{
		{FileID: fid, Detector: "a", Severity: "low", Message: "x"},
		{FileID: fid, Detector: "b", Severity: "high", Message: "y"},
		{FileID: fid, Detector: "c", Severity: "high", Message: "z"},
	}); err != nil {
		t.Fatal(err)
	}
	sum, err := s.AnomalyFileSummary()
	if err != nil {
		t.Fatal(err)
	}
	got := sum[fid]
	if got.Count != 3 || got.MaxSeverity != "high" {
		t.Fatalf("summary wrong: %+v", got)
	}
}
