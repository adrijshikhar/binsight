package store

import "testing"

func seedEvents(t *testing.T, s *Store) int64 {
	t.Helper()
	f := &File{Path: "/data/b1", State: FileStateReady, MagicOK: true}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	txnID, err := s.InsertTxn(&Txn{FileID: f.ID, GTID: "ANONYMOUS", StartPos: 100, Status: "committed"})
	if err != nil {
		t.Fatal(err)
	}
	evs := []*EventRow{
		{FileID: f.ID, Pos: 100, EndPos: 180, Size: 80, TS: 1000, TypeCode: 33, TypeName: "GTID", TxnID: txnID},
		{FileID: f.ID, Pos: 180, EndPos: 260, Size: 80, TS: 1000, TypeCode: 2, TypeName: "QUERY", TxnID: txnID, Summary: "BEGIN"},
		{FileID: f.ID, Pos: 260, EndPos: 340, Size: 80, TS: 1001, TypeCode: 19, TypeName: "TABLE_MAP", TxnID: txnID, DBName: "shop", TableName: "orders"},
		{FileID: f.ID, Pos: 340, EndPos: 460, Size: 120, TS: 1001, TypeCode: 31, TypeName: "UPDATE_ROWS_V2", TxnID: txnID, DBName: "shop", TableName: "orders", RowsCount: 1},
		{FileID: f.ID, Pos: 460, EndPos: 500, Size: 40, TS: 1002, TypeCode: 16, TypeName: "XID", TxnID: txnID, Summary: "Xid commit"},
		{FileID: f.ID, Pos: 500, EndPos: 620, Size: 120, TS: 1003, TypeCode: 30, TypeName: "WRITE_ROWS_V2", DBName: "warehouse", TableName: "stock", RowsCount: 3},
	}
	if err := s.InsertEvents(evs); err != nil {
		t.Fatal(err)
	}
	return f.ID
}

