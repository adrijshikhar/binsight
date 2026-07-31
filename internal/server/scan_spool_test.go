package server

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// TestScanIncludesSpoolDir: a binlog placed in DataDir/spool is discovered and
// indexed by ScanAndIndex, and the files API marks it remote.
func TestScanIncludesSpoolDir(t *testing.T) {
	srv, _ := newTestServer(t) // reuse the existing test constructor in this package
	srv.cfgMu.Lock()
	dataDir := t.TempDir()
	srv.cfg.DataDir = dataDir
	srv.cfgMu.Unlock()
	spool := filepath.Join(dataDir, "spool")
	if err := os.MkdirAll(spool, 0o755); err != nil {
		t.Fatal(err)
	}
	// Corrected path: corpus binlogs live in versioned subdirs (e.g. 8.0/).
	src, err := os.ReadFile("../testdata/corpus/8.0/mysql-8.0.binlog")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(spool, "mysql-bin.000001"), src, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	srv.handleListFiles(rec, httptest.NewRequest("GET", "/api/files", nil))
	var files []struct {
		Path   string `json:"path"`
		State  string `json:"state"`
		Remote bool   `json:"remote"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &files); err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, f := range files {
		if filepath.Base(f.Path) == "mysql-bin.000001" {
			found = true
			if f.State != "ready" {
				t.Errorf("spool file state = %s", f.State)
			}
			if !f.Remote {
				t.Error("spool file must be flagged remote")
			}
		} else {
			// Any file that is NOT the spool entry must not be flagged remote.
			if f.Remote {
				t.Errorf("non-spool file %q must not be flagged remote, but Remote=true", f.Path)
			}
		}
	}
	if !found {
		t.Fatal("spool file not discovered by ScanAndIndex")
	}
}
