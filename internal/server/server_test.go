package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/store"
)

func newTestServer(t *testing.T) (*Server, *httptest.Server) {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })

	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	if err := reg.SetRole(adapter.RoleIndexer, "go-mysql"); err != nil {
		t.Fatal(err)
	}
	if err := reg.SetRole(adapter.RoleDetail, "go-mysql"); err != nil {
		t.Fatal(err)
	}
	if err := reg.SetDiffSet([]string{"go-mysql"}); err != nil {
		t.Fatal(err)
	}

	_, thisFile, _, _ := runtime.Caller(0)
	fixtureDir := filepath.Join(filepath.Dir(thisFile), "..", "testdata")

	cfg, _ := config.Load(s, func(string) string { return "" })
	cfg.WatchDir = fixtureDir

	srv := New(s, reg, cfg)
	if err := srv.ScanAndIndex(); err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return srv, ts
}

func get(t *testing.T, ts *httptest.Server, path string, into any) *http.Response {
	t.Helper()
	resp, err := http.Get(ts.URL + path)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if into != nil {
		if err := json.NewDecoder(resp.Body).Decode(into); err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
	}
	return resp
}

func TestFilesEndpoint(t *testing.T) {
	_, ts := newTestServer(t)
	var files []*store.File
	get(t, ts, "/api/files", &files)
	if len(files) != 1 || files[0].State != store.FileStateReady {
		t.Fatalf("files endpoint wrong: %+v", files)
	}
}

func TestEventsEndpointFiltersAndPaginates(t *testing.T) {
	_, ts := newTestServer(t)
	var files []*store.File
	get(t, ts, "/api/files", &files)
	fid := files[0].ID

	var page store.EventPage
	get(t, ts, "/api/events?file="+itoa(fid)+"&limit=5", &page)
	if len(page.Events) != 5 || page.NextCursor == 0 {
		t.Fatalf("pagination wrong: n=%d cursor=%d", len(page.Events), page.NextCursor)
	}
	var page2 store.EventPage
	get(t, ts, "/api/events?file="+itoa(fid)+"&limit=5&cursor="+itoa(page.NextCursor), &page2)
	if len(page2.Events) == 0 || page2.Events[0].Pos <= page.Events[4].Pos {
		t.Fatalf("cursor must advance: %+v", page2.Events)
	}

	var writes store.EventPage
	get(t, ts, "/api/events?file="+itoa(fid)+"&type=WRITE_ROWS_V2", &writes)
	for _, e := range writes.Events {
		if e.TypeName != "WRITE_ROWS_V2" {
			t.Fatalf("type filter leak: %+v", e)
		}
	}
}

func TestEventsHandlerTail(t *testing.T) {
	_, ts := newTestServer(t)
	var files []*store.File
	get(t, ts, "/api/files", &files)
	fid := files[0].ID

	var all store.EventPage
	get(t, ts, "/api/events?file="+itoa(fid)+"&limit=1000", &all)
	if len(all.Events) < 3 {
		t.Skip("need >=3 events to exercise tail")
	}
	wantLastPos := all.Events[len(all.Events)-1].Pos

	var tail store.EventPage
	get(t, ts, "/api/events?file="+itoa(fid)+"&tail=2", &tail)
	if len(tail.Events) != 2 {
		t.Fatalf("tail=2 must return 2 events, got %d", len(tail.Events))
	}
	// ascending: last element is the highest pos in the file
	if tail.Events[1].Pos != wantLastPos {
		t.Fatalf("tail last event pos = %d, want file's max pos %d", tail.Events[1].Pos, wantLastPos)
	}

	resp := get(t, ts, "/api/events?file="+itoa(fid)+"&tail=notanumber", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid tail param must 400, got %d", resp.StatusCode)
	}

	resp = get(t, ts, "/api/events?file="+itoa(fid)+"&tail=-1", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("negative tail param must 400, got %d", resp.StatusCode)
	}
}

func TestEventsValidation(t *testing.T) {
	_, ts := newTestServer(t)
	resp := get(t, ts, "/api/events?file=notanumber", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid file param must 400, got %d", resp.StatusCode)
	}
}

func TestTxnsAndTablesEndpoints(t *testing.T) {
	_, ts := newTestServer(t)
	var files []*store.File
	get(t, ts, "/api/files", &files)
	fid := files[0].ID

	var txns []*store.Txn
	get(t, ts, "/api/txns?file="+itoa(fid), &txns)
	if len(txns) < 5 {
		t.Fatalf("txns endpoint: got %d", len(txns))
	}
	var tables []*store.TableStat
	get(t, ts, "/api/tables?file="+itoa(fid), &tables)
	if len(tables) == 0 {
		t.Fatal("tables endpoint empty")
	}
}

func TestPutSettingsPreservesBootPaths(t *testing.T) {
	srv, ts := newTestServer(t)
	srv.cfgMu.RLock()
	bootWatch := srv.cfg.WatchDir
	srv.cfgMu.RUnlock()
	body := `{"page_size":123,"timezone":"local","roles":{"indexer":"go-mysql","detail":"go-mysql","diff":["go-mysql"]}}`
	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/api/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("put settings: %d", resp.StatusCode)
	}
	srv.cfgMu.RLock()
	watchDir := srv.cfg.WatchDir
	pageSize := srv.cfg.PageSize
	srv.cfgMu.RUnlock()
	if watchDir != bootWatch || watchDir == "" {
		t.Fatalf("WatchDir clobbered: %q (want %q)", watchDir, bootWatch)
	}
	if pageSize != 123 {
		t.Fatalf("user-settable field not applied: PageSize=%d", pageSize)
	}
}

