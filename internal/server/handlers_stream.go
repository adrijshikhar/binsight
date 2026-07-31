package server

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/adrijshikhar/binsight/internal/streamer"
)

func (srv *Server) handleStreamStatus(w http.ResponseWriter, r *http.Request) {
	// Lock-free read: atomic.Load never blocks behind a concurrent Stop().
	s := srv.streamer.Load()
	if s == nil {
		respondJSON(w, http.StatusOK, streamer.Status{State: streamer.StateDisabled})
		return
	}
	respondJSON(w, http.StatusOK, s.Status())
}

// handleStreamRestart is the recovery action for a purged resume point: wipe
// the spool (files + index rows) and reconnect from the server's current file.
//
// streamMu is held for the entire stop→wipe→restart sequence to prevent a
// concurrent restartStreamer (e.g. from a settings save) from starting a new
// streamer that writes into the spool directory while it is being wiped.
// startStreamerLocked is used instead of restartStreamer to avoid re-acquiring
// the already-held streamMu (which would deadlock on a plain Mutex).
//
// Lock order: streamMu → scanMu. scanMu is held only around the wipe itself
// (ListFiles + DeleteFile loop + os.RemoveAll) and released before calling
// startStreamerLocked, whose async reindex would itself acquire scanMu.
func (srv *Server) handleStreamRestart(w http.ResponseWriter, r *http.Request) {
	srv.streamMu.Lock()
	defer srv.streamMu.Unlock()

	if old := srv.streamer.Swap(nil); old != nil {
		old.Stop()
	}

	// Snapshot config under cfgMu; do not hold cfgMu while calling
	// startStreamerLocked (it acquires its own cfgMu.RLock internally).
	srv.cfgMu.RLock()
	spool := srv.cfg.SpoolDir()
	enabled := srv.cfg.Stream.Enabled
	srv.cfgMu.RUnlock()

	// Refuse the wipe when streaming is disabled: there is nothing to restart,
	// and the response message would be misleading.
	if !enabled {
		respondError(w, http.StatusConflict, "remote streaming is disabled; enable it before restarting from current")
		return
	}

	// Hold scanMu around the wipe so the spool fsnotify watcher cannot trigger
	// a concurrent ScanAndIndex that re-inserts orphan rows or hits ENOENT
	// mid-scan while we are removing files.
	srv.scanMu.Lock()
	files, err := srv.store.ListFiles()
	if err != nil {
		srv.scanMu.Unlock()
		respondInternal(w, "list files", err)
		return
	}
	for _, f := range files {
		if srv.isSpoolPath(f.Path) {
			if derr := srv.store.DeleteFile(f.ID); derr != nil {
				log.Printf("restart-from-current: delete row %s: %v", f.Path, derr)
			}
		}
	}
	rmErr := os.RemoveAll(spool)
	srv.scanMu.Unlock()
	if rmErr != nil {
		respondInternal(w, "clear spool", rmErr)
		return
	}

	// context.Background, NOT r.Context: the restarted streamer must outlive
	// this HTTP request (r.Context is cancelled when the response is sent).
	srv.startStreamerLocked(context.Background())
	respondJSON(w, http.StatusAccepted, map[string]string{"status": "stream restarting from current position"})
}
