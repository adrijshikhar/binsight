package server

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/store"
)

// fixtureBytes returns the bytes of the shared real binlog fixture
// (internal/testdata/binlog.000002), the same one newTestServer indexes.
// ok is false when the fixture is absent so callers can t.Skip and keep CI
// green on checkouts without fixtures (mirrors how corpus servers skip).
func fixtureBytes(t *testing.T) (data []byte, ok bool) {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	path := filepath.Join(filepath.Dir(thisFile), "..", "testdata", "binlog.000002")
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	return b, true
}

// newLiveTailServer builds a Server wired with the real go-mysql indexer and a
// fresh empty WatchDir (a t.TempDir), with cfg.Watch enabled. Unlike
// newScanServer (no-op indexer, no events) this indexes real binlogs, so the
// tail query can return freshly-indexed rows.
func newLiveTailServer(t *testing.T) (*Server, string) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "livetail.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })

	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	if err := reg.SetRole(adapter.RoleIndexer, "go-mysql"); err != nil {
		t.Fatal(err)
	}
	if err := reg.SetRole(adapter.RoleDetail, "go-mysql"); err != nil {
		t.Fatal(err)
	}

	watchDir := t.TempDir()
	cfg, _ := config.Load(st, func(string) string { return "" })
	cfg.WatchDir = watchDir
	cfg.Watch = true

	return New(st, reg, cfg), watchDir
}

// startSSEListener subscribes to GET /api/stream and, in a background
// goroutine, scans the streamed `data:` lines for an `index_done` message.
// Every parsed file_id is pushed onto the returned channel.
//
// The HTTP request is issued INSIDE the goroutine on purpose: the SSE handler
// only flushes response headers on its first write (the first broadcast), so
// http.Client.Do blocks until then. Issuing it on the test's main goroutine
// would deadlock (the fixture that triggers the first broadcast is written
// only after this returns). The goroutine is bounded by ctx so it can't hang
// the test; the caller cancels ctx via t.Cleanup.
//
// Callers must waitForSSESub before triggering a scan so the subscriber is
// registered in srv.sseSubs before index_done is broadcast — otherwise the
// broadcast races ahead of the subscription and is missed.
func startSSEListener(t *testing.T, ctx context.Context, ts *httptest.Server) <-chan int64 {
	t.Helper()
	out := make(chan int64, 16)

	go func() {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/api/stream", nil)
		if err != nil {
			return
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return // ctx cancelled or stream closed; test asserts via timeout
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return
		}
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			data, ok := strings.CutPrefix(line, "data: ")
			if !ok {
				continue
			}
			if !strings.Contains(data, `"type":"index_done"`) {
				continue
			}
			var msg struct {
				Type   string `json:"type"`
				FileID int64  `json:"file_id"`
			}
			if err := json.Unmarshal([]byte(data), &msg); err != nil {
				continue
			}
			if msg.Type != "index_done" {
				continue
			}
			select {
			case out <- msg.FileID:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

// waitForSSESub blocks until at least one SSE subscriber is registered in
// srv.sseSubs (or fails). This guarantees the listener's channel is in the
// broadcast set before the test triggers indexing, so the index_done broadcast
// is delivered rather than racing ahead of the subscription.
func waitForSSESub(t *testing.T, srv *Server) {
	t.Helper()
	for i := 0; i < 500; i++ {
		srv.sseMu.Lock()
		n := len(srv.sseSubs)
		srv.sseMu.Unlock()
		if n > 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("SSE subscriber never registered in srv.sseSubs")
}

// TestLiveTailEndToEnd asserts the full server-side live-tail seam that no
// single existing test covers:
//
//	a binlog appearing in WatchDir -> fsnotify watcher -> triggerScan ->
//	ScanAndIndex -> SSE `index_done` broadcast -> a tail=N query returns the
//	freshly-indexed events.
//
// Observation path: the REAL watcher path. We subscribe to the real
// /api/stream HTTP endpoint (httptest.Server) and copy the fixture into the
// watched directory, letting the debounced fsnotify watcher drive the scan.
// This exercises the production wiring end-to-end. A generous (15s) timeout
// on the index_done channel absorbs debounce + indexing latency; if the real
// path proved flaky we would fall back to calling srv.ScanAndIndex() directly,
// but it has been reliable here so the real path is used.
func TestLiveTailEndToEnd(t *testing.T) {
	data, ok := fixtureBytes(t)
	if !ok {
		t.Skip("binlog fixture internal/testdata/binlog.000002 absent — skipping live-tail integration")
	}

	srv, watchDir := newLiveTailServer(t)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	// Bound the SSE-reader goroutine to the test lifetime.
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	indexDone := startSSEListener(t, ctx, ts)
	// Ensure the subscriber is registered before any broadcast can fire.
	waitForSSESub(t, srv)

	// Start the real fsnotify watcher on the (currently empty) WatchDir.
	srv.StartWatch(context.Background())
	t.Cleanup(func() {
		if srv.watcher != nil {
			_ = srv.watcher.Close()
		}
	})

	// Drop a real binlog into the watched dir — the watcher should debounce,
	// fire triggerScan, and ScanAndIndex should index it and broadcast.
	dst := filepath.Join(watchDir, "binlog.000001")
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		t.Fatal(err)
	}

	var fileID int64
	select {
	case fileID = <-indexDone:
	case <-time.After(15 * time.Second):
		t.Fatal("timed out waiting for index_done SSE broadcast after binlog appeared in WatchDir")
	}
	if fileID == 0 {
		t.Fatal("index_done carried a zero file_id")
	}

	// Sanity: the broadcast file_id matches a ready file in the store.
	files, err := srv.store.ListFiles()
	if err != nil {
		t.Fatal(err)
	}
	var found *store.File
	for _, f := range files {
		if f.ID == fileID {
			found = f
		}
	}
	if found == nil {
		t.Fatalf("index_done file_id %d not present in store ListFiles", fileID)
	}
	if found.State != store.FileStateReady {
		t.Fatalf("indexed file state = %q, want %q", found.State, store.FileStateReady)
	}

	// The whole point: a tail=N query returns the freshly-indexed events, in
	// ascending pos order.
	var tail store.EventPage
	get(t, ts, "/api/events?file="+itoa(fileID)+"&tail=5", &tail)
	if len(tail.Events) == 0 {
		t.Fatal("tail query returned no events for the freshly-indexed file")
	}
	for i := 1; i < len(tail.Events); i++ {
		if tail.Events[i].Pos <= tail.Events[i-1].Pos {
			t.Fatalf("tail events not strictly ascending by pos: %d then %d",
				tail.Events[i-1].Pos, tail.Events[i].Pos)
		}
	}
}
