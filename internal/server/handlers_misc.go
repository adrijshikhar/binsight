package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/anomaly"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/store"
)

func fileIDParam(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.URL.Query().Get("file"), 10, 64)
	if err != nil || id == 0 {
		return 0, fmt.Errorf("file param required and numeric")
	}
	return id, nil
}

func (srv *Server) handleTxns(w http.ResponseWriter, r *http.Request) {
	fid, err := fileIDParam(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	txns, err := srv.store.ListTxns(fid)
	if err != nil {
		respondInternal(w, "list txns", err)
		return
	}
	if txns == nil {
		txns = []*store.Txn{}
	}
	respondJSON(w, http.StatusOK, txns)
}

func (srv *Server) handleTables(w http.ResponseWriter, r *http.Request) {
	fid, err := fileIDParam(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	tables, err := srv.store.ListTableStats(fid)
	if err != nil {
		respondInternal(w, "list table stats", err)
		return
	}
	if tables == nil {
		tables = []*store.TableStat{}
	}
	respondJSON(w, http.StatusOK, tables)
}

func (srv *Server) handleDecodeErrors(w http.ResponseWriter, r *http.Request) {
	fid, err := fileIDParam(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	errs, err := srv.store.ListDecodeErrors(fid)
	if err != nil {
		respondInternal(w, "list decode errors", err)
		return
	}
	if errs == nil {
		errs = []*store.DecodeError{}
	}
	respondJSON(w, http.StatusOK, errs)
}

// settingsResponse is Config with the replication password withheld. GET
// /api/settings is unauthenticated, and that password is a credential for a
// *different* system (REPLICATION SLAVE on the source server), so it must not
// leave this process. The UI only needs to know whether one is stored.
type settingsResponse struct {
	*config.Config
	StreamPasswordSet bool `json:"stream_password_set"`
}

// redactSettings takes its Config by value, so blanking the password affects
// only the copy that is about to be serialized.
func redactSettings(c config.Config) settingsResponse {
	set := c.Stream.Password != ""
	c.Stream.Password = ""
	return settingsResponse{Config: &c, StreamPasswordSet: set}
}

func (srv *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	srv.cfgMu.RLock()
	snapshot := *srv.cfg
	srv.cfgMu.RUnlock()
	respondJSON(w, http.StatusOK, redactSettings(snapshot))
}

// settingsRequest carries only the fields the unauthenticated PUT /api/settings
// may change. Boot-time fields (Port, DataDir, WatchDir) are absent so a client
// omitting them can never zero them out. MysqlbinlogPath is ALSO intentionally
// excluded: it names an executable the server runs, so letting the HTTP API set
// it would be an arbitrary-command-execution vector. It is boot/env-only
// (BV_MYSQLBINLOG_PATH).
// maxPageSize bounds the persisted PageSize; larger client values are clamped.
const maxPageSize = 1000

// validTimezone is the allowlist of accepted Timezone modes; other values are
// ignored on PUT /api/settings rather than persisted.
var validTimezone = map[string]bool{"utc": true, "local": true}

type settingsRequest struct {
	PageSize int                `json:"page_size"`
	Timezone string             `json:"timezone"`
	Roles    config.Roles       `json:"roles"`
	Anomaly  anomaly.Thresholds `json:"anomaly"`
	Stream   *config.Stream     `json:"stream"` // nil = untouched
}

func (srv *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var req settingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid settings json: "+err.Error())
		return
	}
	// validate roles against registry capabilities before persisting
	if req.Roles.Indexer != "" {
		if err := srv.reg.SetRole(adapter.RoleIndexer, req.Roles.Indexer); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if req.Roles.Detail != "" {
		if err := srv.reg.SetRole(adapter.RoleDetail, req.Roles.Detail); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if len(req.Roles.Diff) > 0 {
		if err := srv.reg.SetDiffSet(req.Roles.Diff); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	if req.Stream != nil {
		if req.Stream.Flavor == "" {
			req.Stream.Flavor = "mysql"
		}
		if req.Stream.Flavor != "mysql" && req.Stream.Flavor != "mariadb" {
			respondError(w, http.StatusBadRequest, "stream.flavor must be mysql or mariadb")
			return
		}
		if req.Stream.Enabled && (req.Stream.Host == "" || req.Stream.User == "") {
			respondError(w, http.StatusBadRequest, "stream.host and stream.user are required when streaming is enabled")
			return
		}
		if req.Stream.Port <= 0 || req.Stream.Port > 65535 {
			req.Stream.Port = 3306
		}
		if req.Stream.ServerID == 0 {
			req.Stream.ServerID = 51789
		}
		if req.Stream.MaxSpoolBytes <= 0 {
			req.Stream.MaxSpoolBytes = 2 << 30
		}
	}

	// Apply only user-settable fields; preserve boot-time fields (Port,
	// DataDir, WatchDir) which are set via CLI args / env vars and must not
	// be clobbered by a partial client payload.
	srv.cfgMu.Lock()
	streamChanged := false
	if req.Stream != nil {
		// An empty password means "keep the stored one" — redactSettings never
		// hands it back, so a round-tripped payload would otherwise wipe it.
		// Backfill BEFORE the comparison below, or every save looks like a
		// change and needlessly restarts the streamer. Consequence: the stored
		// password can no longer be cleared through the API, only replaced;
		// disabling streaming is the way to stop using it.
		if req.Stream.Password == "" {
			req.Stream.Password = srv.cfg.Stream.Password
		}
		if *req.Stream != srv.cfg.Stream {
			srv.cfg.Stream = *req.Stream
			streamChanged = true
		}
	}
	if req.PageSize > 0 {
		if req.PageSize > maxPageSize {
			req.PageSize = maxPageSize
		}
		srv.cfg.PageSize = req.PageSize
	}
	// Only persist a recognised timezone mode; unknown values are ignored so a
	// malformed client payload can never poison the stored setting.
	if validTimezone[req.Timezone] {
		srv.cfg.Timezone = req.Timezone
	}
	if req.Roles.Indexer != "" {
		srv.cfg.Roles.Indexer = req.Roles.Indexer
	}
	if req.Roles.Detail != "" {
		srv.cfg.Roles.Detail = req.Roles.Detail
	}
	if len(req.Roles.Diff) > 0 {
		srv.cfg.Roles.Diff = req.Roles.Diff
	}
	if req.Anomaly.TxnBytes > 0 {
		srv.cfg.Anomaly.TxnBytes = req.Anomaly.TxnBytes
	}
	if req.Anomaly.TxnRows > 0 {
		srv.cfg.Anomaly.TxnRows = req.Anomaly.TxnRows
	}
	if req.Anomaly.TxnSeconds > 0 {
		srv.cfg.Anomaly.TxnSeconds = req.Anomaly.TxnSeconds
	}
	if req.Anomaly.EventRows > 0 {
		srv.cfg.Anomaly.EventRows = req.Anomaly.EventRows
	}
	snapshot := *srv.cfg
	srv.cfgMu.Unlock()

	if err := config.Save(srv.store, &snapshot); err != nil {
		respondInternal(w, "save settings", err)
		return
	}
	srv.triggerDetectAll()
	if streamChanged {
		go srv.restartStreamer() // may dial out; never block the settings response
	}
	respondJSON(w, http.StatusOK, redactSettings(snapshot))
}

type adapterInfo struct {
	Name         string               `json:"name"`
	Capabilities adapter.Capabilities `json:"capabilities"`
}

func (srv *Server) handleAdapters(w http.ResponseWriter, r *http.Request) {
	out := []adapterInfo{}
	for _, d := range srv.reg.All() {
		out = append(out, adapterInfo{Name: d.Name(), Capabilities: d.Capabilities()})
	}
	respondJSON(w, http.StatusOK, out)
}

func (srv *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		respondError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	ch := make(chan string, 16)
	srv.sseMu.Lock()
	srv.sseSubs[ch] = struct{}{}
	srv.sseMu.Unlock()
	defer func() {
		srv.sseMu.Lock()
		delete(srv.sseSubs, ch)
		srv.sseMu.Unlock()
	}()
	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-ch:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		}
	}
}
