// Package server wires store, adapter registry, indexer, scanner and the
// embedded web UI behind an HTTP API.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/anomaly"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/indexer"
	"github.com/adrijshikhar/binsight/internal/scanner"
	"github.com/adrijshikhar/binsight/internal/store"
	"github.com/adrijshikhar/binsight/internal/streamer"
	"github.com/adrijshikhar/binsight/internal/watcher"
)

// Server is the HTTP application: API + SSE + (later) embedded UI.
type Server struct {
	store *store.Store
	reg   *adapter.Registry
	cfg   *config.Config
	eng   *anomaly.Engine

	cfgMu    sync.RWMutex // guards all reads/writes of cfg fields
	scanMu   sync.Mutex   // serialises concurrent ScanAndIndex calls
	detectMu sync.Mutex   // serialises detect() so concurrent runs cannot interleave clear+insert

	scanPending   atomic.Bool // coalesces concurrent triggerScan requests
	scanDirty     atomic.Bool // a trigger arrived mid-scan; run one more pass
	detectPending atomic.Bool // coalesces concurrent triggerDetectAll requests
	detectDirty   atomic.Bool // a trigger arrived mid-pass; run one more pass

	sseMu   sync.Mutex
	sseSubs map[chan string]struct{}

	// watcher is written once inside StartWatch (guarded by watchOnce) and only
	// read on the same goroutine (test cleanup / future shutdown) — not shared
	// across goroutines, so no mutex is required.
	watcher   *watcher.Watcher
	watchOnce sync.Once

	// streamMu serialises start/stop/restart sequences only — readers use
	// srv.streamer.Load() without holding streamMu so status reads never block
	// behind a long Stop() call.
	streamMu       sync.Mutex
	streamer       atomic.Pointer[streamer.Streamer]
	spoolWatcher   *watcher.Watcher
	spoolWatchOnce sync.Once
}

// isSpoolPath reports whether p lies under the streaming spool directory.
func (srv *Server) isSpoolPath(p string) bool {
	srv.cfgMu.RLock()
	spool := srv.cfg.SpoolDir()
	srv.cfgMu.RUnlock()
	abs, err := filepath.Abs(spool)
	if err != nil || abs == "" {
		return false
	}
	return strings.HasPrefix(p, abs+string(filepath.Separator))
}

// watchDebounce is the quiet window the live-tail watcher waits after the last
// filesystem event before triggering a scan.
const watchDebounce = 400 * time.Millisecond

// New builds a Server around its dependencies.
func New(s *store.Store, reg *adapter.Registry, cfg *config.Config) *Server {
	return &Server{store: s, reg: reg, cfg: cfg, eng: anomaly.DefaultEngine(),
		sseSubs: map[chan string]struct{}{}}
}

