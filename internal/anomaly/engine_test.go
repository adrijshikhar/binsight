package anomaly

import (
	"errors"
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

// fakeDetector emits a fixed number of findings (or errors).
type fakeDetector struct {
	name string
	n    int
	err  error
}

func (f fakeDetector) Name() string { return f.name }
func (f fakeDetector) Detect(s *store.Store, fileID int64, _ Thresholds) ([]*store.Anomaly, error) {
	if f.err != nil {
		return nil, f.err
	}
	out := make([]*store.Anomaly, f.n)
	for i := range out {
		out[i] = &store.Anomaly{FileID: fileID, Detector: f.name, Severity: SeverityLow, Message: "x"}
	}
	return out, nil
}

func TestEngineRunIdempotent(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	e := New(fakeDetector{name: "a", n: 2}, fakeDetector{name: "b", n: 1})

	if err := e.Run(s, fid, Thresholds{}); err != nil {
		t.Fatal(err)
	}
	first, _ := s.ListAnomalies(fid, "")
	if len(first) != 3 {
		t.Fatalf("want 3 after first run, got %d", len(first))
	}
	if err := e.Run(s, fid, Thresholds{}); err != nil {
		t.Fatal(err)
	}
	second, _ := s.ListAnomalies(fid, "")
	if len(second) != 3 {
		t.Fatalf("re-run not idempotent: got %d", len(second))
	}
}

func TestEngineSkipsErroringDetector(t *testing.T) {
	s := newStore(t)
	fid := seedFile(t, s)
	e := New(
		fakeDetector{name: "bad", err: errors.New("boom")},
		fakeDetector{name: "good", n: 2},
	)
	if err := e.Run(s, fid, Thresholds{}); err != nil {
		t.Fatalf("one bad detector must not fail the run: %v", err)
	}
	got, _ := s.ListAnomalies(fid, "")
	if len(got) != 2 {
		t.Fatalf("good detector findings should persist: got %d", len(got))
	}
}

func TestDefaultEngineRegistersAll(t *testing.T) {
	// six phase-1 detectors + cascade_risk + pos_wrap (uint32 end_log_pos
	// overflow on > 4 GiB files).
	if got := len(DefaultEngine().detectors); got != 8 {
		t.Fatalf("DefaultEngine should register 8 detectors, got %d", got)
	}
}
