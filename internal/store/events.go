package store

import (
	"fmt"
	"strings"

	"github.com/adrijshikhar/binsight/internal/sqlkw"
)

// EventRow is one indexed event (metadata only — no row values).
type EventRow struct {
	ID         int64  `json:"id"`
	FileID     int64  `json:"file_id"`
	Pos        int64  `json:"pos"`
	EndPos     int64  `json:"end_pos"`
	Size       int64  `json:"size"`
	TS         int64  `json:"ts"`
	TypeCode   int    `json:"type_code"`
	TypeName   string `json:"type_name"`
	ServerID   int64  `json:"server_id"`
	Flags      int    `json:"flags"`
	TxnID      int64  `json:"txn_id,omitempty"`
	TableID    int64  `json:"table_id,omitempty"`
	DBName     string `json:"db_name,omitempty"`
	TableName  string `json:"table_name,omitempty"`
	RowsCount  int64  `json:"rows_count"`
	Summary    string `json:"summary"`
	Confidence string `json:"decode_confidence"`
}

// InsertEvents bulk-inserts in one transaction (called in batches by indexer).
func (s *Store) InsertEvents(evs []*EventRow) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO events
		(file_id,pos,end_pos,size,ts,type_code,type_name,server_id,flags,
		 txn_id,table_id,db_name,table_name,rows_count,summary,decode_confidence)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, e := range evs {
		if e.Confidence == "" {
			e.Confidence = "full"
		}
		var txnID, tableID any
		if e.TxnID != 0 {
			txnID = e.TxnID
		}
		if e.TableID != 0 {
			tableID = e.TableID
		}
		if _, err := stmt.Exec(e.FileID, e.Pos, e.EndPos, e.Size, e.TS, e.TypeCode,
			e.TypeName, e.ServerID, e.Flags, txnID, tableID,
			nullIfEmpty(e.DBName), nullIfEmpty(e.TableName),
			e.RowsCount, e.Summary, e.Confidence); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// EventFilter composes WHERE conditions; zero/empty values mean "no filter".
// TypeNames, DBs, Tables and TxnIDs are multi-select: any of the listed values
// matches (IN).
type EventFilter struct {
	FileID    int64
	TypeNames []string
	DBs       []string
	Tables    []string
	TxnIDs    []int64
	FromTS    int64
	ToTS      int64
	FromPos   int64
	ToPos     int64
	Q         string
	Cursor    int64 // last pos of previous page; 0 = first page
	Limit     int
	Tail      int // >0: return the newest N matching events (ignores Cursor), ascending
}

// EventPage is one page of filtered events plus pagination state.
type EventPage struct {
	Events     []*EventRow `json:"events"`
	NextCursor int64       `json:"next_cursor"` // 0 = no more
	Total      int64       `json:"total"`       // total matching (without pagination)
}

func buildWhere(f EventFilter) (string, []any) {
	conds := []string{"file_id = ?"}
	args := []any{f.FileID}
	add := func(c string, v any) { conds = append(conds, c); args = append(args, v) }
	addIn := func(col string, vals []any) {
		ph := make([]string, len(vals))
		for i := range ph {
			ph[i] = "?"
		}
		conds = append(conds, col+" IN ("+strings.Join(ph, ",")+")")
		args = append(args, vals...)
	}
	addInStr := func(col string, vals []string) {
		anyVals := make([]any, len(vals))
		for i, v := range vals {
			anyVals[i] = v
		}
		addIn(col, anyVals)
	}
	if len(f.TypeNames) > 0 {
		addInStr("type_name", f.TypeNames)
	}
	if len(f.DBs) > 0 {
		addInStr("db_name", f.DBs)
	}
	if len(f.Tables) > 0 {
		addInStr("table_name", f.Tables)
	}
	if len(f.TxnIDs) > 0 {
		vals := make([]any, len(f.TxnIDs))
		for i, id := range f.TxnIDs {
			vals[i] = id
		}
		addIn("txn_id", vals)
	}
	if f.FromTS != 0 {
		add("ts >= ?", f.FromTS)
	}
	if f.ToTS != 0 {
		add("ts <= ?", f.ToTS)
	}
	if f.FromPos != 0 {
		add("pos >= ?", f.FromPos)
	}
	if f.ToPos != 0 {
		add("pos <= ?", f.ToPos)
	}
	if f.Q != "" {
		// Escape LIKE metacharacters so a search for "100%" or "order_id" matches
		// literally instead of as wildcards.
		esc := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Q)
		add(`summary LIKE ? ESCAPE '\'`, "%"+esc+"%")
	}
	return strings.Join(conds, " AND "), args
}

