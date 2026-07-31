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

// fixturePath resolves internal/testdata/<rel> relative to this source file.
func fixturePath(t *testing.T, rel string) string {
	t.Helper()
	_, self, _, _ := runtime.Caller(0)
	p := filepath.Join(filepath.Dir(self), "..", "testdata", rel)
	if _, err := os.Stat(p); err != nil {
		t.Skipf("fixture %s not present", rel)
	}
	return p
}

func newIndexerStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "ix.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func indexFixture(t *testing.T, s *store.Store, path string) *store.File {
	t.Helper()
	f := &store.File{Path: path, MagicOK: true, State: store.FileStateIndexing}
	if fi, err := os.Stat(path); err == nil {
		f.Size = fi.Size()
	}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if err := New(s, gomysql.New()).IndexFile(context.Background(), f, nil); err != nil {
		t.Fatalf("IndexFile: %v", err)
	}
	return f
}

// A quiescent file (all txns committed, trailing ROTATE/STOP) must finish with
// the boundary at the END of the file — trailing standalone events advance it.
// Anything less re-appends forever once ScanAndIndex starts honoring it.
func TestBoundaryQuiescentFileIsFileEnd(t *testing.T) {
	s := newIndexerStore(t)
	path := fixturePath(t, "binlog.000002")
	f := indexFixture(t, s, path)

	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if f.LastIndexedOffset != fi.Size() {
		t.Fatalf("quiescent boundary = %d, want file size %d", f.LastIndexedOffset, fi.Size())
	}
}

// A file truncated mid-transaction (commit event missing) must finish with the
// boundary at the OPEN txn's StartPos — the whole txn re-decodes next pass.
func TestBoundaryOpenTxnAtEOF(t *testing.T) {
	s := newIndexerStore(t)
	src := fixturePath(t, "binlog.000002")

	// Learn a committed txn's commit-event position from a full index.
	full := indexFixture(t, s, src)
	txns, err := s.ListTxns(full.ID)
	if err != nil {
		t.Fatal(err)
	}
	var target *store.Txn
	for _, tx := range txns {
		if tx.Status == "committed" {
			target = tx
		}
	}
	if target == nil {
		t.Skip("fixture has no committed txn")
	}
	// The commit event is the one ending at the txn's EndPos; cut at its START
	// so the txn is left open (BEGIN/rows present, commit missing).
	var cutAt int64
	page, err := s.QueryEvents(store.EventFilter{FileID: full.ID, Limit: 1000})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range page.Events {
		if e.EndPos == target.EndPos {
			cutAt = e.Pos
		}
	}
	if cutAt == 0 {
		t.Skip("could not locate the commit event")
	}

	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	trunc := filepath.Join(t.TempDir(), "trunc.binlog")
	if err := os.WriteFile(trunc, data[:cutAt], 0o644); err != nil {
		t.Fatal(err)
	}

	f := indexFixture(t, s, trunc)
	if f.LastIndexedOffset != target.StartPos {
		t.Fatalf("open-txn boundary = %d, want txn StartPos %d", f.LastIndexedOffset, target.StartPos)
	}
	// And its committed rows must NOT be in the stats (per-commit aggregation):
	// total inserts of the truncated index must be <= total of the full index.
	// (Strict per-table equality is the conformance oracle's job, Task 5.)
}

