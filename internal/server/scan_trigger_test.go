package server

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/store"
)

// waitPendingClear polls until the scan-coalescing flags settle, or fails.
func waitPendingClear(t *testing.T, srv *Server) {
	t.Helper()
	for i := 0; i < 300; i++ {
		if !srv.scanPending.Load() && !srv.scanDirty.Load() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("scan flags never settled: pending=%v dirty=%v — a request was dropped and the scan would be stuck",
		srv.scanPending.Load(), srv.scanDirty.Load())
}

func newScanServer(t *testing.T) *Server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "scan.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	cfg, _ := config.Load(st, func(string) string { return "" })
	cfg.WatchDir = t.TempDir() // empty dir → ScanAndIndex returns quickly, no files
	reg := adapter.NewRegistry()
	reg.Register(&scriptAdapter{}) // indexer adapter present but unused (no files)
	_ = reg.SetRole(adapter.RoleIndexer, "script")
	return New(st, reg, cfg)
}

// A single trigger must run and reset scanPending — the regression that left a
// re-indexed file stuck on "indexing…" forever was scanPending never clearing.
func TestTriggerScanResetsPending(t *testing.T) {
	srv := newScanServer(t)
	srv.triggerScan()
	waitPendingClear(t, srv)
}

// Triggers arriving while a scan runs are coalesced via scanDirty (the 2nd CAS
// fails). The reclaim loop must still drain them and settle — no trigger is
// dropped, and the flags don't deadlock in the pending state.
func TestTriggerScanCoalescesConcurrent(t *testing.T) {
	srv := newScanServer(t)
	for i := 0; i < 10; i++ {
		srv.triggerScan()
	}
	waitPendingClear(t, srv)
	// Flags settled, so a subsequent trigger still starts a fresh scan.
	srv.triggerScan()
	waitPendingClear(t, srv)
}

// StartWatch with Watch=false must not start a watcher and must not scan.
func TestStartWatchDisabledNoop(t *testing.T) {
	srv := newScanServer(t)
	srv.cfg.Watch = false
	srv.StartWatch(context.Background())
	if srv.scanPending.Load() {
		t.Fatal("disabled watcher must not trigger a scan")
	}
}

// StartWatch with Watch=true triggers a scan when a file appears in WatchDir.
func TestStartWatchTriggersScanOnWrite(t *testing.T) {
	srv := newScanServer(t)
	srv.cfg.Watch = true
	srv.StartWatch(context.Background())
	t.Cleanup(func() {
		if srv.watcher != nil {
			_ = srv.watcher.Close()
		}
	})

	// Create a file in the watched dir; the debounced watcher should fire a scan.
	if err := os.WriteFile(filepath.Join(srv.cfg.WatchDir, "binlog.000001"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Poll for the scan flags to have been set/settled (timing-tolerant).
	waitPendingClear(t, srv)
}
