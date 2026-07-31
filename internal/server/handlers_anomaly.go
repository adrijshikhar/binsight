package server

import (
	"net/http"
	"strconv"

	"github.com/adrijshikhar/binsight/internal/store"
)

var validSeverity = map[string]bool{
	"": true, "critical": true, "high": true, "medium": true, "low": true,
}

func (srv *Server) handleAnomalies(w http.ResponseWriter, r *http.Request) {
	fid, err := fileIDParam(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	sev := r.URL.Query().Get("severity")
	if !validSeverity[sev] {
		respondError(w, http.StatusBadRequest, "invalid severity filter")
		return
	}
	anoms, err := srv.store.ListAnomalies(fid, sev)
	if err != nil {
		respondInternal(w, "list anomalies", err)
		return
	}
	if anoms == nil {
		anoms = []*store.Anomaly{}
	}
	respondJSON(w, http.StatusOK, anoms)
}

func (srv *Server) handleDetect(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid file id")
		return
	}
	if _, err := srv.store.GetFile(id); err != nil {
		respondError(w, http.StatusNotFound, "file not found")
		return
	}
	if err := srv.detect(id); err != nil {
		respondInternal(w, "detect file", err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "detection complete"})
}