// QueryEvents returns a cursor-paginated, filtered page ordered by pos.
// When f.Tail>0 it instead returns the newest f.Tail events ascending, with no NextCursor.
func (s *Store) QueryEvents(f EventFilter) (*EventPage, error) {
	if f.Limit <= 0 || f.Limit > 1000 {
		f.Limit = 500
	}
	where, args := buildWhere(f)

	var total int64
	if f.Tail == 0 {
		if err := s.DB.QueryRow(`SELECT count(*) FROM events WHERE `+where, args...).Scan(&total); err != nil {
			return nil, err
		}
	}

	const cols = `id,file_id,pos,end_pos,size,ts,type_code,type_name,server_id,flags,
		COALESCE(txn_id,0),COALESCE(table_id,0),COALESCE(db_name,''),COALESCE(table_name,''),
		rows_count,summary,decode_confidence`

	if f.Tail > 0 {
		n := f.Tail
		if n > 1000 {
			n = 1000
		}
		// Newest N by pos, then reversed to ascending for display. No cursor.
		q := fmt.Sprintf(`SELECT %s FROM events WHERE %s ORDER BY pos DESC LIMIT ?`, cols, where)
		rows, err := s.DB.Query(q, append(args, n)...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		page := &EventPage{Total: total}
		for rows.Next() {
			e, err := scanEventRow(rows)
			if err != nil {
				return nil, err
			}
			page.Events = append(page.Events, e)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		// Reverse in place: DESC fetch → ascending display.
		for i, j := 0, len(page.Events)-1; i < j; i, j = i+1, j-1 {
			page.Events[i], page.Events[j] = page.Events[j], page.Events[i]
		}
		// Tail has no forward pagination cursor.
		return page, nil
	}

	q := fmt.Sprintf(`SELECT %s
		FROM events WHERE %s AND pos > ? ORDER BY pos LIMIT ?`, cols, where)
	rows, err := s.DB.Query(q, append(args, f.Cursor, f.Limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	page := &EventPage{Total: total}
	for rows.Next() {
		e, err := scanEventRow(rows)
		if err != nil {
			return nil, err
		}
		page.Events = append(page.Events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(page.Events) == f.Limit {
		page.NextCursor = page.Events[len(page.Events)-1].Pos
	}
	return page, nil
}

// scanEventRow scans one events row in the canonical column order used by
// QueryEvents (both the tail and forward-cursor queries).
func scanEventRow(rows interface{ Scan(...any) error }) (*EventRow, error) {
	var e EventRow
	if err := rows.Scan(&e.ID, &e.FileID, &e.Pos, &e.EndPos, &e.Size, &e.TS, &e.TypeCode,
		&e.TypeName, &e.ServerID, &e.Flags, &e.TxnID, &e.TableID, &e.DBName, &e.TableName,
		&e.RowsCount, &e.Summary, &e.Confidence); err != nil {
		return nil, err
	}
	return &e, nil
}

// GetEventAt returns the index row at an exact position (detail/hex/diff need size+type).
func (s *Store) GetEventAt(fileID, pos int64) (*EventRow, error) {
	row := s.DB.QueryRow(`SELECT id,file_id,pos,end_pos,size,ts,type_code,type_name,server_id,flags,
		COALESCE(txn_id,0),COALESCE(table_id,0),COALESCE(db_name,''),COALESCE(table_name,''),
		rows_count,summary,decode_confidence
		FROM events WHERE file_id=? AND pos=?`, fileID, pos)
	return scanEventRow(row)
}

// TypeCount is one event-type tally within a file (sidebar breakdown).
type TypeCount struct {
	TypeName  string `json:"type_name"`
	Count     int64  `json:"count"`
	RowsTotal int64  `json:"rows_total"`
}

// rowEventTypes are the DML row-image event type names (both v1 and v2).
var rowEventTypes = []string{
	"WRITE_ROWS_V2", "WRITE_ROWS_V1",
	"UPDATE_ROWS_V2", "UPDATE_ROWS_V1",
	"DELETE_ROWS_V2", "DELETE_ROWS_V1",
}

func rowTypeInClause() (string, []any) {
	ph := make([]string, len(rowEventTypes))
	args := make([]any, len(rowEventTypes))
	for i, t := range rowEventTypes {
		ph[i] = "?"
		args[i] = t
	}
	return strings.Join(ph, ","), args
}

// RowEventsAtLeast returns DML row events whose rows_count >= minRows
// (bulk_row_event detector input), ordered by pos.
func (s *Store) RowEventsAtLeast(fileID, minRows int64) ([]*EventRow, error) {
	in, typeArgs := rowTypeInClause()
	q := `SELECT id,file_id,pos,end_pos,size,ts,type_code,type_name,server_id,flags,
		COALESCE(txn_id,0),COALESCE(table_id,0),COALESCE(db_name,''),COALESCE(table_name,''),
		rows_count,summary,decode_confidence
		FROM events WHERE file_id=? AND rows_count>=? AND type_name IN (` + in + `)
		ORDER BY pos`
	args := append([]any{fileID, minRows}, typeArgs...)
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEventRows(rows)
}

// CountRowEvents counts DML row events in a file (schema_churn DML-presence check).
func (s *Store) CountRowEvents(fileID int64) (int64, error) {
	in, typeArgs := rowTypeInClause()
	args := append([]any{fileID}, typeArgs...)
	var n int64
	err := s.DB.QueryRow(`SELECT count(*) FROM events WHERE file_id=? AND type_name IN (`+in+`)`, args...).Scan(&n)
	return n, err
}

// DeleteRowEvent is a minimal DELETE row-event projection (txn + table) used by
// the cascade_risk detector to reason about FK-parent deletes per transaction.
type DeleteRowEvent struct {
	Txn   int64
	Pos   uint64
	DB    string
	Table string
}

// DeleteRowEventsByTable returns every DELETE row event in a file (both v1 and
// v2 images) with its transaction, position, db and table, ordered by pos.
// txn_id is COALESCE'd to 0 when NULL.
func (s *Store) DeleteRowEventsByTable(fileID int64) ([]DeleteRowEvent, error) {
	rows, err := s.DB.Query(`SELECT COALESCE(txn_id,0),pos,COALESCE(db_name,''),COALESCE(table_name,'')
		FROM events WHERE file_id=? AND type_name IN ('DELETE_ROWS_V1','DELETE_ROWS_V2')
		ORDER BY pos`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DeleteRowEvent
	for rows.Next() {
		var d DeleteRowEvent
		if err := rows.Scan(&d.Txn, &d.Pos, &d.DB, &d.Table); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DDLEvents returns QUERY events that are DDL (CREATE/ALTER/DROP/TRUNCATE by
// SQL-summary prefix), excluding BEGIN, ordered by pos. Shared input for the
// schema_churn detector and the Schema/DDL view.
func (s *Store) DDLEvents(fileID int64) ([]*EventRow, error) {
	rows, err := s.DB.Query(`SELECT id,file_id,pos,end_pos,size,ts,type_code,type_name,server_id,flags,
		COALESCE(txn_id,0),COALESCE(table_id,0),COALESCE(db_name,''),COALESCE(table_name,''),
		rows_count,summary,decode_confidence
		FROM events WHERE file_id=? AND type_name='QUERY' ORDER BY pos`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	all, err := scanEventRows(rows)
	if err != nil {
		return nil, err
	}
	var out []*EventRow
	for _, e := range all {
		if sqlkw.IsDDL(e.Summary) {
			out = append(out, e)
		}
	}
	return out, nil
}

// scanEventRows scans rows of the standard event column list into EventRows.
func scanEventRows(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]*EventRow, error) {
	var out []*EventRow
	for rows.Next() {
		e, err := scanEventRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// TxnByteSizes returns the TRUE byte size of each transaction, summed from
// event LENGTH fields (immune to the uint32 end_log_pos wrap on > 4 GiB
// files). Keyed by txn id. Events not attached to a txn (txn_id 0/NULL) are
// excluded. See CLAUDE.md "Binlog format gotchas" — end_pos-start_pos
// under-reports a wrapped txn by a multiple of 2^32, so this is the reliable
// per-txn size source.
func (s *Store) TxnByteSizes(fileID int64) (map[int64]int64, error) {
	rows, err := s.DB.Query(`SELECT txn_id, COALESCE(SUM(size),0)
		FROM events WHERE file_id=? AND txn_id IS NOT NULL AND txn_id!=0
		GROUP BY txn_id`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]int64{}
	for rows.Next() {
		var id, bytes int64
		if err := rows.Scan(&id, &bytes); err != nil {
			return nil, err
		}
		out[id] = bytes
	}
	return out, rows.Err()
}

// EventTypeCounts returns per-type event counts for a file, busiest first.
func (s *Store) EventTypeCounts(fileID int64) ([]*TypeCount, error) {
	rows, err := s.DB.Query(`SELECT type_name, count(*), COALESCE(sum(rows_count),0)
		FROM events WHERE file_id=? GROUP BY type_name ORDER BY count(*) DESC, type_name`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*TypeCount
	for rows.Next() {
		var c TypeCount
		if err := rows.Scan(&c.TypeName, &c.Count, &c.RowsTotal); err != nil {
			return nil, err
		}
		out = append(out, &c)
	}
	return out, rows.Err()
}
