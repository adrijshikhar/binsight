package mysqlbinlog

import (
	"strings"
	"testing"
)

const sample = `# at 425
#260603 11:42:01 server id 1  end_log_pos 477 CRC32 0x97bc1a29 	Update_rows: table id 108 flags: STMT_END_F
### UPDATE ` + "`shop`.`orders`" + `
### WHERE
###   @1=1001 /* INT meta=0 nullable=0 is_null=0 */
###   @2='pending' /* VARSTRING(80) meta=80 nullable=1 is_null=0 */
### SET
###   @1=1001 /* INT meta=0 nullable=0 is_null=0 */
###   @2='shipped' /* VARSTRING(80) meta=80 nullable=1 is_null=0 */
# at 477
#260603 11:42:02 server id 1  end_log_pos 508 CRC32 0x12345678 	Xid = 5731
# at 508
#260603 11:42:03 server id 1  end_log_pos 600 CRC32 0xabcdef01 	Query	thread_id=8	exec_time=0	error_code=0
SET TIMESTAMP=1655196579/*!*/;
TRUNCATE TABLE time_zone
/*!*/;
`

func TestParseEvents(t *testing.T) {
	evs, err := ParseText(strings.NewReader(sample), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 3 {
		t.Fatalf("want 3 events, got %d", len(evs))
	}

	up := evs[0]
	if up.Header.Pos != 425 || up.Header.NextPos != 477 {
		t.Fatalf("positions wrong: %+v", up.Header)
	}
	if up.Header.TypeName != "UPDATE_ROWS_V2" {
		t.Fatalf("type mapping wrong: %q", up.Header.TypeName)
	}
	if up.Header.ServerID != 1 {
		t.Fatalf("server id wrong: %+v", up.Header)
	}
	if up.Decoded == nil || up.Decoded.DB != "shop" || up.Decoded.Table != "orders" {
		t.Fatalf("table attribution wrong: %+v", up.Decoded)
	}
	if len(up.Decoded.Rows) != 1 {
		t.Fatalf("want 1 row image, got %d", len(up.Decoded.Rows))
	}
	r := up.Decoded.Rows[0]
	if len(r.Before) != 2 || len(r.After) != 2 {
		t.Fatalf("before/after wrong: %+v", r)
	}
	if r.Before[1] != "'pending'" || r.After[1] != "'shipped'" {
		t.Fatalf("values wrong: %+v", r)
	}
	if up.Confidence != "partial" {
		t.Fatalf("text decode must be partial confidence, got %q", up.Confidence)
	}

	if evs[1].Header.TypeName != "XID" || evs[1].Decoded.XID != 5731 {
		t.Fatalf("xid wrong: %+v", evs[1])
	}

	q := evs[2]
	if q.Header.TypeName != "QUERY" {
		t.Fatalf("query type wrong: %q", q.Header.TypeName)
	}
	if !strings.Contains(q.Decoded.SQL, "TRUNCATE TABLE time_zone") {
		t.Fatalf("sql not captured: %q", q.Decoded.SQL)
	}
}
