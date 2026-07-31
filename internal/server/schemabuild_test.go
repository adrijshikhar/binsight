package server

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/indexer"
	"github.com/adrijshikhar/binsight/internal/store"
)

// TestBuildSchemaAppliesDDL indexes a 5.5 corpus binlog (CREATE TABLE types_all
// with 17 columns, then ALTER TABLE ... ADD COLUMN added_col) and verifies that
// buildSchema re-decodes the DDL and folds it into a persisted schema: 18
// columns, last one is added_col, and the id column is the PK.
func TestBuildSchemaAppliesDDL(t *testing.T) {
	root := repoRoot(t)
	path := filepath.Join(root, "internal", "testdata", "corpus", "5.5", "mysql-5.5.binlog")
	if _, err := os.Stat(path); err != nil {
		t.Skip("corpus fixture mysql-5.5.binlog not present")
	}

	st, err := store.Open(filepath.Join(t.TempDir(), "schema.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

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

	cols, err := st.GetColumns(f.ID, "corpus", "types_all")
	if err != nil {
		t.Fatal(err)
	}
	if len(cols) == 0 {
		t.Fatal("expected non-empty column list for corpus.types_all")
	}
	if got := len(cols); got != 18 {
		t.Fatalf("expected 18 columns (17 base + added_col), got %d", got)
	}
	last := cols[len(cols)-1]
	if last.Name != "added_col" {
		t.Errorf("expected last column added_col (proves ALTER applied), got %q", last.Name)
	}
	if cols[0].Name != "id" || !cols[0].IsPK {
		t.Errorf("expected first column id with IsPK=true, got name=%q IsPK=%v", cols[0].Name, cols[0].IsPK)
	}
}
