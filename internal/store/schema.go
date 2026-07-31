package store

import (
	"database/sql"
	"errors"
)

// SchemaColumn is one column of a parsed table schema (ordered by Ordinal).
type SchemaColumn struct {
	Ordinal  int
	Name     string
	DataType string
	IsPK     bool
	Nullable bool
}

// FKey is one foreign-key edge parsed from a CREATE/ALTER. Column lists are
// comma-joined into a single string per side.
type FKey struct {
	ChildDB     string
	ChildTable  string
	ChildCols   string
	ParentDB    string
	ParentTable string
	ParentCols  string
	OnDelete    string
}

// UpsertTableSchema idempotently replaces the schema for (fileID,db,table):
// any existing table_schemas row and its columns are deleted, then a fresh row
// plus its columns are inserted. column_count is derived from len(cols).
func (s *Store) UpsertTableSchema(fileID int64, db, table string, cols []SchemaColumn, confidence string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	// delete existing columns (by schema id) then the schema row.
	if _, err := tx.Exec(`DELETE FROM columns WHERE table_schema_id IN
		(SELECT id FROM table_schemas WHERE file_id=? AND db_name=? AND table_name=?)`,
		fileID, db, table); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM table_schemas WHERE file_id=? AND db_name=? AND table_name=?`,
		fileID, db, table); err != nil {
		_ = tx.Rollback()
		return err
	}
	res, err := tx.Exec(`INSERT INTO table_schemas (file_id,db_name,table_name,column_count,confidence)
		VALUES (?,?,?,?,?)`, fileID, db, table, len(cols), confidence)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	schemaID, err := res.LastInsertId()
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO columns
		(table_schema_id,ordinal,name,data_type,is_pk,nullable) VALUES (?,?,?,?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, c := range cols {
		if _, err := stmt.Exec(schemaID, c.Ordinal, c.Name, c.DataType,
			boolToInt(c.IsPK), boolToInt(c.Nullable)); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// GetColumns returns the columns for (fileID,db,table) ordered by ordinal, but
// only when the schema row exists and its confidence is 'full'. A missing row
// or a partial-confidence schema returns (nil,nil) so callers don't surface
// unreliable column lists.
func (s *Store) GetColumns(fileID int64, db, table string) ([]SchemaColumn, error) {
	var schemaID int64
	var confidence string
	err := s.DB.QueryRow(`SELECT id,confidence FROM table_schemas
		WHERE file_id=? AND db_name=? AND table_name=?`, fileID, db, table).Scan(&schemaID, &confidence)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if confidence != "full" {
		return nil, nil
	}
	rows, err := s.DB.Query(`SELECT ordinal,name,data_type,is_pk,nullable
		FROM columns WHERE table_schema_id=? ORDER BY ordinal`, schemaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SchemaColumn
	for rows.Next() {
		var c SchemaColumn
		var isPK, nullable int
		if err := rows.Scan(&c.Ordinal, &c.Name, &c.DataType, &isPK, &nullable); err != nil {
			return nil, err
		}
		c.IsPK = isPK != 0
		c.Nullable = nullable != 0
		out = append(out, c)
	}
	return out, rows.Err()
}

// TableColumnCount returns the stored column_count for (fileID,db,table) and
// whether a schema row exists. The count is reported regardless of confidence.
func (s *Store) TableColumnCount(fileID int64, db, table string) (int, bool) {
	var count int
	err := s.DB.QueryRow(`SELECT column_count FROM table_schemas
		WHERE file_id=? AND db_name=? AND table_name=?`, fileID, db, table).Scan(&count)
	if err != nil {
		return 0, false
	}
	return count, true
}

// InsertFKeys bulk-inserts foreign-key edges in one transaction (no-op on empty).
func (s *Store) InsertFKeys(fileID int64, fks []FKey) error {
	if len(fks) == 0 {
		return nil
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO fkeys
		(file_id,child_db,child_table,child_cols,parent_db,parent_table,parent_cols,on_delete)
		VALUES (?,?,?,?,?,?,?,?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, fk := range fks {
		if _, err := stmt.Exec(fileID, fk.ChildDB, fk.ChildTable, fk.ChildCols,
			fk.ParentDB, fk.ParentTable, fk.ParentCols, fk.OnDelete); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ParentFKeys returns the foreign keys whose parent side is (db,table) in the
// given file — the inbound edges referencing that table.
func (s *Store) ParentFKeys(fileID int64, db, table string) ([]FKey, error) {
	rows, err := s.DB.Query(`SELECT child_db,child_table,child_cols,parent_db,parent_table,parent_cols,on_delete
		FROM fkeys WHERE file_id=? AND parent_db=? AND parent_table=?`, fileID, db, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FKey
	for rows.Next() {
		var fk FKey
		if err := rows.Scan(&fk.ChildDB, &fk.ChildTable, &fk.ChildCols,
			&fk.ParentDB, &fk.ParentTable, &fk.ParentCols, &fk.OnDelete); err != nil {
			return nil, err
		}
		out = append(out, fk)
	}
	return out, rows.Err()
}

// ClearSchema removes all parsed-schema data for a file: orphan columns (joined
// via table_schemas ids), the table_schemas rows, and the fkeys rows. Idempotent.
func (s *Store) ClearSchema(fileID int64) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM columns WHERE table_schema_id IN
		(SELECT id FROM table_schemas WHERE file_id=?)`, fileID); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM table_schemas WHERE file_id=?`, fileID); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM fkeys WHERE file_id=?`, fileID); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// SchemaBuilt reports whether the schema-build pass has run for a file (it has
// persisted table_schemas or fkeys rows). Lets detect build the FK graph on the
// first pass for files indexed before the schema pass existed, without
// re-decoding DDL on every later detect.
func (s *Store) SchemaBuilt(fileID int64) bool {
	var n int
	_ = s.DB.QueryRow(`SELECT
		(SELECT COUNT(*) FROM table_schemas WHERE file_id=?) +
		(SELECT COUNT(*) FROM fkeys WHERE file_id=?)`, fileID, fileID).Scan(&n)
	return n > 0
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
