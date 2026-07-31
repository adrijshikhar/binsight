// Package store is the SQLite index. Metadata only — no row values are
// stored; the binlog file remains the source of truth and the index is
// always disposable/rebuildable.
package store

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

type Store struct {
	DB *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	// modernc/sqlite: single writer; serialize all access to avoid SQLITE_BUSY.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(migration); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{DB: db}, nil
}

func (s *Store) Close() error { return s.DB.Close() }