// TestPutSettingsPreservesRoles verifies that a PUT /api/settings payload
// that omits the roles field does not clear the previously-configured roles.
func TestPutSettingsPreservesRoles(t *testing.T) {
	srv, ts := newTestServer(t)

	// Record the roles configured at boot time.
	srv.cfgMu.RLock()
	bootIndexer := srv.cfg.Roles.Indexer
	bootDetail := srv.cfg.Roles.Detail
	bootDiff := append([]string(nil), srv.cfg.Roles.Diff...)
	srv.cfgMu.RUnlock()

	if bootIndexer == "" {
		t.Fatal("precondition: Indexer role must be non-empty after newTestServer")
	}

	// Send a PUT that only sets page_size — no roles field at all.
	body := `{"page_size":200}`
	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/api/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/settings status %d", resp.StatusCode)
	}

	srv.cfgMu.RLock()
	gotIndexer := srv.cfg.Roles.Indexer
	gotDetail := srv.cfg.Roles.Detail
	gotDiff := srv.cfg.Roles.Diff
	gotPageSize := srv.cfg.PageSize
	srv.cfgMu.RUnlock()

	if gotIndexer != bootIndexer {
		t.Errorf("Roles.Indexer clobbered: got %q want %q", gotIndexer, bootIndexer)
	}
	if gotDetail != bootDetail {
		t.Errorf("Roles.Detail clobbered: got %q want %q", gotDetail, bootDetail)
	}
	if len(gotDiff) != len(bootDiff) {
		t.Errorf("Roles.Diff length changed: got %v want %v", gotDiff, bootDiff)
	}
	if gotPageSize != 200 {
		t.Errorf("PageSize not applied: got %d want 200", gotPageSize)
	}
}

func itoa(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func TestMetricsEndpoint(t *testing.T) {
	_, ts := newTestServer(t)
	var files []*store.File
	get(t, ts, "/api/files", &files)
	fid := files[0].ID

	var m store.FileMetrics
	resp := get(t, ts, "/api/files/"+itoa(fid)+"/metrics", &m)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("metrics endpoint status = %d", resp.StatusCode)
	}
	if m.Events == 0 {
		t.Fatal("expected non-zero events from the indexed fixture")
	}
	if len(m.Series) == 0 {
		t.Fatal("expected a non-empty time series")
	}
}

func TestMetricsEndpointBadID(t *testing.T) {
	_, ts := newTestServer(t)
	resp := get(t, ts, "/api/files/abc/metrics", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("non-numeric id must 400, got %d", resp.StatusCode)
	}
}

func TestMetricsEndpointNotFound(t *testing.T) {
	_, ts := newTestServer(t)
	resp := get(t, ts, "/api/files/99999/metrics", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown file id must 404, got %d", resp.StatusCode)
	}
}

func TestAnomaliesAPI(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	f := &store.File{Path: "/data/binlog.000077", MagicOK: true, State: store.FileStateReady}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertAnomalies([]*store.Anomaly{
		{FileID: f.ID, Detector: "huge_txn_bytes", Severity: "high", TxnID: 1, Message: "big"},
		{FileID: f.ID, Detector: "long_txn", Severity: "low", TxnID: 2, Message: "slow"},
	}); err != nil {
		t.Fatal(err)
	}

	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	_ = reg.SetRole(adapter.RoleIndexer, "go-mysql")
	cfg, _ := config.Load(s, func(string) string { return "" })
	srv := New(s, reg, cfg)
	h := srv.Handler()

	// httptest.NewRequest defaults Host to "example.com", which guardBrowser
	// refuses; these exercise the full handler chain, so give them a Host the
	// server actually answers to.
	loopback := func(r *http.Request) *http.Request { r.Host = "127.0.0.1:8080"; return r }

	// severity filter returns only the matching finding
	req := loopback(httptest.NewRequest("GET", "/api/anomalies?file="+itoa(f.ID)+"&severity=high", nil))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var got []*store.Anomaly
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Detector != "huge_txn_bytes" {
		t.Fatalf("severity filter wrong: %+v", got)
	}

	// invalid severity rejected
	bad := loopback(httptest.NewRequest("GET", "/api/anomalies?file="+itoa(f.ID)+"&severity=nope", nil))
	badRec := httptest.NewRecorder()
	h.ServeHTTP(badRec, bad)
	if badRec.Code != 400 {
		t.Fatalf("invalid severity should be 400, got %d", badRec.Code)
	}

	// /api/files folds in the badge counts
	freq := loopback(httptest.NewRequest("GET", "/api/files", nil))
	frec := httptest.NewRecorder()
	h.ServeHTTP(frec, freq)
	var files []*store.File
	if err := json.Unmarshal(frec.Body.Bytes(), &files); err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].AnomalyCount != 2 || files[0].AnomalyMaxSeverity != "high" {
		t.Fatalf("file badge enrichment wrong: %+v", files)
	}
}
