package server

import (
	"context"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/indexer"
	"github.com/adrijshikhar/binsight/internal/store"
)

// corpus55Server indexes the 5.5 corpus binlog (no FULL row metadata) and runs
// the schema-build pass so persisted column names are available for enrichment.
// Returns the server, its live httptest server, and the indexed file id.
func corpus55Server(t *testing.T) (*Server, *httptest.Server, int64) {
	t.Helper()
	root := repoRoot(t)
	path := filepath.Join(root, "internal", "testdata", "corpus", "5.5", "mysql-5.5.binlog")
	if _, err := os.Stat(path); err != nil {
		t.Skip("corpus fixture mysql-5.5.binlog not present")
	}

	st, err := store.Open(filepath.Join(t.TempDir(), "enrich.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })

	cfg, _ := config.Load(st, func(string) string { return "" })
	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	_ = reg.SetRole(adapter.RoleIndexer, "go-mysql")
	_ = reg.SetRole(adapter.RoleDetail, "go-mysql")
	srv := New(st, reg, cfg)

	f := &store.File{Path: path, MagicOK: true, State: store.FileStateIndexing}
	if err := st.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if err := indexer.New(st, gomysql.New()).IndexFile(context.Background(), f, nil); err != nil {
		t.Fatal(err)
	}
	if err := srv.buildSchema(f.ID, path); err != nil {
		t.Fatalf("buildSchema: %v", err)
	}

	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return srv, ts, f.ID
}

// firstEventOfType returns the pos of the first event of typeName for fileID.
func firstEventOfType(t *testing.T, ts *httptest.Server, fileID int64, typeName string) int64 {
	t.Helper()
	var page store.EventPage
	get(t, ts, "/api/events?file="+itoa(fileID)+"&type="+typeName+"&limit=200", &page)
	for _, e := range page.Events {
		if e.TableName == "types_all" {
			return e.Pos
		}
	}
	if len(page.Events) > 0 {
		return page.Events[0].Pos
	}
	t.Fatalf("no %s event found for file %d", typeName, fileID)
	return 0
}

// TestEventDetailEnrichesColumnNamesFromSchema verifies that for a 5.5 binlog
// (no FULL metadata) the detail handler fills decoded.column_names from the
// persisted schema when the column counts match. The corpus TABLE_MAP for
// corpus.types_all carries 17 column types but no names; we persist a matching
// 17-column schema (the pre-ALTER layout, "id" first) so the count guard passes,
// then assert the handler returns names equal in length and starting with "id".
func TestEventDetailEnrichesColumnNamesFromSchema(t *testing.T) {
	srv, ts, fid := corpus55Server(t)
	pos := firstEventOfType(t, ts, fid, "TABLE_MAP")

	// The folded schema is the post-ALTER 18-column layout, which does NOT match
	// the 17-column TABLE_MAP. Seed a matching 17-column schema so enrichment can
	// run; this exercises the same handler path the API uses.
	full := []store.SchemaColumn{}
	for i, name := range []string{
		"id", "tiny", "big", "ubig", "dec", "f", "d", "ch", "vc", "vc2",
		"dt", "datetime", "ts", "blob1", "blob2", "enum1", "set1",
	} {
		full = append(full, store.SchemaColumn{Ordinal: i, Name: name, DataType: "X", IsPK: i == 0})
	}
	if err := srv.store.UpsertTableSchema(fid, "corpus", "types_all", full, "full"); err != nil {
		t.Fatal(err)
	}

	var detail map[string]any
	get(t, ts, "/api/events/"+itoa(fid)+"/"+itoa(pos), &detail)
	dec, ok := detail["decoded"].(map[string]any)
	if !ok {
		t.Fatalf("no decoded layer: %v", detail)
	}
	types, _ := dec["column_types"].([]any)
	names, ok := dec["column_names"].([]any)
	if !ok || len(names) == 0 {
		t.Fatalf("expected enriched column_names, got %v", dec["column_names"])
	}
	if len(types) == 0 || len(names) != len(types) {
		t.Fatalf("column_names len %d must equal column_types len %d", len(names), len(types))
	}
	if names[0] != "id" {
		t.Fatalf("expected first column name id, got %v", names[0])
	}
}

// TestEnrichColumnNamesCountMismatchGuard verifies the count guard: a table
// with no persisted schema (or a mismatched column count) leaves column_names
// empty. We synthesize a decoded event whose db/table has no schema row.
func TestEnrichColumnNamesCountMismatchGuard(t *testing.T) {
	srv, _, fid := corpus55Server(t)

	cols, err := srv.store.GetColumns(fid, "corpus", "types_all")
	if err != nil {
		t.Fatal(err)
	}
	if len(cols) == 0 {
		t.Fatal("expected a persisted schema for corpus.types_all")
	}

	// A column count that does not match the schema must leave names empty.
	if got := schemaColumnNames(srv.store, fid, "corpus", "types_all", len(cols)+1); got != nil {
		t.Fatalf("mismatched count must yield nil names, got %v", got)
	}
	// A matching count returns the names.
	if got := schemaColumnNames(srv.store, fid, "corpus", "types_all", len(cols)); len(got) != len(cols) || got[0] != "id" {
		t.Fatalf("matching count must yield names starting with id, got %v", got)
	}
	// A table with no schema at all must also leave names empty.
	if got := schemaColumnNames(srv.store, fid, "corpus", "no_such_table", 5); got != nil {
		t.Fatalf("unknown table must yield nil names, got %v", got)
	}
}