func TestIndexFixture(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "ix.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	f := &store.File{Path: fixturePath(t, "binlog.000002"), MagicOK: true, State: store.FileStateIndexing}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}

	ix := New(s, gomysql.New())
	if err := ix.IndexFile(context.Background(), f, nil); err != nil {
		t.Fatal(err)
	}

	got, _ := s.GetFile(f.ID)
	if got.State != store.FileStateReady {
		t.Fatalf("file state = %q", got.State)
	}
	if got.ServerVersion == "" || got.FormatVersion != 4 {
		t.Fatalf("file metadata not captured: %+v", got)
	}

	page, err := s.QueryEvents(store.EventFilter{FileID: f.ID, Limit: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total < 20 {
		t.Fatalf("expected >=20 events, got %d", page.Total)
	}

	txns, err := s.ListTxns(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(txns) < 5 {
		t.Fatalf("expected >=5 txns, got %d", len(txns))
	}
	committed := 0
	for _, tx := range txns {
		if tx.Status == "committed" {
			committed++
		}
		if tx.Status == "incomplete" {
			t.Fatalf("fixture must have no incomplete txns: %+v", tx)
		}
	}
	if committed < 5 {
		t.Fatalf("expected >=5 committed, got %d", committed)
	}

	rowEvents, err := s.QueryEvents(store.EventFilter{FileID: f.ID, TypeNames: []string{"WRITE_ROWS_V2"}, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range rowEvents.Events {
		if e.TxnID == 0 {
			t.Fatalf("rows event missing txn: %+v", e)
		}
		if e.TableName == "" {
			t.Fatalf("rows event missing table: %+v", e)
		}
	}

	stats, err := s.ListTableStats(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	var sal *store.TableStat
	for _, st := range stats {
		if st.TableName == "sal" {
			sal = st
		}
	}
	if sal == nil || sal.Inserts < 5 || sal.RowsTotal < 5 {
		t.Fatalf("test.sal aggregation wrong: %+v", sal)
	}
	if sal.ColumnTypesJSON == "[]" {
		t.Fatal("column types not captured from TABLE_MAP")
	}
}

// Two-pass (prefix full-index, then IndexAppend of the rest) must equal a
// single full index: same events, same committed txns, same stats, same
// boundary. Single-fixture smoke; the all-fixture oracle is the
// append-conformance test.
func TestIndexAppendEqualsFull(t *testing.T) {
	src := fixturePath(t, "binlog.000002")
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}

	// Reference: single full pass.
	sA := newIndexerStore(t)
	fA := indexFixture(t, sA, src)

	// Pick a mid-file committed boundary from the reference index.
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
		t.Skip("need >=2 committed txns to split")
	}
	cut := committed[len(committed)/2].EndPos

	// Two-pass: full-index the prefix, append the rest, IndexAppend.
	sB := newIndexerStore(t)
	grown := filepath.Join(t.TempDir(), "grow.binlog")
	if err := os.WriteFile(grown, data[:cut], 0o644); err != nil {
		t.Fatal(err)
	}
	fB := indexFixture(t, sB, grown)
	if fB.LastIndexedOffset != cut {
		t.Fatalf("prefix boundary = %d, want cut %d", fB.LastIndexedOffset, cut)
	}
	if err := os.WriteFile(grown, data, 0o644); err != nil { // grow to full content
		t.Fatal(err)
	}
	fB.Size = int64(len(data))
	if _, err := New(sB, gomysql.New()).IndexAppend(context.Background(), fB, nil); err != nil {
		t.Fatalf("IndexAppend: %v", err)
	}

	assertIndexesEqual(t, sA, fA.ID, sB, fB.ID)
	if fB.LastIndexedOffset != fA.LastIndexedOffset {
		t.Fatalf("boundary: two-pass %d, full %d", fB.LastIndexedOffset, fA.LastIndexedOffset)
	}
}

// assertIndexesEqual compares two file indexes ignoring AUTOINCREMENT ids.
// events.txn_id references txns.id, which differs between DBs — normalize it
// to the txn's ordinal (by start_pos) before comparing.
func assertIndexesEqual(t *testing.T, sA *store.Store, fidA int64, sB *store.Store, fidB int64) {
	t.Helper()
	txnOrdinals := func(s *store.Store, fid int64) (map[int64]int, []*store.Txn) {
		txns, err := s.ListTxns(fid)
		if err != nil {
			t.Fatal(err)
		}
		ord := map[int64]int{}
		for i, tx := range txns {
			ord[tx.ID] = i + 1
		}
		return ord, txns
	}
	ordA, txnsA := txnOrdinals(sA, fidA)
	ordB, txnsB := txnOrdinals(sB, fidB)

	if len(txnsA) != len(txnsB) {
		t.Fatalf("txn count: full %d, two-pass %d", len(txnsA), len(txnsB))
	}
	for i := range txnsA {
		a, b := txnsA[i], txnsB[i]
		if a.GTID != b.GTID || a.StartPos != b.StartPos || a.EndPos != b.EndPos ||
			a.Status != b.Status || a.EventCount != b.EventCount ||
			a.RowsInserted != b.RowsInserted || a.RowsUpdated != b.RowsUpdated ||
			a.RowsDeleted != b.RowsDeleted || a.StartTS != b.StartTS || a.CommitTS != b.CommitTS {
			t.Fatalf("txn %d differs:\n full: %+v\n 2pass: %+v", i, a, b)
		}
	}

	evs := func(s *store.Store, fid int64) []*store.EventRow {
		page, err := s.QueryEvents(store.EventFilter{FileID: fid, Limit: 1000})
		if err != nil {
			t.Fatal(err)
		}
		out := page.Events
		for page.NextCursor > 0 {
			page, err = s.QueryEvents(store.EventFilter{FileID: fid, Limit: 1000, Cursor: page.NextCursor})
			if err != nil {
				t.Fatal(err)
			}
			out = append(out, page.Events...)
		}
		return out
	}
	evA, evB := evs(sA, fidA), evs(sB, fidB)
	if len(evA) != len(evB) {
		t.Fatalf("event count: full %d, two-pass %d", len(evA), len(evB))
	}
	for i := range evA {
		a, b := evA[i], evB[i]
		if a.Pos != b.Pos || a.EndPos != b.EndPos || a.TypeName != b.TypeName ||
			a.Size != b.Size || a.TS != b.TS || a.ServerID != b.ServerID ||
			a.DBName != b.DBName || a.TableName != b.TableName ||
			a.RowsCount != b.RowsCount || a.Summary != b.Summary ||
			a.Confidence != b.Confidence || ordA[a.TxnID] != ordB[b.TxnID] {
			t.Fatalf("event %d differs:\n full: %+v (txn ord %d)\n 2pass: %+v (txn ord %d)",
				i, a, ordA[a.TxnID], b, ordB[b.TxnID])
		}
	}

	statsOf := func(s *store.Store, fid int64) map[string]store.TableStat {
		list, err := s.ListTableStats(fid)
		if err != nil {
			t.Fatal(err)
		}
		m := map[string]store.TableStat{}
		for _, st := range list {
			c := *st
			c.ID, c.FileID = 0, 0
			m[st.DBName+"."+st.TableName] = c
		}
		return m
	}
	stA, stB := statsOf(sA, fidA), statsOf(sB, fidB)
	if len(stA) != len(stB) {
		t.Fatalf("table-stat count: full %d, two-pass %d", len(stA), len(stB))
	}
	for k, a := range stA {
		if b, ok := stB[k]; !ok || a != b {
			t.Fatalf("stats for %s differ:\n full: %+v\n 2pass: %+v", k, a, stB[k])
		}
	}
}
