package store

import "testing"

// seedAppendFixture inserts a file with events/txns/decode_errors straddling
// pos 300, for DeleteIndexedFrom split assertions.
func seedAppendFixture(t *testing.T, s *Store) int64 {
	t.Helper()
	f := &File{Path: "/data/append", State: FileStateReady, MagicOK: true}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if _, err := s.InsertTxn(&Txn{FileID: f.ID, GTID: "a:1", StartPos: 100, EndPos: 290, Status: "committed"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.InsertTxn(&Txn{FileID: f.ID, GTID: "a:2", StartPos: 300, EndPos: 0, Status: "incomplete"}); err != nil {
		t.Fatal(err)
	}
	evs := []*EventRow{
		{FileID: f.ID, Pos: 100, EndPos: 180, TypeName: "GTID"},
		{FileID: f.ID, Pos: 180, EndPos: 290, TypeName: "XID"},
		{FileID: f.ID, Pos: 300, EndPos: 380, TypeName: "GTID"},
		{FileID: f.ID, Pos: 380, EndPos: 460, TypeName: "WRITE_ROWS_V2"},
	}
	if err := s.InsertEvents(evs); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertDecodeError(&DecodeError{FileID: f.ID, Pos: 120, Adapter: "x", Message: "m"}); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertDecodeError(&DecodeError{FileID: f.ID, Pos: 350, Adapter: "x", Message: "m"}); err != nil {
		t.Fatal(err)
	}
	return f.ID
}

func TestDeleteIndexedFrom(t *testing.T) {
	s := newTestStore(t)
	fid := seedAppendFixture(t, s)

	if err := s.DeleteIndexedFrom(fid, 300); err != nil {
		t.Fatal(err)
	}
	page, err := s.QueryEvents(EventFilter{FileID: fid, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Events) != 2 || page.Events[1].Pos != 180 {
		t.Fatalf("events >= 300 must be gone, kept %+v", page.Events)
	}
	txns, err := s.ListTxns(fid)
	if err != nil {
		t.Fatal(err)
	}
	if len(txns) != 1 || txns[0].StartPos != 100 {
		t.Fatalf("txns with start_pos >= 300 must be gone, kept %+v", txns)
	}
	var nde int
	if err := s.DB.QueryRow(`SELECT count(*) FROM decode_errors WHERE file_id=?`, fid).Scan(&nde); err != nil {
		t.Fatal(err)
	}
	if nde != 1 {
		t.Fatalf("decode_errors at/after 300 must be gone, got %d rows", nde)
	}
}

func TestFinalizeAppendAdditive(t *testing.T) {
	s := newTestStore(t)
	f := &File{Path: "/data/fin", State: FileStateIndexing, MagicOK: true, Size: 1000}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	// Pre-existing stats from the full pass.
	if err := s.UpsertTableStat(&TableStat{FileID: f.ID, DBName: "shop", TableName: "orders",
		ColumnTypesJSON: `["INT"]`, Inserts: 5, RowsTotal: 5, BytesTotal: 100, TableMapCount: 2}); err != nil {
		t.Fatal(err)
	}

	f.LastIndexedOffset = 900
	f.State = FileStateReady
	deltas := []*TableStat{
		// Existing table: counters add; column types replace.
		{FileID: f.ID, DBName: "shop", TableName: "orders",
			ColumnTypesJSON: `["INT","VARCHAR"]`, Inserts: 3, Updates: 1, RowsTotal: 4, BytesTotal: 40, TableMapCount: 1},
		// New table appearing only in the tail.
		{FileID: f.ID, DBName: "shop", TableName: "users",
			ColumnTypesJSON: `["INT"]`, Inserts: 2, RowsTotal: 2, BytesTotal: 20, TableMapCount: 1},
	}
	if err := s.FinalizeAppend(f, deltas); err != nil {
		t.Fatal(err)
	}

	stats, err := s.ListTableStats(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]*TableStat{}
	for _, st := range stats {
		byName[st.TableName] = st
	}
	o := byName["orders"]
	if o == nil || o.Inserts != 8 || o.Updates != 1 || o.RowsTotal != 9 || o.BytesTotal != 140 || o.TableMapCount != 3 {
		t.Fatalf("orders deltas not added: %+v", o)
	}
	if o.ColumnTypesJSON != `["INT","VARCHAR"]` {
		t.Fatalf("column types must replace-latest, got %q", o.ColumnTypesJSON)
	}
	u := byName["users"]
	if u == nil || u.Inserts != 2 {
		t.Fatalf("new tail table not inserted: %+v", u)
	}

	got, err := s.GetFile(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.LastIndexedOffset != 900 || got.State != FileStateReady {
		t.Fatalf("files row not finalized: offset=%d state=%q", got.LastIndexedOffset, got.State)
	}
}

// An empty-column-types delta must NOT clobber the persisted column types.
func TestFinalizeAppendEmptyColTypesKept(t *testing.T) {
	s := newTestStore(t)
	f := &File{Path: "/data/fin2", State: FileStateIndexing, MagicOK: true}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertTableStat(&TableStat{FileID: f.ID, DBName: "d", TableName: "t",
		ColumnTypesJSON: `["INT"]`, Inserts: 1, RowsTotal: 1}); err != nil {
		t.Fatal(err)
	}
	f.State = FileStateReady
	if err := s.FinalizeAppend(f, []*TableStat{{FileID: f.ID, DBName: "d", TableName: "t", Inserts: 1, RowsTotal: 1}}); err != nil {
		t.Fatal(err)
	}
	stats, _ := s.ListTableStats(f.ID)
	if len(stats) != 1 || stats[0].ColumnTypesJSON != `["INT"]` || stats[0].Inserts != 2 {
		t.Fatalf("empty delta col-types must keep existing: %+v", stats)
	}
}
