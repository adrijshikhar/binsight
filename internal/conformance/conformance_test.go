// Package conformance runs the multi-version oracle matrix over the committed
// corpus fixtures (internal/testdata/corpus). It is part of the normal `go test`
// path and needs NO Docker: it validates already-generated, committed bytes.
//
// When the corpus is empty (fixtures not yet generated), every test skips
// cleanly so `go test ./...` stays green before the offline harness has run.
//
// Oracle layers (version-testing spec §7):
//
//	L1 — invariants   (implemented here): structural checks on every fixture.
//	L2 — cross-adapter (TODO phase 3):    go-mysql vs mysqlbinlog header agreement.
//	L3 — curated golden (TODO phase 3):   exact normalized-event snapshots.
package conformance

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/corpus"
	"github.com/adrijshikhar/binsight/internal/schema"
)

const corpusRoot = "../testdata/corpus"

// loadCorpus loads the manifest or skips the test if the corpus is absent/empty.
func loadCorpus(t *testing.T) *corpus.Manifest {
	t.Helper()
	m, err := corpus.Load(filepath.Join(corpusRoot, "manifest.json"))
	if errors.Is(err, fs.ErrNotExist) {
		t.Skip("corpus manifest not present — run `make corpus` (offline, Docker) to generate fixtures")
	}
	if err != nil {
		t.Fatalf("load manifest: %v", err)
	}
	if len(m.Fixtures) == 0 {
		t.Skip("corpus is empty — no fixtures generated yet")
	}
	return m
}

// decodeAll decodes a fixture fully via go-mysql and returns its events.
func decodeAll(t *testing.T, path string) []*schema.Event {
	t.Helper()
	dec := gomysql.New()
	st, err := dec.Decode(context.Background(), adapter.Source{Path: path}, adapter.DecodeOpts{})
	if err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	defer st.Close()
	var evs []*schema.Event
	for {
		ev, err := st.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatalf("decode %s: stream error: %v", path, err)
		}
		evs = append(evs, ev)
	}
	return evs
}

// TestL1Invariants runs the structural oracle over every committed fixture.
func TestL1Invariants(t *testing.T) {
	m := loadCorpus(t)
	for _, f := range m.Fixtures {
		f := f
		t.Run(f.Path, func(t *testing.T) {
			evs := decodeAll(t, filepath.Join(corpusRoot, f.Path))
			if len(evs) == 0 {
				t.Fatal("no events decoded")
			}

			// First event is FORMAT_DESCRIPTION at pos 4.
			if first := evs[0]; first.Header.Pos != 4 || first.Header.TypeName != "FORMAT_DESCRIPTION" {
				t.Errorf("first event = %s@%d, want FORMAT_DESCRIPTION@4", first.Header.TypeName, first.Header.Pos)
			}

			var prevNext uint64
			for i, ev := range evs {
				// No unknown type codes and no decode failures.
				if strings.HasPrefix(ev.Header.TypeName, "UNKNOWN_") {
					t.Errorf("event %d: unknown type %s", i, ev.Header.TypeName)
				}
				if ev.Confidence == schema.ConfidenceFailed {
					t.Errorf("event %d @%d: decode failed: %s", i, ev.Header.Pos, ev.Error)
				}
				// size == next_pos - pos.
				if ev.Header.NextPos != 0 && ev.Header.Size != 0 {
					if got := ev.Header.NextPos - ev.Header.Pos; got != uint64(ev.Header.Size) {
						t.Errorf("event %d @%d: size=%d but next_pos-pos=%d", i, ev.Header.Pos, ev.Header.Size, got)
					}
				}
				// pos chain contiguous: this.pos == prev.next_pos.
				if i > 0 && prevNext != 0 && ev.Header.Pos != prevNext {
					t.Errorf("event %d: pos=%d but previous next_pos=%d (gap)", i, ev.Header.Pos, prevNext)
				}
				prevNext = ev.Header.NextPos
			}
		})
	}
}
