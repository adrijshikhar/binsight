package server

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/store"
)

// growServer builds a server with the real gomysql indexer whose WatchDir
// contains a prefix copy of a corpus fixture, returns it with the fixture's
// full bytes and the cut point (a committed boundary) for growing it later.
func growServer(t *testing.T) (*Server, *store.Store, string, []byte, int64) {
	t.Helper()
	root := repoRoot(t)
	src := filepath.Join(root, "internal", "testdata", "corpus", "5.5", "mysql-5.5.binlog")
	data, err := os.ReadFile(src)
	if err != nil {
		t.Skip("corpus fixture mysql-5.5.binlog not present")
	}

	st, err := store.Open(filepath.Join(t.TempDir(), "grow.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	cfg, _ := config.Load(st, func(string) string { return "" })
	cfg.WatchDir = t.TempDir()
	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	_ = reg.SetRole(adapter.RoleIndexer, "go-mysql")
	_ = reg.SetRole(adapter.RoleDetail, "go-mysql")
	srv := New(st, reg, cfg)

	// Full-index the whole fixture once (throwaway store) to learn a committed
	// mid-file cut point: reuse the indexer-level approach via the server's own
	// scan on the full file, then read txns.
	path := filepath.Join(cfg.WatchDir, "binlog.000001")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	f, err := st.GetFileByPath(path)
	if err != nil {
		t.Fatal(err)
	}
	txns, err := st.ListTxns(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	var cut int64
	for _, tx := range txns {
		if tx.Status == "committed" && tx.EndPos < int64(len(data)) {
			cut = tx.EndPos // last committed end below file end
		}
	}
	if cut == 0 {
		t.Skip("no usable committed cut point")
	}
	// Reset to the prefix state: shrink the file and force a full re-index so
	// the store reflects exactly the prefix with a clean boundary.
	if err := os.WriteFile(path, data[:cut], 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil { // size changed → full re-index (shrunk)
		t.Fatal(err)
	}
	return srv, st, path, data, cut
}

// Growing a ready file must take the APPEND branch: prefix event rows keep
// their AUTOINCREMENT ids (a full re-index would re-insert them with new ids).
func TestScanAppendsPreservesPrefixRows(t *testing.T) {
	srv, st, path, data, cut := growServer(t)
	f, err := st.GetFileByPath(path)
	if err != nil {
		t.Fatal(err)
	}
	if f.State != store.FileStateReady || f.LastIndexedOffset != cut {
		t.Fatalf("precondition: ready at boundary %d, got state=%s offset=%d", cut, f.State, f.LastIndexedOffset)
	}
	before, err := st.QueryEvents(store.EventFilter{FileID: f.ID, Limit: 1})
	if err != nil || len(before.Events) == 0 {
		t.Fatalf("no prefix events: %v", err)
	}
	firstID := before.Events[0].ID

	if err := os.WriteFile(path, data, 0o644); err != nil { // grow
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}

	f2, err := st.GetFileByPath(path)
	if err != nil {
		t.Fatal(err)
	}
	if f2.State != store.FileStateReady {
		t.Fatalf("file not ready after append: %s (%s)", f2.State, f2.Error)
	}
	if f2.LastIndexedOffset != int64(len(data)) {
		t.Fatalf("boundary after append = %d, want file end %d", f2.LastIndexedOffset, len(data))
	}
	after, err := st.QueryEvents(store.EventFilter{FileID: f2.ID, Limit: 1})
	if err != nil || len(after.Events) == 0 {
		t.Fatal(err)
	}
	if after.Events[0].ID != firstID {
		t.Fatalf("prefix event row id changed (%d → %d) — full re-index ran instead of append",
			firstID, after.Events[0].ID)
	}
}

// A shrunk file must NOT take the append branch — full re-index (ids change).
func TestScanShrunkFileFullReindexes(t *testing.T) {
	srv, st, path, data, cut := growServer(t)
	f, _ := st.GetFileByPath(path)
	before, err := st.QueryEvents(store.EventFilter{FileID: f.ID, Limit: 1})
	if err != nil || len(before.Events) == 0 {
		t.Fatal(err)
	}
	firstID := before.Events[0].ID

	smaller := cut - (cut / 4) // shrink below the boundary (arbitrary, > 4)
	// Find an event boundary <= smaller so the truncated file parses cleanly.
	page, err := st.QueryEvents(store.EventFilter{FileID: f.ID, Limit: 1000})
	if err != nil {
		t.Fatal(err)
	}
	var cutAt int64
	for _, e := range page.Events {
		if e.EndPos <= smaller {
			cutAt = e.EndPos
		}
	}
	if cutAt <= 4 {
		t.Skip("no usable shrink point")
	}
	if err := os.WriteFile(path, data[:cutAt], 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	after, err := st.QueryEvents(store.EventFilter{FileID: f.ID, Limit: 1})
	if err != nil || len(after.Events) == 0 {
		t.Fatal(err)
	}
	if after.Events[0].ID == firstID {
		t.Fatal("shrunk file kept old row ids — append branch ran where full re-index was required")
	}
}

// Appending a tail that contains DDL must rebuild the schema: the 5.5 fixture
// ALTERs types_all (adds added_col) — cut BEFORE the ALTER, append, and the
// folded schema must show the post-ALTER column count.
func TestScanAppendDDLTailRebuildsSchema(t *testing.T) {
	srv, st, path, data, _ := growServer(t)
	// Locate the ALTER event in the indexed prefix-or-full data: re-grow fully
	// first so the events table has the ALTER, find its pos, then reset to a
	// prefix cut BEFORE it at the last committed boundary.
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	f, _ := st.GetFileByPath(path)
	page, err := st.QueryEvents(store.EventFilter{FileID: f.ID, Q: "ALTER", Limit: 10})
	if err != nil || len(page.Events) == 0 {
		t.Skip("fixture has no ALTER event")
	}
	alterPos := page.Events[0].Pos
	txns, _ := st.ListTxns(f.ID)
	var cut int64
	for _, tx := range txns {
		if tx.Status == "committed" && tx.EndPos <= alterPos {
			cut = tx.EndPos
		}
	}
	if cut <= 4 {
		t.Skip("no committed boundary before the ALTER")
	}
	if err := os.WriteFile(path, data[:cut], 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil { // full re-index of prefix (shrunk)
		t.Fatal(err)
	}
	preCols, _ := st.TableColumnCount(f.ID, "corpus", "types_all")

	if err := os.WriteFile(path, data, 0o644); err != nil { // grow: tail has the ALTER
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	postCols, ok := st.TableColumnCount(f.ID, "corpus", "types_all")
	if !ok || postCols <= preCols {
		t.Fatalf("schema not rebuilt after DDL tail: pre=%d post=%d ok=%v", preCols, postCols, ok)
	}
}
