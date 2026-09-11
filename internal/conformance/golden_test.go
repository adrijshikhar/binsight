package conformance

// L3 — curated golden snapshots (version-testing spec §7). For each MySQL ROW
// fixture, snapshot the normalized event stream (exact header + canonical
// decoded layer + confidence) to a committed golden JSON and assert byte-equal.
// This catches any unintended change in the decode output across refactors.
//
// Native is intentionally excluded from the snapshot (adapter-coupled, brittle).
// Determinism: the golden compares against the SAME committed fixture bytes, the
// struct field order is fixed, and there are no maps or wall-clock values — the
// event ts comes from the binlog itself.
//
// Regenerate after an intended decode change:
//   go test ./internal/conformance/ -run L3 -update

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/adrijshikhar/binsight/internal/schema"
)

var updateGoldens = flag.Bool("update", false, "rewrite L3 golden snapshots")

const goldenDir = "../testdata/corpus/golden"

// goldenEvent is the deterministic, adapter-agnostic snapshot of one event.
type goldenEvent struct {
	Header     schema.Header   `json:"header"`
	Confidence string          `json:"decode_confidence"`
	Decoded    *schema.Decoded `json:"decoded,omitempty"`
	Error      string          `json:"error,omitempty"`
}

func snapshot(evs []*schema.Event) ([]byte, error) {
	out := make([]goldenEvent, len(evs))
	for i, ev := range evs {
		out[i] = goldenEvent{Header: ev.Header, Confidence: ev.Confidence, Decoded: ev.Decoded, Error: ev.Error}
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(b, '\n'), nil
}

func TestL3Goldens(t *testing.T) {
	m := loadCorpus(t)
	for _, f := range m.Fixtures {
		f := f
		t.Run(f.Path, func(t *testing.T) {
			// L3 snapshots go-mysql's decode, so it covers ALL ROW fixtures
			// (MySQL and MariaDB) — no second adapter needed (unlike L2).
			if !f.IsRow() {
				t.Skip("non-ROW fixture not curated for L3")
			}

			evs := decodeAll(t, filepath.Join(corpusRoot, f.Path))
			got, err := snapshot(evs)
			if err != nil {
				t.Fatalf("snapshot: %v", err)
			}
			// Golden key = the fixture's subdirectory (one fixture per dir, as
			// gen-corpus enforces via upsert). filepath.Base(Dir) keeps it flat.
			key := filepath.Base(filepath.Dir(f.Path)) // "8.0/mysql-8.0.binlog" -> "8.0"
			goldenPath := filepath.Join(goldenDir, key+".json")

			if *updateGoldens {
				if err := os.MkdirAll(goldenDir, 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(goldenPath, got, 0o644); err != nil {
					t.Fatal(err)
				}
				t.Logf("updated golden %s (%d events)", goldenPath, len(evs))
				return
			}

			want, err := os.ReadFile(goldenPath)
			if errors.Is(err, fs.ErrNotExist) {
				t.Skipf("golden %s missing — run: go test ./internal/conformance/ -run L3 -update", goldenPath)
			}
			if err != nil {
				t.Fatalf("read golden: %v", err)
			}
			normGot := normalizeGolden(got)
			normWant := normalizeGolden(want)
			if !bytes.Equal(normGot, normWant) {
				t.Errorf("golden mismatch for %s (regenerate with -update if intended):\n%s",
					f.Path, firstDiff(normWant, normGot))
			}
		})
	}
}

func normalizeGolden(b []byte) []byte {
	return bytes.ReplaceAll(b, []byte(`\ufffd`), []byte("\ufffd"))
}

// firstDiff returns the first differing line between want and got, for a compact
// failure message instead of dumping the whole snapshot.
func firstDiff(want, got []byte) string {
	w := strings.Split(string(want), "\n")
	g := strings.Split(string(got), "\n")
	n := len(w)
	if len(g) > n {
		n = len(g)
	}
	for i := 0; i < n; i++ {
		var wl, gl string
		if i < len(w) {
			wl = w[i]
		}
		if i < len(g) {
			gl = g[i]
		}
		if wl != gl {
			return fmt.Sprintf("  line %d:\n    want: %s\n    got:  %s", i+1, wl, gl)
		}
	}
	return "  (no line difference — trailing bytes differ)"
}
