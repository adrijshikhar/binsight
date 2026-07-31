package conformance

// L2 — cross-adapter oracle (version-testing spec §7). Decode each MySQL ROW
// fixture with BOTH go-mysql and mysqlbinlog ONCE, index by position, then assert
// the HEADER layer agrees at every event position. Decoded-layer differences are
// out of scope here — that layer is best-effort/partial-confidence for the text
// adapter (GTID rendering, row-image shapes). Skips cleanly when mysqlbinlog is
// absent so CI runners without the client stay green.

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/mysqlbinlog"
	"github.com/adrijshikhar/binsight/internal/schema"
)

func TestL2CrossAdapterHeaderAgreement(t *testing.T) {
	m := loadCorpus(t)

	// Resolve mysqlbinlog via BV_MYSQLBINLOG or PATH (New("") → PATH). Skip if
	// it can't be spawned.
	mbl := mysqlbinlog.New(os.Getenv("BV_MYSQLBINLOG"))
	if _, err := mbl.Available(); err != nil {
		t.Skipf("mysqlbinlog not installed — skipping L2: %v", err)
	}

	for _, f := range m.Fixtures {
		f := f
		t.Run(f.Path, func(t *testing.T) {
			if !f.IsMySQLRow() {
				t.Skip("not a MySQL ROW fixture — out of L2 scope")
			}
			// The text adapter can't read pre-5.6 V1 binlogs (modern mysqlbinlog
			// errors on the old log format); skip those rather than half-compare.
			if !mbl.Supports(f.ServerVersion) {
				t.Skipf("mysqlbinlog does not support %s (V1 row format) — go-mysql-only", f.ServerVersion)
			}
			path := filepath.Join(corpusRoot, f.Path)

			// One go-mysql pass + one mysqlbinlog spawn, then zip by position —
			// NOT a Diff (and a mysqlbinlog spawn) per event.
			ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			goEvs := decodeAll(t, path)
			mblByPos := decodeByPos(t, ctx, mbl, path)

			var mismatches, compared, skipped int
			for _, ge := range goEvs {
				me, ok := mblByPos[ge.Header.Pos]
				if !ok {
					skipped++
					t.Logf("pos %d: mysqlbinlog produced no event", ge.Header.Pos)
					continue
				}
				compared++
				for _, d := range headerDiffs(ge.Header, me.Header) {
					mismatches++
					t.Errorf("pos %d: header %s", ge.Header.Pos, d)
				}
			}
			t.Logf("%s: %d events — header mismatches=%d, compared=%d, skipped=%d",
				f.Path, len(goEvs), mismatches, compared, skipped)

			// Guard against a vacuous pass: events present but none comparable
			// means the oracle asserted nothing (e.g. an incompatible binary).
			if len(goEvs) > 0 && compared == 0 {
				t.Errorf("mysqlbinlog matched none of %d positions — oracle asserted nothing", len(goEvs))
			}
		})
	}
}

// decodeByPos fully decodes a fixture with one adapter and indexes events by Pos.
// A mid-stream error (text adapter surfaces parse errors after buffering) stops
// iteration but keeps what was decoded — unmatched positions become skips.
func decodeByPos(t *testing.T, ctx context.Context, dec adapter.Decoder, path string) map[uint64]*schema.Event {
	t.Helper()
	st, err := dec.Decode(ctx, adapter.Source{Path: path}, adapter.DecodeOpts{})
	if err != nil {
		t.Fatalf("%s decode %s: %v", dec.Name(), path, err)
	}
	defer st.Close()
	byPos := map[uint64]*schema.Event{}
	for {
		ev, err := st.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Logf("%s decode %s: stream error after %d events: %v", dec.Name(), path, len(byPos), err)
			break
		}
		byPos[ev.Header.Pos] = ev
	}
	return byPos
}

// headerDiffs returns descriptions of any disagreeing header fields. Pos is the
// map key so it always agrees; ts is advisory for the text adapter and excluded.
func headerDiffs(a, b schema.Header) []string {
	var d []string
	if a.TypeCode != b.TypeCode {
		d = append(d, fmt.Sprintf("type_code: go-mysql=0x%02X mysqlbinlog=0x%02X", a.TypeCode, b.TypeCode))
	}
	if a.TypeName != b.TypeName {
		d = append(d, fmt.Sprintf("type_name: go-mysql=%s mysqlbinlog=%s", a.TypeName, b.TypeName))
	}
	if a.ServerID != b.ServerID {
		d = append(d, fmt.Sprintf("server_id: go-mysql=%d mysqlbinlog=%d", a.ServerID, b.ServerID))
	}
	if a.Size != b.Size {
		d = append(d, fmt.Sprintf("size: go-mysql=%d mysqlbinlog=%d", a.Size, b.Size))
	}
	if a.NextPos != b.NextPos {
		d = append(d, fmt.Sprintf("next_pos: go-mysql=%d mysqlbinlog=%d", a.NextPos, b.NextPos))
	}
	return d
}
