// Package anomaly defines a pluggable Detector interface and an Engine that
// runs detectors over the committed SQLite index, emitting findings into the
// anomalies table. Detectors read only the index — no decode, no adapter
// coupling. New detectors are added in code by registering an implementation.
package anomaly

import (
	"github.com/adrijshikhar/binsight/internal/sqlkw"
	"github.com/adrijshikhar/binsight/internal/store"
)

// Severity ranks findings (string consts; stored verbatim in the index).
// Phase-1 detectors emit high/medium/low; critical is reserved for future
// detectors (e.g. schema-aware cascade risk) and accepted across the API/UI.
const (
	SeverityCritical = "critical"
	SeverityHigh     = "high"
	SeverityMedium   = "medium"
	SeverityLow      = "low"
)

// Thresholds are the configurable knobs (mirrored into config.Config.Anomaly).
type Thresholds struct {
	TxnBytes   int64 `json:"txn_bytes"`   // huge_txn_bytes: end_pos-start_pos
	TxnRows    int64 `json:"txn_rows"`    // huge_txn_rows: i+u+d
	TxnSeconds int64 `json:"txn_seconds"` // long_txn: commit_ts-start_ts
	EventRows  int64 `json:"event_rows"`  // bulk_row_event: single-event rows_count
}

// DefaultThresholds ships sensible absolute defaults (design §4).
func DefaultThresholds() Thresholds {
	return Thresholds{
		TxnBytes:   1 << 30, // 1 GiB
		TxnRows:    100_000,
		TxnSeconds: 60,
		EventRows:  50_000,
	}
}

// Detector is implemented by each anomaly rule. Detect reads the index for one
// file and returns findings (never persists — the Engine does that).
type Detector interface {
	Name() string
	Detect(s *store.Store, fileID int64, t Thresholds) ([]*store.Anomaly, error)
}

// classifyDDL maps a DDL SQL string to a severity by leading keyword.
// DROP/TRUNCATE → high, ALTER → medium, CREATE → low. ok=false if not DDL.
// Keyword detection (whole-word, so "DROPPED"/"ALTERATION" don't match) is
// shared via sqlkw.Leading, so this is safe to call on input not pre-filtered
// by store.DDLEvents. RENAME is DDL but intentionally left unclassified here
// (no severity mapping), matching the prior behavior.
func classifyDDL(sql string) (string, bool) {
	switch sqlkw.Leading(sql) {
	case "DROP", "TRUNCATE":
		return SeverityHigh, true
	case "ALTER":
		return SeverityMedium, true
	case "CREATE":
		return SeverityLow, true
	}
	return "", false
}
