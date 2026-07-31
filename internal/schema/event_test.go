package schema

import (
	"encoding/json"
	"testing"
)

func TestEventJSONRoundTrip(t *testing.T) {
	ev := Event{
		SchemaVersion: Version,
		Header: Header{
			Pos: 10688643, Timestamp: 1673519531, TypeCode: 0x1f,
			TypeName: "UPDATE_ROWS_V2", ServerID: 1, Size: 94,
			NextPos: 10688737, Flags: 0,
		},
		Decoded: &Decoded{
			DB: "employees", Table: "test_table", TableID: 121,
			ColumnTypes: []string{"INT", "VARSTRING", "INT", "DATETIME"},
			Rows: []RowImage{{
				Before: []any{float64(1003), "pending"},
				After:  []any{float64(1003), "shipped"},
			}},
		},
		Confidence: ConfidenceFull,
	}
	b, err := json.Marshal(ev)
	if err != nil {
		t.Fatal(err)
	}
	var got Event
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if got.Header.Pos != 10688643 || got.Decoded.Table != "test_table" {
		t.Fatalf("round trip mismatch: %+v", got)
	}
	if got.Decoded.Rows[0].After[1] != "shipped" {
		t.Fatalf("row image lost: %+v", got.Decoded.Rows[0])
	}
}

func TestDecodeErrorEvent(t *testing.T) {
	ev := NewDecodeError(1234, "boom", []byte{0xde, 0xad})
	if ev.Header.TypeName != "DECODE_ERROR" || ev.Confidence != ConfidenceFailed {
		t.Fatalf("bad decode error event: %+v", ev)
	}
	if ev.Error != "boom" || ev.Header.Pos != 1234 {
		t.Fatalf("fields lost: %+v", ev)
	}
}