// ScanAndIndex discovers binlogs in cfg.WatchDir and indexes new/changed
// files with the indexer-role adapter. Synchronous; callers wrap in a
// goroutine for background startup indexing.
// scanMu serialises concurrent invocations so two goroutines never race on
// the same binlog file.
func (srv *Server) ScanAndIndex() error {
	srv.scanMu.Lock()
	defer srv.scanMu.Unlock()

	srv.cfgMu.RLock()
	watchDir := srv.cfg.WatchDir
	spoolDir := srv.cfg.SpoolDir()
	srv.cfgMu.RUnlock()

	// Collapse any rows duplicated under relative+absolute path strings before
	// scanning (scanner now emits canonical absolute paths).
	if n, err := srv.store.DedupeFiles(); err != nil {
		log.Printf("dedupe files: %v", err)
	} else if n > 0 {
		log.Printf("removed %d duplicate file row(s)", n)
	}

	found, err := scanner.Scan(watchDir)
	if err != nil {
		return fmt.Errorf("scan %s: %w", watchDir, err)
	}
	// The spool dir is best-effort: absent until streaming first runs.
	// spoolScanFailed is set only when the dir exists but Scan errors; it is
	// NOT set when the dir is absent (genuinely-gone spool files may still be
	// stale-marked in that case).
	spoolScanFailed := false
	if st, serr := os.Stat(spoolDir); serr == nil && st.IsDir() {
		spoolFound, serr := scanner.Scan(spoolDir)
		if serr != nil {
			log.Printf("scan spool %s: %v", spoolDir, serr)
			spoolScanFailed = true
		} else {
			found = append(found, spoolFound...)
		}
	}
	dec := srv.reg.ForRole(adapter.RoleIndexer)
	if dec == nil {
		return fmt.Errorf("no indexer adapter configured")
	}
	for _, d := range found {
		f, err := srv.store.GetFileByPath(d.Path)
		if err != nil { // not seen before
			f = &store.File{Path: d.Path}
		}
		f.Size = d.Size
		f.MagicOK = d.MagicOK
		if !d.MagicOK {
			f.State = store.FileStateError
			f.Error = "bad magic bytes — not a binlog"
			_ = srv.store.UpsertFile(f)
			continue
		}
		// Size-equality is the change signal: a file REPLACED with different
		// content of the exact same size is not detected (acceptable — binlogs
		// are append-only in practice; a manual re-index covers the edge).
		if f.State == store.FileStateReady && f.LastIndexedOffset == d.Size &&
			f.IndexedByAdapter == dec.Name() {
			continue // unchanged, already indexed by this adapter
		}
		// Capture BEFORE mutating state: a ready file that only grew, indexed
		// by this same resume-capable adapter, takes the append path.
		canAppend := f.ID != 0 && f.State == store.FileStateReady &&
			f.IndexedByAdapter == dec.Name() &&
			dec.Capabilities().ResumeDecode &&
			f.LastIndexedOffset > adapter.BinlogHeaderEnd && d.Size > f.LastIndexedOffset
		f.State = store.FileStateIndexing
		if err := srv.store.UpsertFile(f); err != nil {
			return err
		}
		srv.broadcast(fmt.Sprintf(`{"type":"index_start","file_id":%d}`, f.ID))
		ix := indexer.New(srv.store, dec)
		cb := func(fileID, n int64, pos uint64) {
			srv.broadcast(fmt.Sprintf(`{"type":"index_progress","file_id":%d,"events":%d,"pos":%d}`, fileID, n, pos))
		}
		appended, sawDDL := false, false
		if canAppend {
			if sd, aerr := ix.IndexAppend(context.Background(), f, cb); aerr != nil {
				log.Printf("append-index %s failed, falling back to full re-index: %v", f.Path, aerr)
			} else {
				appended, sawDDL = true, sd
			}
		}
		if !appended {
			if err := ix.IndexFile(context.Background(), f, cb); err != nil {
				log.Printf("index %s failed: %v", f.Path, err)
				srv.broadcast(fmt.Sprintf(`{"type":"index_error","file_id":%d}`, f.ID))
				continue // one bad file must not block the rest
			}
		}
		srv.broadcast(fmt.Sprintf(`{"type":"index_done","file_id":%d}`, f.ID))
		// Schema folds DDL; an appended tail without DDL cannot change it.
		if !appended || sawDDL {
			if err := srv.buildSchema(f.ID, f.Path); err != nil {
				log.Printf("schema build for file %d: %v", f.ID, err)
			}
		}
		_ = srv.detect(f.ID)
	}

	// Mark files that vanished from the watch dir as stale (design §8).
	scanned := map[string]bool{}
	for _, d := range found {
		scanned[d.Path] = true
	}
	existing, err := srv.store.ListFiles()
	if err != nil {
		log.Printf("list files for stale-marking: %v", err)
	}
	absWatch, _ := filepath.Abs(watchDir)
	absSpool, _ := filepath.Abs(spoolDir)
	for _, f := range existing {
		if scanned[f.Path] || f.State == store.FileStateStale {
			continue
		}
		inWatch := absWatch != "" && strings.HasPrefix(f.Path, absWatch+string(filepath.Separator))
		// Do not stale-mark spool files when the spool scan errored: the files
		// still exist on disk, they just could not be enumerated this pass.
		// Marking them stale would destroy append/resume progress.
		inSpool := !spoolScanFailed && absSpool != "" && strings.HasPrefix(f.Path, absSpool+string(filepath.Separator))
		if !inWatch && !inSpool {
			continue
		}
		f.State = store.FileStateStale
		_ = srv.store.UpsertFile(f)
	}

	srv.pruneSpool()
	return nil
}

// detect runs the anomaly engine for one file using the current thresholds.
// Errors are logged and returned; background callers treat them as best-effort.
func (srv *Server) detect(fileID int64) error {
	srv.detectMu.Lock()
	defer srv.detectMu.Unlock()
	// The cascade_risk detector reads the parsed FK graph. ScanAndIndex builds it,
	// but a manual/settings-triggered detect (or a file indexed before the schema
	// pass existed) may not have it yet — build it once so cascade isn't a silent
	// false negative. SchemaBuilt gates this so later detects don't re-decode DDL.
	if !srv.store.SchemaBuilt(fileID) {
		if f, err := srv.store.GetFile(fileID); err == nil && f != nil {
			if berr := srv.buildSchema(fileID, f.Path); berr != nil {
				log.Printf("detect: schema build for file %d: %v", fileID, berr)
			}
		}
	}
	srv.cfgMu.RLock()
	thr := srv.cfg.Anomaly
	srv.cfgMu.RUnlock()
	if err := srv.eng.Run(srv.store, fileID, thr); err != nil {
		log.Printf("detect file %d: %v", fileID, err)
		return err
	}
	srv.broadcast(fmt.Sprintf(`{"type":"anomalies_done","file_id":%d}`, fileID))
	return nil
}

