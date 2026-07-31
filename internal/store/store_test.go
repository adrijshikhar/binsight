package store

import (
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestOpenMigrates(t *testing.T) {
	s := newTestStore(t)
	var n int
	err := s.DB.QueryRow(
		`SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN
		 ('files','events','txns','tables','decode_errors','settings','anomalies')`).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	if n != 7 {
		t.Fatalf("expected 7 tables, got %d", n)
	}
}

func TestFilesCRUD(t *testing.T) {
	s := newTestStore(t)
	f := &File{
		Path: "/data/binlog.000002", Size: 2100, MagicOK: true,
		FormatVersion: 4, ServerVersion: "8.0.29", ChecksumAlgo: "CRC32",
		State: FileStateIndexing,
	}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if f.ID == 0 {
		t.Fatal("ID not set on insert")
	}
	f.State = FileStateReady
	f.IndexedByAdapter = "go-mysql"
	f.LastIndexedOffset = 2100
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	files, err := s.ListFiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].State != FileStateReady || files[0].IndexedByAdapter != "go-mysql" {
		t.Fatalf("upsert did not update: %+v", files)
	}
	got, err := s.GetFile(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Path != f.Path {
		t.Fatalf("get mismatch: %+v", got)
	}
}

func TestDedupeFiles(t *testing.T) {
	s := newTestStore(t)
	// same physical file under relative + absolute path strings.
	// abs is whatever the relative path resolves to from this CWD.
	rel := "binlog.000001"
	abs, err := filepath.Abs(rel)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertFile(&File{Path: rel, State: FileStateReady, MagicOK: true}); err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertFile(&File{Path: abs, State: FileStateReady, MagicOK: true}); err != nil {
		t.Fatal(err)
	}
	// a distinct file must be left alone
	if err := s.UpsertFile(&File{Path: "/data/binlog.000002", State: FileStateReady, MagicOK: true}); err != nil {
		t.Fatal(err)
	}

	n, err := s.DedupeFiles()
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("want 1 dupe removed, got %d", n)
	}
	files, _ := s.ListFiles()
	if len(files) != 2 {
		t.Fatalf("want 2 files after dedupe, got %d: %+v", len(files), files)
	}
	for _, f := range files {
		if f.Path == rel {
			t.Fatal("relative-path dupe should have been deleted, absolute kept")
		}
	}
}
