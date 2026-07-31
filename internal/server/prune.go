package server

import (
	"database/sql"
	"errors"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// pruneSpool enforces the retention cap: while total spool bytes exceed
// Stream.MaxSpoolBytes, delete the oldest spool file (numeric-suffix order)
// and its index rows. The newest file — the one being written — is never
// touched, so a single file larger than the cap survives. Called at the end
// of every ScanAndIndex pass (rotation also lands here via the spool watcher).
func (srv *Server) pruneSpool() {
	srv.cfgMu.RLock()
	enabled := srv.cfg.Stream.Enabled
	maxBytes := srv.cfg.Stream.MaxSpoolBytes
	spool := srv.cfg.SpoolDir()
	srv.cfgMu.RUnlock()
	if !enabled || maxBytes <= 0 {
		return
	}
	entries, err := os.ReadDir(spool)
	if err != nil {
		return // spool absent: nothing to prune
	}
	type sf struct {
		name string
		n    int
		size int64
	}
	var files []sf
	var total int64
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		i := strings.LastIndexByte(e.Name(), '.')
		if i < 0 {
			continue
		}
		n, err := strconv.Atoi(e.Name()[i+1:])
		if err != nil {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, sf{e.Name(), n, info.Size()})
		total += info.Size()
	}
	sort.Slice(files, func(i, j int) bool { return files[i].n < files[j].n })
	for _, f := range files[:max(0, len(files)-1)] { // newest always excluded
		if total <= maxBytes {
			break
		}
		path := filepath.Join(spool, f.name)
		row, err := srv.store.GetFileByPath(path)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			log.Printf("prune: lookup index row for %s: %v", f.name, err)
			continue // unknown DB error — skip to stay file/row consistent
		}
		if err == nil { // row exists
			if derr := srv.store.DeleteFile(row.ID); derr != nil {
				log.Printf("prune: delete index rows for %s: %v", f.name, derr)
				continue // keep file + rows consistent: don't orphan rows
			}
		}
		if err := os.Remove(path); err != nil {
			log.Printf("prune: remove %s: %v", f.name, err)
			continue
		}
		total -= f.size
		log.Printf("prune: removed spool file %s (%d bytes)", f.name, f.size)
	}
}
