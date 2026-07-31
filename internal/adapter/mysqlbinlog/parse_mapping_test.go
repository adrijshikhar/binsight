package mysqlbinlog

import (
	"strings"
	"testing"

	"github.com/adrijshikhar/binsight/internal/schema"
)

// 8.0+ event labels that older typeMaps lacked: PARTIAL_UPDATE_ROWS (partial
// JSON updates) and TRANSACTION_PAYLOAD (compressed transactions). Without these
// the text adapter emitted UNKNOWN_* / type_code 0x00, which the L2 oracle flags
// as a header-layer disagreement against go-mysql.
const mappingSample = `# at 425
#260603 11:42:01 server id 1  end_log_pos 520 CRC32 0x97bc1a29 	Update_rows_partial: table id 108 flags: STMT_END_F
# at 520
#260603 11:42:02 server id 1  end_log_pos 700 CRC32 0x12345678 	Transaction_Payload		payload_size=180	compression_type=ZSTD	uncompressed_size=236
`

// keepPos bounds memory on a seek decode: every event is parsed (so a later row
// event can use its preceding TABLE_MAP), but only the event AT keepPos is
// retained. Lock both the filter and the full-decode (keepPos==0) behaviors.
func TestParseTextKeepPosRetainsOnlyTarget(t *testing.T) {
	// keepPos at the 2nd event: only it survives, but the count was still correct.
	evs, err := ParseText(strings.NewReader(mappingSample), 520)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("keepPos=520 must retain exactly 1 event, got %d", len(evs))
	}
	if evs[0].Header.Pos != 520 {
		t.Errorf("retained event pos = %d, want 520", evs[0].Header.Pos)
	}

	// keepPos at the 1st event.
	evs, err = ParseText(strings.NewReader(mappingSample), 425)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || evs[0].Header.Pos != 425 {
		t.Fatalf("keepPos=425 must retain only pos 425, got %+v", evs)
	}

	// keepPos matching no event retains nothing.
	evs, err = ParseText(strings.NewReader(mappingSample), 999)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 0 {
		t.Fatalf("keepPos=999 (no match) must retain nothing, got %d", len(evs))
	}

	// keepPos==0 keeps every event (full decode).
	evs, err = ParseText(strings.NewReader(mappingSample), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 2 {
		t.Fatalf("keepPos=0 must keep all events, got %d", len(evs))
	}
}