func TestEventFilterAndCursor(t *testing.T) {
	s := newTestStore(t)
	fid := seedEvents(t, s)

	res, err := s.QueryEvents(EventFilter{FileID: fid, Tables: []string{"orders"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 2 {
		t.Fatalf("want 2 orders events, got %d", len(res.Events))
	}

	// multi-select tables: orders (2) + stock (1) = 3
	res, err = s.QueryEvents(EventFilter{FileID: fid, Tables: []string{"orders", "stock"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 3 {
		t.Fatalf("want 3 events across orders+stock, got %d", len(res.Events))
	}

	// multi-select dbs: shop (TABLE_MAP+UPDATE) + warehouse (WRITE) = 3
	res, err = s.QueryEvents(EventFilter{FileID: fid, DBs: []string{"shop", "warehouse"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 3 {
		t.Fatalf("want 3 events across shop+warehouse, got %d", len(res.Events))
	}

	res, err = s.QueryEvents(EventFilter{FileID: fid, TypeNames: []string{"UPDATE_ROWS_V2"}, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 1 || res.Events[0].Pos != 340 {
		t.Fatalf("type filter wrong: %+v", res.Events)
	}

	res, err = s.QueryEvents(EventFilter{FileID: fid, Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 2 || res.NextCursor != 180 {
		t.Fatalf("page1 wrong: n=%d cursor=%d", len(res.Events), res.NextCursor)
	}
	res, err = s.QueryEvents(EventFilter{FileID: fid, Limit: 2, Cursor: res.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 2 || res.Events[0].Pos != 260 {
		t.Fatalf("page2 wrong: %+v", res.Events)
	}

	res, err = s.QueryEvents(EventFilter{FileID: fid, Q: "BEGIN", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 1 || res.Events[0].Pos != 180 {
		t.Fatalf("q filter wrong: %+v", res.Events)
	}
}

// The Q filter escapes LIKE metacharacters (% _ \) so a search matches
// literally. Without the escape, `_` is SQLite's any-single-char wildcard and
// `order_id` would also match `orderXid`.
func TestEventQEscapesLikeMetachars(t *testing.T) {
	s := newTestStore(t)
	f := &File{Path: "/data/like", State: FileStateReady, MagicOK: true}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	evs := []*EventRow{
		{FileID: f.ID, Pos: 10, TypeName: "QUERY", Summary: "INSERT INTO order_id VALUES (1)"},
		{FileID: f.ID, Pos: 20, TypeName: "QUERY", Summary: "INSERT INTO orderXid VALUES (2)"},
		{FileID: f.ID, Pos: 30, TypeName: "QUERY", Summary: "discount 100% applied"},
		{FileID: f.ID, Pos: 40, TypeName: "QUERY", Summary: "discount 100USD applied"},
	}
	if err := s.InsertEvents(evs); err != nil {
		t.Fatal(err)
	}

	// `_` must be literal: only the order_id row matches, not orderXid.
	res, err := s.QueryEvents(EventFilter{FileID: f.ID, Q: "order_id", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 1 || res.Events[0].Pos != 10 {
		t.Fatalf("underscore must be literal: want only pos 10, got %+v", res.Events)
	}

	// `%` must be literal: only the "100%" row matches, not "100USD".
	res, err = s.QueryEvents(EventFilter{FileID: f.ID, Q: "100%", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 1 || res.Events[0].Pos != 30 {
		t.Fatalf("percent must be literal: want only pos 30, got %+v", res.Events)
	}
}

func TestTablesUpsertAggregates(t *testing.T) {
	s := newTestStore(t)
	fid := seedEvents(t, s)
	tb := &TableStat{FileID: fid, DBName: "shop", TableName: "orders",
		ColumnTypesJSON: `["INT","VARSTRING"]`, Inserts: 5, RowsTotal: 5, BytesTotal: 400, TableMapCount: 1}
	if err := s.UpsertTableStat(tb); err != nil {
		t.Fatal(err)
	}
	tb.Inserts = 7
	tb.RowsTotal = 7
	if err := s.UpsertTableStat(tb); err != nil {
		t.Fatal(err)
	}
	got, err := s.ListTableStats(fid)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Inserts != 7 {
		t.Fatalf("upsert should replace counts: %+v", got)
	}
}

func TestSettings(t *testing.T) {
	s := newTestStore(t)
	if err := s.SetSetting("roles", `{"indexer":"go-mysql"}`); err != nil {
		t.Fatal(err)
	}
	v, err := s.GetSetting("roles")
	if err != nil {
		t.Fatal(err)
	}
	if v != `{"indexer":"go-mysql"}` {
		t.Fatalf("got %q", v)
	}
	if _, err := s.GetSetting("missing"); err == nil {
		t.Fatal("missing key must error")
	}
}

func TestEventTypeCounts(t *testing.T) {
	s := newTestStore(t)
	fid := seedEvents(t, s)
	counts, err := s.EventTypeCounts(fid)
	if err != nil {
		t.Fatal(err)
	}
	byType := map[string]*TypeCount{}
	for _, c := range counts {
		byType[c.TypeName] = c
	}
	if byType["GTID"].Count != 1 || byType["UPDATE_ROWS_V2"].Count != 1 {
		t.Fatalf("type counts wrong: %+v", counts)
	}
	if byType["UPDATE_ROWS_V2"].RowsTotal != 1 {
		t.Fatalf("rows_total wrong: %+v", byType["UPDATE_ROWS_V2"])
	}
	// ordered busiest-first (all 1 here → tie broken by name, stable)
	if len(counts) != 6 {
		t.Fatalf("want 6 distinct types, got %d", len(counts))
	}
}

func TestDeleteRowEventsByTable(t *testing.T) {
	s := newTestStore(t)
	f := &File{Path: "/data/binlog.000020", MagicOK: true, State: FileStateReady}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	evs := []*EventRow{
		{FileID: f.ID, Pos: 300, TypeName: "DELETE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "users", RowsCount: 1},
		{FileID: f.ID, Pos: 100, TypeName: "DELETE_ROWS_V1", TxnID: 2, DBName: "shop", TableName: "orders", RowsCount: 4},
		{FileID: f.ID, Pos: 200, TypeName: "WRITE_ROWS_V2", TxnID: 1, DBName: "shop", TableName: "users", RowsCount: 2},
		{FileID: f.ID, Pos: 400, TypeName: "DELETE_ROWS_V2", DBName: "shop", TableName: "products", RowsCount: 1},
	}
	if err := s.InsertEvents(evs); err != nil {
		t.Fatal(err)
	}
	got, err := s.DeleteRowEventsByTable(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("want 3 delete events (no WRITE), got %d: %+v", len(got), got)
	}
	// ordered by pos: orders(100), users(300), products(400)
	if got[0].Pos != 100 || got[0].Table != "orders" || got[0].Txn != 2 {
		t.Errorf("row0 wrong: %+v", got[0])
	}
	if got[1].Pos != 300 || got[1].Table != "users" || got[1].Txn != 1 || got[1].DB != "shop" {
		t.Errorf("row1 wrong: %+v", got[1])
	}
	// txn_id NULL coalesces to 0
	if got[2].Pos != 400 || got[2].Txn != 0 {
		t.Errorf("row2 (null txn) wrong: %+v", got[2])
	}
}

func TestDetectorEventHelpers(t *testing.T) {
	s := newTestStore(t)
	f := &File{Path: "/data/binlog.000010", MagicOK: true, State: FileStateReady}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	evs := []*EventRow{
		{FileID: f.ID, Pos: 100, TypeName: "WRITE_ROWS_V2", RowsCount: 60000, DBName: "db", TableName: "t"},
		{FileID: f.ID, Pos: 200, TypeName: "WRITE_ROWS_V2", RowsCount: 10},
		{FileID: f.ID, Pos: 300, TypeName: "QUERY", Summary: "TRUNCATE TABLE t"},
		{FileID: f.ID, Pos: 400, TypeName: "QUERY", Summary: "BEGIN"},
	}
	if err := s.InsertEvents(evs); err != nil {
		t.Fatal(err)
	}

	bulk, err := s.RowEventsAtLeast(f.ID, 50000)
	if err != nil {
		t.Fatal(err)
	}
	if len(bulk) != 1 || bulk[0].Pos != 100 {
		t.Fatalf("RowEventsAtLeast wrong: %+v", bulk)
	}

	n, err := s.CountRowEvents(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("CountRowEvents want 2, got %d", n)
	}

	ddl, err := s.DDLEvents(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(ddl) != 1 || ddl[0].Pos != 300 {
		t.Fatalf("DDLEvents should return TRUNCATE only (not BEGIN): %+v", ddl)
	}
}

func TestQueryEventsTail(t *testing.T) {
	s := newTestStore(t)
	fid := seedEvents(t, s)

	// Tail=2 → the two highest-pos events (460, 500), returned ascending.
	res, err := s.QueryEvents(EventFilter{FileID: fid, Tail: 2, Limit: 500})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 2 {
		t.Fatalf("tail=2 must return 2 events, got %d", len(res.Events))
	}
	if res.Events[0].Pos != 460 || res.Events[1].Pos != 500 {
		t.Fatalf("tail must return newest events ascending (460,500), got %d,%d",
			res.Events[0].Pos, res.Events[1].Pos)
	}
	if res.Total != 0 {
		t.Fatalf("tail response should not compute Total, got %d", res.Total)
	}

	// Tail respects filters: tail of orders-only (pos 260,340) → both, ascending.
	res, err = s.QueryEvents(EventFilter{FileID: fid, Tables: []string{"orders"}, Tail: 5, Limit: 500})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Events) != 2 || res.Events[0].Pos != 260 || res.Events[1].Pos != 340 {
		t.Fatalf("tail with table filter wrong: %+v", res.Events)
	}
}
