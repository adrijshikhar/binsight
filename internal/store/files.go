package store

import (
	"path/filepath"
	"time"
)

const (
	FileStateIndexing = "indexing"
	FileStateReady    = "ready"
	FileStateError    = "error"
	FileStateGrowing  = "growing"
	FileStateStale    = "stale"
)

// File is one discovered binlog file plus its indexing state.
type File struct {
	ID                int64  `json:"id"`
	Path              string `json:"path"`
	Size              int64  `json:"size"`
	MagicOK           bool   `json:"magic_ok"`
	FormatVersion     int    `json:"format_version"`
	ServerVersion     string `json:"server_version"`
	ChecksumAlgo      string `json:"checksum_algo"`
	IndexedByAdapter  string `json:"indexed_by_adapter"`
	AdapterVersion    string `json:"adapter_version"`
	LastIndexedOffset int64  `json:"last_indexed_offset"`
	IndexedAt         string `json:"indexed_at"`
	State             string `json:"state"`
	Error             string `json:"error"`
	// Enrichment fields — NOT columns. Populated by handleListFiles from
	// AnomalyFileSummary; absent from fileCols/scanFile/UpsertFile.
	AnomalyCount       int64  `json:"anomaly_count"`
	AnomalyMaxSeverity string `json:"anomaly_max_severity,omitempty"`
	// Remote marks files living under the streaming spool dir. Enrichment —
	// not a column; populated by handleListFiles.
	Remote bool `json:"remote"`
}

func (s *Store) UpsertFile(f *File) error {
	f.IndexedAt = time.Now().UTC().Format(time.RFC3339)
	_, err := s.DB.Exec(`
		INSERT INTO files (path,size,magic_ok,format_version,server_version,checksum_algo,
			indexed_by_adapter,adapter_version,last_indexed_offset,indexed_at,state,error)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(path) DO UPDATE SET
			size=excluded.size, magic_ok=excluded.magic_ok,
			format_version=excluded.format_version, server_version=excluded.server_version,
			checksum_algo=excluded.checksum_algo, indexed_by_adapter=excluded.indexed_by_adapter,
			adapter_version=excluded.adapter_version, last_indexed_offset=excluded.last_indexed_offset,
			indexed_at=excluded.indexed_at, state=excluded.state, error=excluded.error`,
		f.Path, f.Size, f.MagicOK, f.FormatVersion, f.ServerVersion, f.ChecksumAlgo,
		f.IndexedByAdapter, f.AdapterVersion, f.LastIndexedOffset, f.IndexedAt, f.State, f.Error)
	if err != nil {
		return err
	}
	// Resolve the row id by path — reliable for both insert and conflict-update.
	return s.DB.QueryRow(`SELECT id FROM files WHERE path=?`, f.Path).Scan(&f.ID)
}

func scanFile(row interface{ Scan(...any) error }) (*File, error) {
	var f File
	err := row.Scan(&f.ID, &f.Path, &f.Size, &f.MagicOK, &f.FormatVersion, &f.ServerVersion,
		&f.ChecksumAlgo, &f.IndexedByAdapter, &f.AdapterVersion, &f.LastIndexedOffset,
		&f.IndexedAt, &f.State, &f.Error)
	return &f, err
}

const fileCols = `id,path,size,magic_ok,format_version,server_version,checksum_algo,
	indexed_by_adapter,adapter_version,last_indexed_offset,indexed_at,state,error`

func (s *Store) GetFile(id int64) (*File, error) {
	return scanFile(s.DB.QueryRow(`SELECT `+fileCols+` FROM files WHERE id=?`, id))
}

func (s *Store) GetFileByPath(path string) (*File, error) {
	return scanFile(s.DB.QueryRow(`SELECT `+fileCols+` FROM files WHERE path=?`, path))
}