// detectAll re-runs detection for every ready file (after a thresholds change).
func (srv *Server) detectAll() {
	files, err := srv.store.ListFiles()
	if err != nil {
		log.Printf("detectAll list files: %v", err)
		return
	}
	for _, f := range files {
		if f.State == store.FileStateReady {
			_ = srv.detect(f.ID)
		}
	}
}

func (srv *Server) broadcast(msg string) {
	srv.sseMu.Lock()
	defer srv.sseMu.Unlock()
	for ch := range srv.sseSubs {
		select {
		case ch <- msg:
		default: // slow consumer: drop
		}
	}
}

// triggerDetectAll runs detectAll in the background, coalescing concurrent
// requests. If a pass is already running, the request is recorded via
// detectDirty so the running goroutine does one more pass with the latest
// thresholds — a settings change mid-pass is never silently dropped.
func (srv *Server) triggerDetectAll() {
	if !srv.detectPending.CompareAndSwap(false, true) {
		srv.detectDirty.Store(true)
		return
	}
	go func() {
		for {
			srv.detectDirty.Store(false)
			srv.detectAll()
			if srv.detectDirty.Load() {
				continue // a trigger arrived during the pass; run again
			}
			srv.detectPending.Store(false)
			// Reclaim a trigger that raced between the Load above and this Store
			// (otherwise it would be silently dropped until the next trigger).
			if srv.detectDirty.Load() && srv.detectPending.CompareAndSwap(false, true) {
				continue
			}
			return
		}
	}()
}

// triggerScan runs ScanAndIndex in the background, coalescing concurrent
// requests. If a scan is already running, the request is recorded via scanDirty
// so the running goroutine does one more pass — a re-index click mid-scan is
// never silently dropped (which would leave the file stuck "indexing"). Mirrors
// triggerDetectAll, including the reclaim that closes the race between the dirty
// check and clearing the pending flag.
func (srv *Server) triggerScan() {
	if !srv.scanPending.CompareAndSwap(false, true) {
		srv.scanDirty.Store(true)
		return
	}
	go func() {
		for {
			srv.scanDirty.Store(false)
			if err := srv.ScanAndIndex(); err != nil {
				log.Printf("scan: %v", err)
			}
			if srv.scanDirty.Load() {
				continue // a trigger arrived during the pass; run again
			}
			srv.scanPending.Store(false)
			// Reclaim a trigger that raced between the Load above and this Store
			// (otherwise it would be silently dropped until the next trigger).
			if srv.scanDirty.Load() && srv.scanPending.CompareAndSwap(false, true) {
				continue
			}
			return
		}
	}()
}

// StartWatch starts the fsnotify live-tail watcher when cfg.Watch is set. On any
// change under WatchDir it triggers a (coalesced) scan. If the watcher cannot be
// created (fsnotify unavailable, dir unwatchable) it logs and returns — the app
// stays fully functional via manual/startup scans, just without live tail.
func (srv *Server) StartWatch(ctx context.Context) {
	srv.cfgMu.RLock()
	enabled := srv.cfg.Watch
	dir := srv.cfg.WatchDir
	srv.cfgMu.RUnlock()
	if !enabled {
		return
	}
	srv.watchOnce.Do(func() {
		w, err := watcher.New(dir, watchDebounce, srv.triggerScan)
		if err != nil {
			log.Printf("live-tail watcher disabled: %v", err)
			return
		}
		srv.watcher = w
		w.Start(ctx)
		log.Printf("live-tail watcher started on %s", dir)
	})
}

// StartStream boots the remote streamer when enabled. Idempotent per process
// start; settings changes go through restartStreamer.
func (srv *Server) StartStream(ctx context.Context) {
	srv.cfgMu.RLock()
	enabled := srv.cfg.Stream.Enabled
	srv.cfgMu.RUnlock()
	if !enabled {
		return
	}
	srv.streamMu.Lock()
	defer srv.streamMu.Unlock()
	srv.startStreamerLocked(ctx)
}

