package server

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/adrijshikhar/binsight/internal/store"
)

// maxFilterValues caps how many CSV values a single IN-clause filter
// (type/db/table/txn) may carry, bounding the generated SQL placeholder count.
const maxFilterValues = 200

// csvParam splits a comma-separated query value into trimmed, non-empty parts.
func csvParam(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// capValues truncates a filter slice to maxFilterValues elements, logging when
// it does so — silent truncation would hide that the result set is incomplete.
func capValues(name string, v []string) []string {
	if len(v) > maxFilterValues {
		log.Printf("events: %q filter has %d values, truncated to %d — result set may be incomplete", name, len(v), maxFilterValues)
		return v[:maxFilterValues]
	}
	return v
}

// parseInt64 returns 0 for empty strings, error only for malformed values.
func parseInt64(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	return strconv.ParseInt(s, 10, 64)
}

func (srv *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var f store.EventFilter
	var err error
	if f.FileID, err = parseInt64(q.Get("file")); err != nil || f.FileID == 0 {
		respondError(w, http.StatusBadRequest, "file param required and numeric")
		return
	}
	for _, s := range csvParam(q.Get("txn")) {
		id, perr := strconv.ParseInt(s, 10, 64)
		if perr != nil {
			respondError(w, http.StatusBadRequest, "invalid txn")
			return
		}
		f.TxnIDs = append(f.TxnIDs, id)
	}
	if len(f.TxnIDs) > maxFilterValues {
		log.Printf("events: \"txn\" filter has %d values, truncated to %d — result set may be incomplete", len(f.TxnIDs), maxFilterValues)
		f.TxnIDs = f.TxnIDs[:maxFilterValues]
	}
	if f.FromTS, err = parseInt64(q.Get("from_ts")); err != nil {
		respondError(w, http.StatusBadRequest, "invalid from_ts")
		return
	}
	if f.ToTS, err = parseInt64(q.Get("to_ts")); err != nil {
		respondError(w, http.StatusBadRequest, "invalid to_ts")
		return
	}
	if f.FromPos, err = parseInt64(q.Get("from_pos")); err != nil {
		respondError(w, http.StatusBadRequest, "invalid from_pos")
		return
	}
	if f.ToPos, err = parseInt64(q.Get("to_pos")); err != nil {
		respondError(w, http.StatusBadRequest, "invalid to_pos")
		return
	}
	if f.Cursor, err = parseInt64(q.Get("cursor")); err != nil {
		respondError(w, http.StatusBadRequest, "invalid cursor")
		return
	}
	tail, err := parseInt64(q.Get("tail"))
	if err != nil || tail < 0 {
		respondError(w, http.StatusBadRequest, "invalid tail")
		return
	}
	f.Tail = int(tail)
	lim, err := parseInt64(q.Get("limit"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid limit")
		return
	}
	f.Limit = int(lim)
	f.TypeNames = capValues("type", csvParam(q.Get("type")))
	f.DBs = capValues("db", csvParam(q.Get("db")))
	f.Tables = capValues("table", csvParam(q.Get("table")))
	f.Q = q.Get("q")

	page, err := srv.store.QueryEvents(f)
	if err != nil {
		respondInternal(w, "query events", err)
		return
	}
	if page.Events == nil {
		page.Events = []*store.EventRow{}
	}
	respondJSON(w, http.StatusOK, page)
}
