package server

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/diffsvc"
	"github.com/adrijshikhar/binsight/internal/hexsvc"
	"github.com/adrijshikhar/binsight/internal/schema"
	"github.com/adrijshikhar/binsight/internal/store"
)

// errBadCoords flags a malformed {file}/{pos} path param (client error → 400).
var errBadCoords = errors.New("bad coords")

// eventCoords resolves {file}/{pos} path params to file + indexed event row.
// Lookup errors are wrapped so callers can distinguish sql.ErrNoRows (404) from
// other store errors (500); a bad path param wraps errBadCoords (400).
func (srv *Server) eventCoords(r *http.Request) (*store.File, *store.EventRow, error) {
	fid, err := strconv.ParseInt(r.PathValue("file"), 10, 64)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid file id: %w", errBadCoords)
	}
	pos, err := strconv.ParseInt(r.PathValue("pos"), 10, 64)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid pos: %w", errBadCoords)
	}
	f, err := srv.store.GetFile(fid)
	if err != nil {
		return nil, nil, fmt.Errorf("get file %d: %w", fid, err)
	}
	ev, err := srv.store.GetEventAt(fid, pos)
	if err != nil {
		return nil, nil, fmt.Errorf("get event at file %d pos %d: %w", fid, pos, err)
	}
	return f, ev, nil
}

// respondCoordsError maps an eventCoords error to the right HTTP status:
// errBadCoords → 400, sql.ErrNoRows → 404, anything else → generic 500.
func respondCoordsError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errBadCoords):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, sql.ErrNoRows):
		respondError(w, http.StatusNotFound, "not found")
	default:
		respondInternal(w, "event coords", err)
	}
}

func (srv *Server) handleEventDetail(w http.ResponseWriter, r *http.Request) {
	f, evRow, err := srv.eventCoords(r)
	if err != nil {
		respondCoordsError(w, err)
		return
	}
	dec := srv.reg.ForRole(adapter.RoleDetail)
	if dec == nil {
		respondError(w, http.StatusServiceUnavailable, "no detail adapter configured")
		return
	}
	stream, err := dec.Decode(r.Context(), adapter.Source{Path: f.Path},
		adapter.DecodeOpts{AtPos: uint64(evRow.Pos)})
	if err != nil {
		respondInternal(w, "decode event", err)
		return
	}
	defer stream.Close()
	ev, err := stream.Next()
	if errors.Is(err, io.EOF) {
		respondError(w, http.StatusNotFound, "adapter found no event at pos")
		return
	}
	if err != nil {
		respondInternal(w, "decode event stream", err)
		return
	}
	srv.enrichColumnNames(ev, f.ID, evRow)
	respondJSON(w, http.StatusOK, ev)
}

// enrichColumnNames fills decoded.ColumnNames from the persisted table schema
// when the event lacks FULL row metadata (ColumnNames empty). FULL metadata,
// when present, is never overridden. The fill is count-guarded: it applies only
// when the schema's column count exactly matches the event's column count
// (preferring the TABLE_MAP type count, else the widest row image).
func (srv *Server) enrichColumnNames(ev *schema.Event, fileID int64, evRow *store.EventRow) {
	if ev == nil {
		return
	}
	d := ev.Decoded
	if d == nil || len(d.ColumnNames) != 0 {
		return
	}
	db, table := d.DB, d.Table
	if db == "" || table == "" {
		if evRow != nil {
			db, table = evRow.DBName, evRow.TableName
		}
	}
	if table == "" {
		return
	}
	n := len(d.ColumnTypes)
	if n == 0 && len(d.Rows) > 0 {
		n = len(d.Rows[0].After)
		if len(d.Rows[0].Before) > n {
			n = len(d.Rows[0].Before)
		}
	}
	if names := schemaColumnNames(srv.store, fileID, db, table, n); names != nil {
		d.ColumnNames = names
	}
}

// schemaColumnNames returns the ordered column names for (fileID,db,table) only
// when a full-confidence schema exists and its column count equals n (n>0).
// Returns nil otherwise so callers leave ColumnNames empty.
func schemaColumnNames(st *store.Store, fileID int64, db, table string, n int) []string {
	if n <= 0 {
		return nil
	}
	cols, err := st.GetColumns(fileID, db, table)
	if err != nil || len(cols) != n {
		return nil
	}
	names := make([]string, n)
	for i, c := range cols {
		names[i] = c.Name
	}
	return names
}

func (srv *Server) handleEventHex(w http.ResponseWriter, r *http.Request) {
	f, evRow, err := srv.eventCoords(r)
	if err != nil {
		respondCoordsError(w, err)
		return
	}
	off, err := parseInt64(r.URL.Query().Get("off"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid off")
		return
	}
	winLen, err := parseInt64(r.URL.Query().Get("len"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid len")
		return
	}
	res, err := hexsvc.ReadEvent(f.Path, evRow.Pos, evRow.Size, f.ChecksumAlgo, off, winLen)
	if err != nil {
		respondInternal(w, "read event hex", err)
		return
	}
	respondJSON(w, http.StatusOK, res)
}

func (srv *Server) handleEventDiff(w http.ResponseWriter, r *http.Request) {
	f, evRow, err := srv.eventCoords(r)
	if err != nil {
		respondCoordsError(w, err)
		return
	}
	set := srv.reg.DiffSet()
	if len(set) == 0 {
		respondError(w, http.StatusServiceUnavailable, "diff set empty")
		return
	}
	res, err := diffsvc.Diff(r.Context(), set, f.Path, uint64(evRow.Pos))
	if err != nil {
		respondInternal(w, "diff event", err)
		return
	}
	respondJSON(w, http.StatusOK, res)
}
