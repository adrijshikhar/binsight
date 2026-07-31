package server

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/indexer"
	"github.com/adrijshikhar/binsight/internal/store"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(thisFile), "..", "..")
}

// Perf gate (design §9): binlog.000003 (10.2MB) must index in < 5s.
func TestPerfGateBigFile(t *testing.T) {
	big := filepath.Join(repoRoot(t), "binlog.000003")
	if _, err := os.Stat(big); err != nil {
		t.Skip("corpus file binlog.000003 not present")
	}
	s, err := store.Open(filepath.Join(t.TempDir(), "perf.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	f := &store.File{Path: big, MagicOK: true, State: store.FileStateIndexing}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	if err := indexer.New(s, gomysql.New()).IndexFile(context.Background(), f, nil); err != nil {
		t.Fatal(err)
	}
	elapsed := time.Since(start)
	t.Logf("indexed binlog.000003 in %v", elapsed)
	if elapsed > 5*time.Second {
		t.Fatalf("perf gate failed: %v > 5s", elapsed)
	}

	// sanity from design profile: 26 txns, >1300 events, employees tables
	txns, err := s.ListTxns(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(txns) < 20 {
		t.Fatalf("expected >=20 txns in 000003, got %d", len(txns))
	}
	page, err := s.QueryEvents(store.EventFilter{FileID: f.ID, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total < 1300 {
		t.Fatalf("expected >=1300 events, got %d", page.Total)
	}
	stats, err := s.ListTableStats(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	foundEmployees := false
	for _, st := range stats {
		if st.DBName == "employees" {
			foundEmployees = true
		}
	}
	if !foundEmployees {
		t.Fatal("employees tables missing from aggregation")
	}

	// query latency gate: filtered query worst-of-20 < 100ms
	worst := time.Duration(0)
	for range 20 {
		qs := time.Now()
		if _, err := s.QueryEvents(store.EventFilter{
			FileID: f.ID, TypeNames: []string{"WRITE_ROWS_V2"}, Limit: 500,
		}); err != nil {
			t.Fatal(err)
		}
		if d := time.Since(qs); d > worst {
			worst = d
		}
	}
	t.Logf("worst filtered query: %v", worst)
	if worst > 100*time.Millisecond {
		t.Fatalf("query latency gate failed: %v > 100ms", worst)
	}
}

// Whole-corpus smoke: every present corpus file indexes without error.
func TestCorpusIndexes(t *testing.T) {
	root := repoRoot(t)
	cfgStore, err := store.Open(filepath.Join(t.TempDir(), "c.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer cfgStore.Close()
	cfg, _ := config.Load(cfgStore, func(string) string { return "" })
	cfg.WatchDir = root

	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	_ = reg.SetRole(adapter.RoleIndexer, "go-mysql")
	_ = reg.SetRole(adapter.RoleDetail, "go-mysql")
	_ = reg.SetDiffSet([]string{"go-mysql"})

	srv := New(cfgStore, reg, cfg)
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	files, err := cfgStore.ListFiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Skip("no corpus files present")
	}
	for _, f := range files {
		if f.State == store.FileStateError && f.MagicOK {
			t.Errorf("file %s failed to index: %s", f.Path, f.Error)
		}
	}
}

func TestDetectAfterIndex(t *testing.T) {
	root := repoRoot(t)
	big := filepath.Join(root, "binlog.000003")
	if _, err := os.Stat(big); err != nil {
		t.Skip("corpus file binlog.000003 not present")
	}
	cfgStore, err := store.Open(filepath.Join(t.TempDir(), "d.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer cfgStore.Close()
	cfg, _ := config.Load(cfgStore, func(string) string { return "" })
	cfg.WatchDir = root
	cfg.Anomaly.TxnRows = 100

	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	_ = reg.SetRole(adapter.RoleIndexer, "go-mysql")
	_ = reg.SetRole(adapter.RoleDetail, "go-mysql")
	_ = reg.SetDiffSet([]string{"go-mysql"})

	srv := New(cfgStore, reg, cfg)
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	files, _ := cfgStore.ListFiles()
	var fid int64
	for _, f := range files {
		if filepath.Base(f.Path) == "binlog.000003" {
			fid = f.ID
		}
	}
	if fid == 0 {
		t.Skip("binlog.000003 not indexed")
	}
	anoms, err := cfgStore.ListAnomalies(fid, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(anoms) == 0 {
		t.Fatal("expected anomalies after ScanAndIndex (schema_churn / huge_txn_rows)")
	}
	hasChurn := false
	for _, a := range anoms {
		if a.Detector == "schema_churn" {
			hasChurn = true
		}
	}
	if !hasChurn {
		t.Errorf("expected schema_churn on 000003 (it has TRUNCATEs + DML)")
	}
}
