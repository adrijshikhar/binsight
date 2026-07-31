package anomaly

import (
	"log"

	"github.com/adrijshikhar/binsight/internal/store"
)

// Engine holds registered detectors and runs them over the index.
type Engine struct {
	detectors []Detector
}

// New returns an Engine with the given detectors registered.
func New(detectors ...Detector) *Engine {
	return &Engine{detectors: append([]Detector(nil), detectors...)}
}

// DefaultEngine registers the six phase-1 detectors plus the schema-aware
// cascade_risk detector, which reasons over the parsed FK graph to flag silent
// InnoDB cascade deletes that never appear in the binlog.
func DefaultEngine() *Engine {
	return New(
		HugeTxnBytes{},
		HugeTxnRows{},
		LongTxn{},
		IncompleteTxn{},
		BulkRowEvent{},
		SchemaChurn{},
		CascadeRisk{},
		PosWrap{},
	)
}

// Register adds a detector (used by tests and future code-registered rules).
func (e *Engine) Register(d Detector) { e.detectors = append(e.detectors, d) }

// Run clears prior anomalies for fileID, runs every detector, and bulk-inserts
// the combined findings. A detector that errors is logged and skipped — one bad
// rule must not block the rest (mirrors the indexer's per-file resilience).
func (e *Engine) Run(s *store.Store, fileID int64, t Thresholds) error {
	if err := s.ClearAnomalies(fileID); err != nil {
		return err
	}
	var all []*store.Anomaly
	for _, d := range e.detectors {
		found, err := d.Detect(s, fileID, t)
		if err != nil {
			log.Printf("detector %s on file %d: %v", d.Name(), fileID, err)
			continue
		}
		all = append(all, found...)
	}
	return s.InsertAnomalies(all)
}
