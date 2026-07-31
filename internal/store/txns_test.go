package store

import (
	"slices"
	"testing"
)

func TestListTxnGTIDs(t *testing.T) {
	s := newTestStore(t)
	f := &File{Path: "/spool/mysql-bin.000001", State: FileStateReady}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	txns := []*Txn{
		{FileID: f.ID, GTID: "aaaa-bbbb:1", StartPos: 200, EndPos: 400, Status: "committed"},
		{FileID: f.ID, GTID: "ANONYMOUS", StartPos: 400, EndPos: 500, Status: "committed"}, // ANONYMOUS literal — excluded
		{FileID: f.ID, GTID: "", StartPos: 500, EndPos: 600, Status: "committed"},          // empty gtid — excluded
		{FileID: f.ID, GTID: "aaaa-bbbb:3", StartPos: 600, EndPos: 900, Status: "committed"},
		{FileID: f.ID, GTID: "aaaa-bbbb:2", StartPos: 900, EndPos: 1100, Status: "rolled_back"}, // rolled_back — excluded despite non-empty gtid
		{FileID: f.ID, GTID: "aaaa-bbbb:4", StartPos: 1100, EndPos: 1200, Status: "incomplete"}, // open — excluded
		{FileID: f.ID, GTID: "aaaa-bbbb:5", StartPos: 1200, EndPos: 1500, Status: "committed"},  // above boundary — excluded
	}
	for _, x := range txns {
		if _, err := s.InsertTxn(x); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.ListTxnGTIDs(f.ID, 1200) // boundary at 1200
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"aaaa-bbbb:1", "aaaa-bbbb:3"}
	if !slices.Equal(got, want) {
		t.Errorf("got %v want %v", got, want)
	}
}
