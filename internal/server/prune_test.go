package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

func TestPruneSpoolKeepsNewestUnderCap(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.cfgMu.Lock()
	srv.cfg.DataDir = t.TempDir()
	srv.cfg.Stream.Enabled = true
	srv.cfg.Stream.MaxSpoolBytes = 250 // tiny cap: forces pruning
	spool := srv.cfg.SpoolDir()
	srv.cfgMu.Unlock()
	if err := os.MkdirAll(spool, 0o755); err != nil {
		t.Fatal(err)
	}
	// three 100-byte spool files, oldest → newest
	for _, n := range []string{"mysql-bin.000001", "mysql-bin.000002", "mysql-bin.000003"} {
		p := filepath.Join(spool, n)
		if err := os.WriteFile(p, make([]byte, 100), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := srv.store.UpsertFile(&store.File{Path: p, Size: 100, State: store.FileStateReady}); err != nil {
			t.Fatal(err)
		}
	}
	srv.pruneSpool()
	// 300 > 250 → oldest deleted; 200 <= 250 → stop
	if _, err := os.Stat(filepath.Join(spool, "mysql-bin.000001")); !os.IsNotExist(err) {
		t.Error("oldest spool file must be pruned")
	}
	for _, n := range []string{"mysql-bin.000002", "mysql-bin.000003"} {
		if _, err := os.Stat(filepath.Join(spool, n)); err != nil {
			t.Errorf("%s must survive: %v", n, err)
		}
	}
	files, _ := srv.store.ListFiles()
	for _, f := range files {
		if strings.HasSuffix(f.Path, "mysql-bin.000001") {
			t.Error("pruned file's index row must be deleted")
		}
	}
}

func TestPruneSpoolNeverTouchesNewest(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.cfgMu.Lock()
	srv.cfg.DataDir = t.TempDir()
	srv.cfg.Stream.Enabled = true
	srv.cfg.Stream.MaxSpoolBytes = 10 // below even one file
	spool := srv.cfg.SpoolDir()
	srv.cfgMu.Unlock()
	if err := os.MkdirAll(spool, 0o755); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(spool, "mysql-bin.000001")
	if err := os.WriteFile(p, make([]byte, 100), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.store.UpsertFile(&store.File{Path: p, Size: 100, State: store.FileStateReady}); err != nil {
		t.Fatal(err)
	}
	srv.pruneSpool()
	if _, err := os.Stat(p); err != nil {
		t.Error("the newest (current) spool file is never pruned, even over cap")
	}
	// index row for the surviving file must also be intact
	if _, err := srv.store.GetFileByPath(p); err != nil {
		t.Errorf("index row for newest spool file must survive pruning: %v", err)
	}
}