// startStreamerLocked builds + starts a Streamer from the current config.
// Caller holds streamMu.
func (srv *Server) startStreamerLocked(ctx context.Context) {
	srv.cfgMu.RLock()
	scfg := srv.cfg.Stream
	spool := srv.cfg.SpoolDir()
	srv.cfgMu.RUnlock()
	if err := os.MkdirAll(spool, 0o755); err != nil {
		log.Printf("streamer: create spool dir: %v", err)
		return
	}
	srv.startSpoolWatch(ctx, spool)
	s := streamer.New(scfg, spool, srv.store,
		srv.ScanAndIndex,
		func(st streamer.Status) {
			b, err := json.Marshal(st)
			if err != nil {
				return
			}
			srv.broadcast(fmt.Sprintf(`{"type":"stream_status","status":%s}`, b))
		})
	srv.streamer.Store(s)
	s.Start(ctx)
	log.Printf("streamer started → %s:%d (spool %s)", scfg.Host, scfg.Port, spool)
}

// restartStreamer applies a settings change: stop, then start if enabled.
// streamMu serialises restart sequences; Stop() is called while holding it
// so two concurrent restarts cannot interleave. Status reads use atomic.Load
// and never take streamMu, so they are not blocked here.
func (srv *Server) restartStreamer() {
	srv.streamMu.Lock()
	defer srv.streamMu.Unlock()
	if old := srv.streamer.Swap(nil); old != nil {
		old.Stop()
	}
	srv.cfgMu.RLock()
	enabled := srv.cfg.Stream.Enabled
	srv.cfgMu.RUnlock()
	if enabled {
		srv.startStreamerLocked(context.Background())
	}
}

// startSpoolWatch mirrors StartWatch for the spool dir so spooled appends
// drive the same coalesced-scan live-tail path as local files.
// The spoolWatchOnce once-guard is safe here because SpoolDir() derives from
// DataDir, which is boot-only and immutable at runtime — the spool path never
// changes, so a single watcher for its lifetime is correct and never needs
// recreating.
func (srv *Server) startSpoolWatch(ctx context.Context, dir string) {
	srv.spoolWatchOnce.Do(func() {
		w, err := watcher.New(dir, watchDebounce, srv.triggerScan)
		if err != nil {
			log.Printf("spool watcher disabled (manual rescans still work): %v", err)
			return
		}
		srv.spoolWatcher = w
		w.Start(ctx)
	})
}

// Handler returns the full HTTP mux.
func (srv *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/files", srv.handleListFiles)
	mux.HandleFunc("POST /api/files/{id}/reindex", srv.handleReindex)
	mux.HandleFunc("POST /api/files/{id}/detect", srv.handleDetect)
	mux.HandleFunc("GET /api/files/{id}/type-counts", srv.handleTypeCounts)
	mux.HandleFunc("GET /api/files/{id}/metrics", srv.handleMetrics)
	mux.HandleFunc("POST /api/rescan", srv.handleRescan)
	mux.HandleFunc("GET /api/events", srv.handleEvents)
	mux.HandleFunc("GET /api/events/{file}/{pos}", srv.handleEventDetail)
	mux.HandleFunc("GET /api/events/{file}/{pos}/hex", srv.handleEventHex)
	mux.HandleFunc("GET /api/events/{file}/{pos}/diff", srv.handleEventDiff)
	mux.HandleFunc("GET /api/txns", srv.handleTxns)
	mux.HandleFunc("GET /api/tables", srv.handleTables)
	mux.HandleFunc("GET /api/errors", srv.handleDecodeErrors)
	mux.HandleFunc("GET /api/anomalies", srv.handleAnomalies)
	mux.HandleFunc("GET /api/settings", srv.handleGetSettings)
	mux.HandleFunc("PUT /api/settings", srv.handlePutSettings)
	mux.HandleFunc("GET /api/adapters", srv.handleAdapters)
	mux.HandleFunc("GET /api/stream", srv.handleSSE)
	mux.HandleFunc("GET /api/stream/status", srv.handleStreamStatus)
	mux.HandleFunc("POST /api/stream/restart-from-current", srv.handleStreamRestart)
	mux.Handle("/", uiHandler())
	// guardBrowser inside logRequests so refused requests are still logged.
	return logRequests(guardBrowser(mux))
}

// statusRecorder wraps http.ResponseWriter to capture the status code and
// response size for request logging. It forwards Flush so SSE (which needs
// http.Flusher) keeps working through the wrapper.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// logRequests logs one line per HTTP request: method, path, status, bytes,
// duration. Long-lived SSE (/api/stream) logs when the connection closes.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, req)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		log.Printf("%s %s %d %dB %s", req.Method, req.URL.RequestURI(), rec.status, rec.bytes, time.Since(start).Round(time.Millisecond))
	})
}
