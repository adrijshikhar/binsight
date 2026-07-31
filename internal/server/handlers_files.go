package server

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/adrijshikhar/binsight/internal/store"
)

func (srv *Server) handleListFiles(w http.ResponseWriter, r *http.Request) {
	files, err := srv.store.ListFiles()
	if err != nil {
		respondInternal(w, "list files", err)
		return
	}
	if files == nil {
		files = []*store.File{}
	}
	summary, err := srv.store.AnomalyFileSummary()
	if err != nil {
		respondInternal(w, "anomaly file summary", err)
		return
	}
	for _, f := range files {
		if s, ok := summary[f.ID]; ok {
			f.AnomalyCount = s.Count
			f.AnomalyMaxSeverity = s.MaxSeverity
		}
	}
	for _, f := range files {
		f.Remote = srv.isSpoolPath(f.Path)
	}
	respondJSON(w, http.StatusOK, files)
}

func (srv *Server) handleReindex(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid file id")
		return
	}
	f, err := srv.store.GetFile(id)
	if err != nil {
		respondError(w, http.StatusNotFound, "file not found")
		return
	}
	f.State = store.FileStateIndexing
	f.LastIndexedOffset = 0
	f.IndexedByAdapter = ""
	if err := srv.store.UpsertFile(f); err != nil {
		respondInternal(w, "upsert file", err)
		return
	}
	srv.triggerScan()
	respondJSON(w, http.StatusAccepted, map[string]string{"status": "reindex scheduled"})
}

func (srv *Server) handleRescan(w http.ResponseWriter, r *http.Request) {
	srv.triggerScan()
	respondJSON(w, http.StatusAccepted, map[string]string{"status": "rescan scheduled"})
}

func (srv *Server) handleTypeCounts(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid file id")
		return
	}
	counts, err := srv.store.EventTypeCounts(id)
	if err != nil {
		respondInternal(w, "event type counts", err)
		return
	}
	if counts == nil {
		counts = []*store.TypeCount{}
	}
	respondJSON(w, http.StatusOK, counts)
}

func (srv *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid file id")
		return
	}
	m, err := srv.store.Metrics(id)
	if err != nil {
		if errors.Is(err, store.ErrFileNotFound) {
			respondError(w, http.StatusNotFound, "file not found")
			return
		}
		respondInternal(w, "file metrics", err)
		return
	}
	respondJSON(w, http.StatusOK, m)
}