func (s *Store) ListFiles() ([]*File, error) {
	rows, err := s.DB.Query(`SELECT ` + fileCols + ` FROM files ORDER BY path`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*File
	for rows.Next() {
		f, err := scanFile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// ClearFileIndex deletes all indexed data for a file (re-index, adapter switch).
// All four deletes run inside a single transaction so partial clears cannot occur.
func (s *Store) ClearFileIndex(fileID int64) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	for _, q := range []string{
		`DELETE FROM events WHERE file_id=?`,
		`DELETE FROM txns WHERE file_id=?`,
		`DELETE FROM tables WHERE file_id=?`,
		`DELETE FROM decode_errors WHERE file_id=?`,
		`DELETE FROM anomalies WHERE file_id=?`,
		`DELETE FROM columns WHERE table_schema_id IN (SELECT id FROM table_schemas WHERE file_id=?)`,
		`DELETE FROM table_schemas WHERE file_id=?`,
		`DELETE FROM fkeys WHERE file_id=?`,
	} {
		if _, err = tx.Exec(q, fileID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DeleteFile removes a file row and its indexed data (events/txns/tables/
// decode_errors cascade via ON DELETE CASCADE with foreign_keys enabled).
func (s *Store) DeleteFile(id int64) error {
	_, err := s.DB.Exec(`DELETE FROM files WHERE id=?`, id)
	return err
}

// DedupeFiles collapses rows that point at the same physical file under
// different path strings (e.g. a relative path indexed before scanner paths
// were canonicalized to absolute). Keeps one row per absolute path —
// preferring an already-absolute stored path — and deletes the rest. Returns
// the number of duplicate rows removed.
func (s *Store) DedupeFiles() (int, error) {
	files, err := s.ListFiles()
	if err != nil {
		return 0, err
	}
	type keep struct {
		id  int64
		abs bool
	}
	seen := map[string]keep{}
	var toDelete []int64
	for _, f := range files {
		abs := f.Path
		if a, err := filepath.Abs(f.Path); err == nil {
			abs = a
		}
		isAbs := filepath.IsAbs(f.Path)
		k, ok := seen[abs]
		if !ok {
			seen[abs] = keep{f.ID, isAbs}
			continue
		}
		// duplicate: keep whichever row stores the absolute path
		if isAbs && !k.abs {
			toDelete = append(toDelete, k.id)
			seen[abs] = keep{f.ID, isAbs}
		} else {
			toDelete = append(toDelete, f.ID)
		}
	}
	if len(toDelete) == 0 {
		return 0, nil
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	for _, id := range toDelete {
		if _, err = tx.Exec(`DELETE FROM files WHERE id=?`, id); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return len(toDelete), nil
}

// DeleteIndexedFrom removes all indexed rows at/after pos for a file — the
// previously-indexed open tail — so an append pass can re-insert it
// idempotently. Events and decode_errors are keyed by pos, txns by start_pos.
// Runs in one transaction.
func (s *Store) DeleteIndexedFrom(fileID, pos int64) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	for _, q := range []string{
		`DELETE FROM events WHERE file_id=? AND pos>=?`,
		`DELETE FROM txns WHERE file_id=? AND start_pos>=?`,
		`DELETE FROM decode_errors WHERE file_id=? AND pos>=?`,
	} {
		if _, err = tx.Exec(q, fileID, pos); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// FinalizeAppend atomically applies an append pass's per-table stat DELTAS
// (counters add onto persisted values; column_types_json replaces only when
// the delta carries one) and advances the file row (size, boundary, state).
// Atomicity is what makes additive aggregation crash-safe: deltas and the
// LastIndexedOffset advance land together or not at all, so a re-run can
// never double-count. Event/txn rows are inserted by the pass in separate
// batched transactions BEFORE this finalize; a crash in between leaves them
// orphaned above the un-advanced boundary, where the next pass's
// DeleteIndexedFrom (or a full re-index, since the file is still 'indexing')
// reclaims them — so the whole append is idempotent end to end.
func (s *Store) FinalizeAppend(f *File, deltas []*TableStat) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	for _, d := range deltas {
		if _, err = tx.Exec(`INSERT INTO tables
			(file_id,db_name,table_name,table_map_count,column_types_json,
			 inserts,updates,deletes,rows_total,bytes_total)
			VALUES (?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(file_id,db_name,table_name) DO UPDATE SET
				table_map_count = tables.table_map_count + excluded.table_map_count,
				column_types_json = CASE WHEN excluded.column_types_json != ''
					THEN excluded.column_types_json ELSE tables.column_types_json END,
				inserts = tables.inserts + excluded.inserts,
				updates = tables.updates + excluded.updates,
				deletes = tables.deletes + excluded.deletes,
				rows_total = tables.rows_total + excluded.rows_total,
				bytes_total = tables.bytes_total + excluded.bytes_total`,
			d.FileID, d.DBName, d.TableName, d.TableMapCount, d.ColumnTypesJSON,
			d.Inserts, d.Updates, d.Deletes, d.RowsTotal, d.BytesTotal); err != nil {
			return err
		}
	}
	f.IndexedAt = time.Now().UTC().Format(time.RFC3339) // same format as UpsertFile
	if _, err = tx.Exec(`UPDATE files SET size=?, last_indexed_offset=?, state=?,
		error='', indexed_at=? WHERE id=?`,
		f.Size, f.LastIndexedOffset, f.State, f.IndexedAt, f.ID); err != nil {
		return err
	}
	return tx.Commit()
}