func TestParseEventTypeMappings(t *testing.T) {
	evs, err := ParseText(strings.NewReader(mappingSample), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 2 {
		t.Fatalf("want 2 events, got %d", len(evs))
	}

	if got := evs[0].Header.TypeName; got != "PARTIAL_UPDATE_ROWS" {
		t.Errorf("Update_rows_partial → %q, want PARTIAL_UPDATE_ROWS", got)
	}
	if got := evs[0].Header.TypeCode; got != 0x27 {
		t.Errorf("Update_rows_partial type code = 0x%02X, want 0x27", got)
	}

	if got := evs[1].Header.TypeName; got != "TRANSACTION_PAYLOAD" {
		t.Errorf("Transaction_Payload → %q, want TRANSACTION_PAYLOAD", got)
	}
	if got := evs[1].Header.TypeCode; got != 0x28 {
		t.Errorf("Transaction_Payload type code = 0x%02X, want 0x28", got)
	}
}

// The GTID header line carries only commit metadata; the real GTID is on the
// following SET @@SESSION.GTID_NEXT line. Lock that the parser reads the latter.
const gtidSample = `# at 200
#260603 11:42:01 server id 1  end_log_pos 277 CRC32 0x11111111 	GTID	last_committed=0	sequence_number=1	rbr_only=yes
SET @@SESSION.GTID_NEXT= '9e796fa4-611d-11f1-b0de-1ad177d950d5:7'/*!*/;
# at 277
#260603 11:42:02 server id 1  end_log_pos 350 CRC32 0x22222222 	Query	thread_id=8
BEGIN
/*!*/;
`

func TestParseGTIDFromGTIDNext(t *testing.T) {
	evs, err := ParseText(strings.NewReader(gtidSample), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) < 1 || evs[0].Header.TypeName != "GTID" {
		t.Fatalf("first event not GTID: %+v", evs)
	}
	if evs[0].Decoded == nil || evs[0].Decoded.GTID != "9e796fa4-611d-11f1-b0de-1ad177d950d5:7" {
		t.Errorf("GTID = %+v, want the uuid:seqno from GTID_NEXT (not the header metadata tail)", evs[0].Decoded)
	}
}

// QUERY events get their database from the preceding `use <db>` line, so
// decoded.db agrees with go-mysql (which reads QueryEvent.Schema).
const useDBSample = `# at 100
#260603 11:42:01 server id 1  end_log_pos 200 CRC32 0x11111111 	Query	thread_id=8	exec_time=0	error_code=0
use ` + "`shop`" + `/*!*/;
SET TIMESTAMP=1655196579/*!*/;
CREATE TABLE customers (id INT)
/*!*/;
`

// The reUse regex matches ONLY the strict session directive form
// "use `db`/*!*/;". A bare `use <db>` appearing in a QUERY body (e.g. a routine
// definition) must NOT be treated as the directive: it must neither overwrite
// the captured DB nor be dropped from the SQL body.
const useInBodySample = `# at 100
#260603 11:42:01 server id 1  end_log_pos 200 CRC32 0x11111111 	Query	thread_id=8
use ` + "`shop`" + `/*!*/;
SET TIMESTAMP=1655196579/*!*/;
CREATE PROCEDURE p() use audit_db
/*!*/;
`

func TestParseUseInBodyNotTreatedAsDirective(t *testing.T) {
	evs, err := ParseText(strings.NewReader(useInBodySample), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("want 1 event, got %d", len(evs))
	}
	d := evs[0].Decoded
	if d == nil || d.DB != "shop" {
		t.Fatalf("DB must stay shop (directive), not be overwritten by body use: %+v", d)
	}
	if !strings.Contains(d.SQL, "use audit_db") {
		t.Errorf("body `use audit_db` must remain in SQL, got %q", d.SQL)
	}
}

// A corrupt header where end_log_pos < pos would underflow the uint64 size
// subtraction. The parser must flag the event ConfidenceFailed with an error
// rather than emit a garbage size.
const corruptHeaderSample = `# at 500
#260603 11:42:01 server id 1  end_log_pos 400 CRC32 0x11111111 	Query	thread_id=8
BEGIN
/*!*/;
`

func TestParseCorruptHeaderFlagged(t *testing.T) {
	evs, err := ParseText(strings.NewReader(corruptHeaderSample), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("want 1 event, got %d", len(evs))
	}
	if evs[0].Confidence != schema.ConfidenceFailed {
		t.Errorf("end_log_pos < pos must yield ConfidenceFailed, got %q", evs[0].Confidence)
	}
	if evs[0].Error == "" {
		t.Error("corrupt header must carry an error message")
	}
	if evs[0].Header.Size != 0 {
		t.Errorf("corrupt header must not emit a wrapped size, got %d", evs[0].Header.Size)
	}
}

func TestParseQueryCapturesUseDB(t *testing.T) {
	evs, err := ParseText(strings.NewReader(useDBSample), 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("want 1 event, got %d", len(evs))
	}
	d := evs[0].Decoded
	if d == nil || d.DB != "shop" {
		t.Fatalf("QUERY db = %+v, want shop", d)
	}
	if !strings.Contains(d.SQL, "CREATE TABLE customers") {
		t.Errorf("sql not captured: %q", d.SQL)
	}
	if strings.Contains(d.SQL, "use ") {
		t.Errorf("use line leaked into SQL body: %q", d.SQL)
	}
}
