package store

import "testing"

func TestMigrationCreatesSchemaTables(t *testing.T) {
	s := newTestStore(t)
	var n int
	err := s.DB.QueryRow(
		`SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN
		 ('table_schemas','columns','fkeys')`).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("expected 3 schema tables (table_schemas, columns, fkeys), got %d", n)
	}
}
