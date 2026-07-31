package anomaly

import (
	"fmt"

	"github.com/adrijshikhar/binsight/internal/store"
)

// uint32Boundary is the value at which the binlog event header's uint32
// end_log_pos wraps (2^32). A single transaction is never split across binlog
// files, so a transaction larger than this forces a single file larger than
// this, and every event past the boundary carries a wrapped (small) position.
// This is a hard binlog-format limit, not a tunable threshold. See CLAUDE.md
// "Binlog format gotchas #1".
const uint32Boundary int64 = 1 << 32 // 4,294,967,296

// PosWrap flags the two symptoms of the uint32 end_log_pos overflow:
//   - a binlog FILE larger than 4 GiB (positions past 4 GiB are wrapped, so the
//     index, seek-resume, and committed boundary are unreliable for it), and
//   - a TRANSACTION whose true byte size (summed event lengths) is >= 4 GiB —
//     the ">= 4 GB transaction" that produced the oversized file. For such a
//     txn the position span (end_pos-start_pos) under-reports the true size by
//     a multiple of 2^32; that divergence is reported as evidence of the wrap.
//
// Severity critical: the index for these files cannot be trusted past 4 GiB
// and append-indexing will re-run every scan (it never reaches steady state)
// until the running-offset fix lands.
type PosWrap struct{}

func (PosWrap) Name() string { return "pos_wrap" }

func (PosWrap) Detect(s *store.Store, fileID int64, _ Thresholds) ([]*store.Anomaly, error) {
	f, err := s.GetFile(fileID)
	if err != nil {
		return nil, fmt.Errorf("pos_wrap get file: %w", err)
	}
	var out []*store.Anomaly

	// File-level: any file >= 4 GiB has wrapped positions past the boundary.
	if f.Size >= uint32Boundary {
		out = append(out, &store.Anomaly{
			FileID: fileID, Detector: "pos_wrap", Severity: SeverityCritical,
			Metric: f.Size, Threshold: uint32Boundary,
			Message: fmt.Sprintf(
				"binlog file is %d bytes (> 4 GiB): event end_log_pos is uint32 and wraps past %d — index positions, seek-resume, and the append boundary are unreliable beyond 4 GiB",
				f.Size, uint32Boundary),
		})
	}

	// Per-transaction: a txn whose TRUE byte size (summed event lengths,
	// wrap-immune) is >= 4 GiB. Report the position-span divergence as the
	// wrap signature.
	sizes, err := s.TxnByteSizes(fileID)
	if err != nil {
		return nil, fmt.Errorf("pos_wrap txn byte sizes: %w", err)
	}
	txns, err := s.ListTxns(fileID)
	if err != nil {
		return nil, fmt.Errorf("pos_wrap list txns: %w", err)
	}
	for _, tx := range txns {
		trueBytes := sizes[tx.ID]
		if trueBytes < uint32Boundary {
			continue
		}
		posSpan := tx.EndPos - tx.StartPos
		out = append(out, &store.Anomaly{
			FileID: fileID, Detector: "pos_wrap", Severity: SeverityCritical,
			TxnID: tx.ID, Metric: trueBytes, Threshold: uint32Boundary,
			Message: fmt.Sprintf(
				"transaction is %d bytes (>= 4 GiB) but its position span end_pos-start_pos = %d (under-reports by ~%d×2^32): uint32 end_log_pos wrapped — start/end positions for this txn are unreliable",
				trueBytes, posSpan, (trueBytes-posSpan)/uint32Boundary),
		})
	}
	return out, nil
}
