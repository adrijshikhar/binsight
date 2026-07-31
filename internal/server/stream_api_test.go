package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

func TestStreamStatusDisabled(t *testing.T) {
	srv, _ := newTestServer(t)
	rec := httptest.NewRecorder()
	srv.handleStreamStatus(rec, httptest.NewRequest("GET", "/api/stream/status", nil))
	var st struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
		t.Fatal(err)
	}
	if st.State != "disabled" {
		t.Errorf("state = %q, want disabled", st.State)
	}
}

func TestPutSettingsStreamValidation(t *testing.T) {
	srv, _ := newTestServer(t)
	// invalid flavor → 400, nothing persisted
	body := `{"stream":{"enabled":true,"host":"h","user":"u","flavor":"oracle"}}`
	rec := httptest.NewRecorder()
	srv.handlePutSettings(rec, httptest.NewRequest("PUT", "/api/settings", strings.NewReader(body)))
	if rec.Code != 400 {
		t.Fatalf("bad flavor: code %d", rec.Code)
	}
	// enabled without host → 400
	body = `{"stream":{"enabled":true,"user":"u","flavor":"mysql"}}`
	rec = httptest.NewRecorder()
	srv.handlePutSettings(rec, httptest.NewRequest("PUT", "/api/settings", strings.NewReader(body)))
	if rec.Code != 400 {
		t.Fatalf("missing host: code %d", rec.Code)
	}
	// valid disabled config persists with defaults filled
	body = `{"stream":{"enabled":false,"host":"db1","user":"repl","password":"x","flavor":"mysql"}}`
	rec = httptest.NewRecorder()
	srv.handlePutSettings(rec, httptest.NewRequest("PUT", "/api/settings", strings.NewReader(body)))
	if rec.Code != 200 {
		t.Fatalf("valid: code %d body %s", rec.Code, rec.Body.String())
	}
	srv.cfgMu.RLock()
	defer srv.cfgMu.RUnlock()
	if srv.cfg.Stream.Host != "db1" || srv.cfg.Stream.Port != 3306 || srv.cfg.Stream.ServerID == 0 {
		t.Errorf("persisted stream cfg: %+v", srv.cfg.Stream)
	}
}

func TestRestartFromCurrentDisabledReturns409(t *testing.T) {
	srv, _ := newTestServer(t)
	// streaming is disabled by default in newTestServer
	rec := httptest.NewRecorder()
	srv.handleStreamRestart(rec, httptest.NewRequest("POST", "/api/stream/restart-from-current", nil))
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict when stream disabled, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRestartFromCurrentClearsSpool(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.cfgMu.Lock()
	srv.cfg.DataDir = t.TempDir()
	srv.cfg.Stream.Enabled = true
	srv.cfg.Stream.Host = "db.example"
	srv.cfg.Stream.User = "repl"
	spool := srv.cfg.SpoolDir()
	srv.cfgMu.Unlock()
	// seed a spool file + matching store row
	mustWriteSpoolFixture(t, srv, spool, "mysql-bin.000001")
	rec := httptest.NewRecorder()
	srv.handleStreamRestart(rec, httptest.NewRequest("POST", "/api/stream/restart-from-current", nil))
	if rec.Code != 202 {
		t.Fatalf("code %d", rec.Code)
	}
	files, err := srv.store.ListFiles()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		if strings.HasPrefix(f.Path, spool) {
			t.Errorf("spool row survived restart-from-current: %s", f.Path)
		}
	}
}

func mustWriteSpoolFixture(t *testing.T, srv *Server, spool, name string) {
	t.Helper()
	if err := os.MkdirAll(spool, 0o755); err != nil {
		t.Fatal(err)
	}
	src, err := os.ReadFile("../testdata/corpus/8.0/mysql-8.0.binlog")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(spool, name)
	if err := os.WriteFile(path, src, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := srv.store.UpsertFile(&store.File{Path: path, State: store.FileStateReady}); err != nil {
		t.Fatal(err)
	}
}
