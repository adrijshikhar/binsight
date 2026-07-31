package server

import (
	"context"
	"io"
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/schema"
	"github.com/adrijshikhar/binsight/internal/store"
)

// scriptAdapter is a RoleIndexer stand-in that replays a fixed list of QUERY
// events, letting buildSchema be exercised with hand-crafted DDL (including a
// deliberately malformed statement) without a binlog fixture.
type scriptAdapter struct{ evs []*schema.Event }

func (a *scriptAdapter) Name() string { return "script" }
func (a *scriptAdapter) Capabilities() adapter.Capabilities {
	return adapter.Capabilities{FullScan: true}
}
func (a *scriptAdapter) Supports(string) bool { return true }
func (a *scriptAdapter) Decode(ctx context.Context, src adapter.Source, opts adapter.DecodeOpts) (adapter.EventStream, error) {
	return &scriptStream{evs: a.evs}, nil
}

type scriptStream struct {
	evs []*schema.Event
	i   int
}

func (s *scriptStream) Next() (*schema.Event, error) {
	if s.i >= len(s.evs) {
		return nil, io.EOF
	}
	ev := s.evs[s.i]
	s.i++
	return ev, nil
}
func (s *scriptStream) Close() error { return nil }

func ddlEvent(sql string) *schema.Event {
	return &schema.Event{
		SchemaVersion: schema.Version,
		Header:        schema.Header{TypeName: "QUERY"},
		Decoded:       &schema.Decoded{SQL: sql},
		Confidence:    schema.ConfidenceFull,
	}
}

func buildSchemaWith(t *testing.T, evs []*schema.Event) (*Server, int64) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "partial.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })

	cfg, _ := config.Load(st, func(string) string { return "" })
	reg := adapter.NewRegistry()
	reg.Register(&scriptAdapter{evs: evs})
	_ = reg.SetRole(adapter.RoleIndexer, "script")
	srv := New(st, reg, cfg)

	f := &store.File{Path: "/stub", MagicOK: true, State: store.FileStateIndexing}
	if err := st.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if err := srv.buildSchema(f.ID, "/stub"); err != nil {
		t.Fatalf("buildSchema: %v", err)
	}
	return srv, f.ID
}

// All DDL parses: the folded schema is trustworthy → confidence "full", so
// GetColumns serves the columns. This is the control for the partial case below.
func TestBuildSchemaAllValidIsFullConfidence(t *testing.T) {
	srv, fid := buildSchemaWith(t, []*schema.Event{
		ddlEvent("CREATE TABLE shop.users (id INT PRIMARY KEY, name VARCHAR(50))"),
	})
	cols, err := srv.store.GetColumns(fid, "shop", "users")
	if err != nil {
		t.Fatal(err)
	}
	if len(cols) != 2 {
		t.Fatalf("valid DDL must persist full-confidence columns, got %d: %+v", len(cols), cols)
	}
}

// One DDL fails to parse: it could have altered any table, so the whole fold is
// suspect. Every table is persisted "partial" and GetColumns (full-gated) hides
// the columns, preventing column-name enrichment from serving possibly-wrong
// names. Proven by contrast with the all-valid case: the table IS persisted
// (TableColumnCount > 0) but its columns are withheld.
func TestBuildSchemaParseFailDowngradesToPartial(t *testing.T) {
	srv, fid := buildSchemaWith(t, []*schema.Event{
		ddlEvent("CREATE TABLE shop.users (id INT PRIMARY KEY, name VARCHAR(50))"),
		ddlEvent("ALTER TABLE shop.users ADD COLUMN"), // looksDDL true, incomplete → parse fails
	})

	cols, err := srv.store.GetColumns(fid, "shop", "users")
	if err != nil {
		t.Fatal(err)
	}
	if cols != nil {
		t.Fatalf("a parse failure must downgrade all tables to partial (hidden columns), got %+v", cols)
	}
	// The table was still persisted — the count is available even when columns
	// are hidden — so this is the partial downgrade, not a missing table.
	if c, ok := srv.store.TableColumnCount(fid, "shop", "users"); !ok || c != 2 {
		t.Fatalf("table must be persisted with column_count 2, got c=%d ok=%v", c, ok)
	}
}

// detect() lazily builds the FK graph when SchemaBuilt is false (a file indexed
// before the schema pass existed, or a manual detect). Without this, the
// cascade_risk detector reads an empty FK graph — a silent false negative.
func TestDetectBuildsSchemaWhenMissing(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "detect.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })

	cfg, _ := config.Load(st, func(string) string { return "" })
	reg := adapter.NewRegistry()
	reg.Register(&scriptAdapter{evs: []*schema.Event{
		ddlEvent("CREATE TABLE shop.users (id INT PRIMARY KEY)"),
		ddlEvent("CREATE TABLE shop.orders (id INT PRIMARY KEY, uid INT, FOREIGN KEY (uid) REFERENCES shop.users(id) ON DELETE CASCADE)"),
	}})
	_ = reg.SetRole(adapter.RoleIndexer, "script")
	srv := New(st, reg, cfg)

	f := &store.File{Path: "/stub", MagicOK: true, State: store.FileStateReady}
	if err := st.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if srv.store.SchemaBuilt(f.ID) {
		t.Fatal("precondition: schema must not be built yet")
	}

	if err := srv.detect(f.ID); err != nil {
		t.Fatalf("detect: %v", err)
	}

	if !srv.store.SchemaBuilt(f.ID) {
		t.Fatal("detect must build the schema when SchemaBuilt was false")
	}
	fks, err := srv.store.ParentFKeys(f.ID, "shop", "users")
	if err != nil {
		t.Fatal(err)
	}
	if len(fks) != 1 || fks[0].ChildTable != "orders" {
		t.Fatalf("FK graph must be populated by detect's lazy build, got %+v", fks)
	}
}
