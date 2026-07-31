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

// TestCascadeRiskE2E indexes the dedicated 8.0-fkeys corpus fixture, folds its
// DDL into the persisted schema, and runs the anomaly engine. The fkeys workload
// builds fk_parent/fk_child with ON DELETE CASCADE and deletes a parent row;
// InnoDB applies the child cascade deletes WITHOUT writing them to the binlog,
// so the cascade_risk detector must fire exactly once on fk_parent.
//
// It SKIPS when the fixture is absent (it is generated offline via Docker:
// `make corpus VERSION=8.0-fkeys`), keeping `go test ./...` green pre-generation.
func TestCascadeRiskE2E(t *testing.T) {
	root := repoRoot(t)
	path := filepath.Join(root, "internal", "testdata", "corpus", "8.0-fkeys", "mysql-8.0-fkeys.binlog")
	if _, err := os.Stat(path); err != nil {
		t.Skip("corpus fixture mysql-8.0-fkeys.binlog not present — run `make corpus VERSION=8.0-fkeys`")
	}

	st, err := store.Open(filepath.Join(t.TempDir(), "cascade.db"))
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
	if err := srv.detect(f.ID); err != nil {
		t.Fatalf("detect: %v", err)
	}

	// The FK edge from the DDL: fk_child references fk_parent ON DELETE CASCADE.
	fks, err := srv.store.ParentFKeys(f.ID, "corpus", "fk_parent")
	if err != nil {
		t.Fatal(err)
	}
	if len(fks) != 1 {
		t.Fatalf("expected 1 inbound FK on corpus.fk_parent, got %d: %+v", len(fks), fks)
	}
	if fks[0].ChildTable != "fk_child" {
		t.Errorf("expected child table fk_child, got %q", fks[0].ChildTable)
	}
	if fks[0].OnDelete != "CASCADE" {
		t.Errorf("expected ON DELETE CASCADE, got %q", fks[0].OnDelete)
	}

	// The cascade_risk detector must flag the parent delete exactly once.
	anomalies, err := srv.store.ListAnomalies(f.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	var cascade []*store.Anomaly
	for _, a := range anomalies {
		if a.Detector == "cascade_risk" {
			cascade = append(cascade, a)
		}
	}
	if len(cascade) != 1 {
		t.Fatalf("expected exactly 1 cascade_risk anomaly, got %d: %+v", len(cascade), cascade)
	}
	if cascade[0].TableName != "fk_parent" {
		t.Errorf("expected cascade_risk on table fk_parent, got %q", cascade[0].TableName)
	}
}
