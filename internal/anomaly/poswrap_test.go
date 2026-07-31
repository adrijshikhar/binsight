package anomaly

import (
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

// seedFileSize creates a file row with an explicit size.
func seedFileSize(t *testing.T, s *store.Store, size int64) int64 {
	t.Helper()
	f := &store.File{Path: "/data/big", MagicOK: true, State: store.FileStateReady, Size: size}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	return f.ID
}

// addTxnWithBytes inserts a committed txn plus events summing to trueBytes
// (split into chunks so each event size stays well under any limit), with the
// given wrapped start/end positions.
func addTxnWithBytes(t *testing.T, s *store.Store, fid, start, end, trueBytes int64) int64 {
	t.Helper()
	tx := &store.Txn{FileID: fid, StartPos: start, EndPos: end, Status: "committed"}
	id, err := s.InsertTxn(tx)
	if err != nil {
		t.Fatal(err)
	}
	const chunk int64 = 1 << 30 // 1 GiB per event row (only the size column matters here)
	pos := start
	remaining := trueBytes
	for remaining > 0 {
		sz := chunk
		if remaining < sz {
			sz = remaining
		}
		ev := &store.EventRow{FileID: fid, Pos: pos, EndPos: pos + sz, Size: sz,
			TypeName: "WRITE_ROWS_V2", TxnID: id}
		if err := s.InsertEvents([]*store.EventRow{ev}); err != nil {
			t.Fatal(err)
		}
		pos += sz
		remaining -= sz
	}
	return id
}

func findingsByDetector(as []*store.Anomaly, name string) []*store.Anomaly {
	var out []*store.Anomaly
	for _, a := range as {
		if a.Detector == name {
			out = append(out, a)
		}
	}
	return out
}

func TestPosWrapCleanFile(t *testing.T) {
	s := newStore(t)
	fid := seedFileSize(t, s, 800<<20) // 800 MiB, well under 4 GiB
	addTxnWithBytes(t, s, fid, 100, 100+(700<<20), 700<<20)
	got, err := PosWrap{}.Detect(s, fid, DefaultThresholds())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("clean sub-4GiB file must yield no pos_wrap findings, got %d: %+v", len(got), got)
	}
}

func TestPosWrapOversizeFileAndTxn(t *testing.T) {
	s := newStore(t)
	// 5.31 GiB file (mirrors the reproduced 5,704,288,226-byte case).
	const fileSize int64 = 5704288226
	fid := seedFileSize(t, s, fileSize)
	// One big txn: starts early (pos 377), wrapped end = size mod 2^32, true 5.3 GiB.
	wrappedEnd := fileSize % uint32Boundary // 1,409,320,930
	txID := addTxnWithBytes(t, s, fid, 377, wrappedEnd, fileSize)

	got, err := PosWrap{}.Detect(s, fid, DefaultThresholds())
	if err != nil {
		t.Fatal(err)
	}
	all := findingsByDetector(got, "pos_wrap")
	if len(all) != 2 {
		t.Fatalf("want 2 pos_wrap findings (file + txn), got %d: %+v", len(all), all)
	}
	var fileF, txnF *store.Anomaly
	for _, a := range all {
		if a.TxnID == 0 {
			fileF = a
		} else {
			txnF = a
		}
	}
	if fileF == nil || fileF.Severity != SeverityCritical || fileF.Metric != fileSize {
		t.Errorf("file finding wrong: %+v", fileF)
	}
	if txnF == nil || txnF.Severity != SeverityCritical || txnF.TxnID != txID || txnF.Metric != fileSize {
		t.Errorf("txn finding wrong: %+v", txnF)
	}
	// The txn finding must demonstrate the wrap: true bytes (metric) far exceed
	// the position span end_pos-start_pos.
	if txnF != nil && txnF.Metric <= (wrappedEnd-377) {
		t.Errorf("txn metric (true bytes %d) should exceed pos span %d", txnF.Metric, wrappedEnd-377)
	}
}

func TestPosWrapBoundaryExact(t *testing.T) {
	s := newStore(t)
	// File exactly at 2^32 wraps to position 0 — must flag.
	fid := seedFileSize(t, s, uint32Boundary)
	got, err := PosWrap{}.Detect(s, fid, DefaultThresholds())
	if err != nil {
		t.Fatal(err)
	}
	if len(findingsByDetector(got, "pos_wrap")) != 1 {
		t.Errorf("file at exactly 2^32 must yield the file-level finding, got %+v", got)
	}
}
