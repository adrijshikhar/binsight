package store

import "testing"

// insertTestFile creates a minimal valid file row and returns its ID.
func insertTestFile(t *testing.T, s *Store) int64 {
	t.Helper()
	f := &File{Path: "/data/binlog.000001", State: FileStateReady, MagicOK: true}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	return f.ID
}

func TestUpsertAndGetSchema(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)
	cols := []SchemaColumn{
		{Ordinal: 1, Name: "id", DataType: "INT", IsPK: true, Nullable: false},
		{Ordinal: 2, Name: "name", DataType: "VARCHAR", IsPK: false, Nullable: true},
	}
	if err := s.UpsertTableSchema(fileID, "shop", "users", cols, "full"); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetColumns(fileID, "shop", "users")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "id" || got[1].Name != "name" {
		t.Errorf("got %+v", got)
	}
	if got[0].IsPK != true || got[1].Nullable != true {
		t.Errorf("column flags not round-tripped: %+v", got)
	}
	if c, ok := s.TableColumnCount(fileID, "shop", "users"); !ok || c != 2 {
		t.Errorf("count %d ok=%v", c, ok)
	}
	// re-upsert replaces, no dupes
	if err := s.UpsertTableSchema(fileID, "shop", "users", cols[:1], "full"); err != nil {
		t.Fatal(err)
	}
	got, _ = s.GetColumns(fileID, "shop", "users")
	if len(got) != 1 {
		t.Errorf("re-upsert should replace, got %d", len(got))
	}
	if c, ok := s.TableColumnCount(fileID, "shop", "users"); !ok || c != 1 {
		t.Errorf("re-upsert count %d ok=%v", c, ok)
	}
}

func TestGetColumnsPartialHidden(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)
	_ = s.UpsertTableSchema(fileID, "d", "t", []SchemaColumn{{Ordinal: 1, Name: "a", DataType: "INT"}}, "partial")
	got, _ := s.GetColumns(fileID, "d", "t")
	if got != nil {
		t.Errorf("partial schema must hide columns, got %+v", got)
	}
	// column_count is still available even when columns are hidden.
	if c, ok := s.TableColumnCount(fileID, "d", "t"); !ok || c != 1 {
		t.Errorf("count %d ok=%v", c, ok)
	}
}

func TestTableColumnCountMissing(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)
	if c, ok := s.TableColumnCount(fileID, "nope", "nope"); ok || c != 0 {
		t.Errorf("missing table should report ok=false c=0, got c=%d ok=%v", c, ok)
	}
}

// SchemaBuilt gates detect()'s lazy schema build: it must report true once a
// schema exists and false again after ClearSchema, else a reindex would skip the
// rebuild and serve a stale FK graph.
func TestSchemaBuiltTogglesWithClear(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)

	if s.SchemaBuilt(fileID) {
		t.Fatal("SchemaBuilt must be false before any schema is persisted")
	}
	if err := s.UpsertTableSchema(fileID, "d", "t", []SchemaColumn{{Ordinal: 1, Name: "a", DataType: "INT"}}, "full"); err != nil {
		t.Fatal(err)
	}
	if !s.SchemaBuilt(fileID) {
		t.Fatal("SchemaBuilt must be true after a table is persisted")
	}
	if err := s.ClearSchema(fileID); err != nil {
		t.Fatal(err)
	}
	if s.SchemaBuilt(fileID) {
		t.Fatal("SchemaBuilt must be false after ClearSchema")
	}
}

// SchemaBuilt also counts fkeys: a file with only FK rows (no table_schemas) is
// still "built". Confirms the COUNT spans both tables.
func TestSchemaBuiltCountsFKeysOnly(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)
	if err := s.InsertFKeys(fileID, []FKey{{ChildDB: "d", ChildTable: "c", ChildCols: "x", ParentDB: "d", ParentTable: "p", ParentCols: "id", OnDelete: "CASCADE"}}); err != nil {
		t.Fatal(err)
	}
	if !s.SchemaBuilt(fileID) {
		t.Fatal("SchemaBuilt must be true when only fkeys exist")
	}
}

func TestInsertAndListFKeys(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)
	if err := s.InsertFKeys(fileID, []FKey{{ChildDB: "shop", ChildTable: "orders", ChildCols: "user_id", ParentDB: "shop", ParentTable: "users", ParentCols: "id", OnDelete: "CASCADE"}}); err != nil {
		t.Fatal(err)
	}
	fks, err := s.ParentFKeys(fileID, "shop", "users")
	if err != nil {
		t.Fatal(err)
	}
	if len(fks) != 1 || fks[0].ChildTable != "orders" || fks[0].OnDelete != "CASCADE" {
		t.Errorf("got %+v", fks)
	}
	// no match for a different parent table
	other, err := s.ParentFKeys(fileID, "shop", "products")
	if err != nil {
		t.Fatal(err)
	}
	if len(other) != 0 {
		t.Errorf("expected no fkeys for products, got %+v", other)
	}
}

func TestInsertFKeysEmpty(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)
	if err := s.InsertFKeys(fileID, nil); err != nil {
		t.Fatalf("empty insert should be a no-op, got %v", err)
	}
}

func TestClearSchema(t *testing.T) {
	s := newTestStore(t)
	fileID := insertTestFile(t, s)
	_ = s.UpsertTableSchema(fileID, "d", "t", []SchemaColumn{{Ordinal: 1, Name: "a", DataType: "INT"}}, "full")
	_ = s.InsertFKeys(fileID, []FKey{{ChildDB: "d", ChildTable: "c", ChildCols: "x", ParentDB: "d", ParentTable: "t", ParentCols: "a", OnDelete: "CASCADE"}})
	if err := s.ClearSchema(fileID); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetColumns(fileID, "d", "t")
	if got != nil {
		t.Error("schema not cleared")
	}
	if _, ok := s.TableColumnCount(fileID, "d", "t"); ok {
		t.Error("table_schemas row not cleared")
	}
	fks, _ := s.ParentFKeys(fileID, "d", "t")
	if len(fks) != 0 {
		t.Error("fkeys not cleared")
	}
	// columns rows must be gone too — verify directly.
	var n int
	if err := s.DB.QueryRow(`SELECT count(*) FROM columns`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("orphan columns left after clear: %d", n)
	}
}
