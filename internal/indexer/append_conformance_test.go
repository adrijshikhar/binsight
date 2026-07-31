package indexer

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/store"
)

// TestAppendConformanceCorpus runs the two-pass-equals-full oracle over every
// corpus fixture: MySQL 5.5→8.4 and MariaDB. Flavor coverage matters — GTID-
// vs BEGIN-opened txns, MariaDB LogPos=0 inline events, checksum variants.
//
// Two cut modes per fixture exercise complementary code paths:
//
//   - committed-cut: cut at a committed txn's EndPos. The prefix index has NO
//     open tail (boundary == prefix end), so IndexAppend's DeleteIndexedFrom is
//     a no-op and txn ids are never renumbered.
//   - midtxn-cut: cut INSIDE the middle committed txn (at its commit event's
//     Pos), leaving that txn OPEN in the prefix. The prefix index then has an
//     incomplete txn row plus indexed open-tail events ≥ boundary. IndexAppend
//     MUST delete that tail (DeleteIndexedFrom) and re-insert it with NEW txn
//     AUTOINCREMENT ids — exercising the delete path and the txn-ordinal
//     normalization in assertIndexesEqual.
func TestAppendConformanceCorpus(t *testing.T) {
	_, self, _, _ := runtime.Caller(0)
	pattern := filepath.Join(filepath.Dir(self), "..", "testdata", "corpus", "*", "*.binlog")
	fixtures, err := filepath.Glob(pattern)
	if err != nil || len(fixtures) == 0 {
		t.Skip("no corpus fixtures present")
	}

	for _, fx := range fixtures {
		fx := fx
		name := filepath.Base(filepath.Dir(fx)) + "/" + filepath.Base(fx)
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(fx)
			if err != nil {
				t.Fatal(err)
			}

			// Reference: single full pass. Reused by both cut-mode subtests.
			sA := newIndexerStore(t)
			fA := indexFixture(t, sA, fx)

			txns, err := sA.ListTxns(fA.ID)
			if err != nil {
				t.Fatal(err)
			}
			var committed []*store.Txn
			for _, tx := range txns {
				if tx.Status == "committed" {
					committed = append(committed, tx)
				}
			}
			if len(committed) < 2 {
				t.Skipf("%s: %d committed txns, need >=2 to split", name, len(committed))
			}
			mid := committed[len(committed)/2]

			// committed-cut: prefix ends exactly at the middle txn's EndPos, so
			// the prefix has no open tail and the prefix boundary == cut.
			t.Run("committed-cut", func(t *testing.T) {
				cut := mid.EndPos
				if cut <= 4 || cut >= int64(len(data)) {
					t.Skipf("%s: unusable committed cut %d (file %d bytes)", name, cut, len(data))
				}
				runTwoPass(t, sA, fA, data, cut, cut)
			})

			// midtxn-cut: cut at the Pos of the middle txn's commit event so the
			// prefix ends with that txn OPEN. The prefix boundary is the txn's
			// StartPos and the prefix carries an incomplete txn + open-tail
			// events; IndexAppend must delete and re-insert them.
			t.Run("midtxn-cut", func(t *testing.T) {
				cut := commitEventPos(t, sA, fA.ID, mid)
				if cut == 0 {
					t.Skipf("%s: could not locate commit event for middle txn", name)
				}
				if cut <= 4 || cut >= int64(len(data)) {
					t.Skipf("%s: unusable midtxn cut %d (file %d bytes)", name, cut, len(data))
				}
				runTwoPass(t, sA, fA, data, cut, mid.StartPos)
			})
		})
	}
}

// commitEventPos finds, in store sA's events for file fid, the event whose
// EndPos == txn.EndPos (its commit event) and returns that event's Pos. Cutting
// the file there yields a clean event boundary that leaves the txn open. Returns
// 0 if not located.
func commitEventPos(t *testing.T, sA *store.Store, fid int64, txn *store.Txn) int64 {
	t.Helper()
	page, err := sA.QueryEvents(store.EventFilter{FileID: fid, Limit: 1000})
	if err != nil {
		t.Fatal(err)
	}
	events := page.Events
	for page.NextCursor > 0 {
		page, err = sA.QueryEvents(store.EventFilter{FileID: fid, Limit: 1000, Cursor: page.NextCursor})
		if err != nil {
			t.Fatal(err)
		}
		events = append(events, page.Events...)
	}
	for _, e := range events {
		if e.EndPos == txn.EndPos {
			return e.Pos
		}
	}
	return 0
}

// runTwoPass performs the two-pass-equals-full oracle for one cut:
//
//  1. Write data[:cut] to a fresh file, full-index it into a fresh store sB.
//  2. Assert the prefix boundary == wantPrefixBoundary (proves the intended
//     open/closed-tail setup actually happened).
//  3. Grow the file to full content, bump fB.Size, run IndexAppend.
//  4. Assert the two-pass index equals the reference full index (sA/fA) and the
//     final boundaries match.
//
// committed-cut passes wantPrefixBoundary == cut (no open tail). midtxn-cut
// passes wantPrefixBoundary == mid.StartPos (the middle txn is left open, so its
// tail must be deleted and re-inserted by IndexAppend).
func runTwoPass(t *testing.T, sA *store.Store, fA *store.File, data []byte, cut, wantPrefixBoundary int64) {
	t.Helper()

	sB := newIndexerStore(t)
	grown := filepath.Join(t.TempDir(), "grow.binlog")
	if err := os.WriteFile(grown, data[:cut], 0o644); err != nil {
		t.Fatal(err)
	}
	fB := indexFixture(t, sB, grown)
	if fB.LastIndexedOffset != wantPrefixBoundary {
		t.Fatalf("prefix boundary = %d, want %d", fB.LastIndexedOffset, wantPrefixBoundary)
	}

	if err := os.WriteFile(grown, data, 0o644); err != nil {
		t.Fatal(err)
	}
	fB.Size = int64(len(data))
	sawDDL, err := New(sB, gomysql.New()).IndexAppend(context.Background(), fB, nil)
	if err != nil {
		t.Fatalf("IndexAppend: %v", err)
	}
	_ = sawDDL // correctness of the flag is covered by the server task

	assertIndexesEqual(t, sA, fA.ID, sB, fB.ID)
	if fB.LastIndexedOffset != fA.LastIndexedOffset {
		t.Fatalf("boundary: two-pass %d, full %d", fB.LastIndexedOffset, fA.LastIndexedOffset)
	}
}
