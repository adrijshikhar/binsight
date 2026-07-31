package schema

import "testing"

func TestCanonicalTypeNames(t *testing.T) {
	cases := map[byte]string{
		0x02: "QUERY", 0x04: "ROTATE", 0x0f: "FORMAT_DESCRIPTION",
		0x10: "XID", 0x13: "TABLE_MAP", 0x1e: "WRITE_ROWS_V2",
		0x1f: "UPDATE_ROWS_V2", 0x20: "DELETE_ROWS_V2",
		0x21: "GTID", 0x22: "ANONYMOUS_GTID", 0x23: "PREVIOUS_GTIDS",
		0x03: "STOP", 0x1d: "ROWS_QUERY",
	}
	for code, want := range cases {
		if got := TypeName(code); got != want {
			t.Errorf("TypeName(0x%02x) = %q, want %q", code, got, want)
		}
	}
	if got := TypeName(0xee); got != "UNKNOWN_0xEE" {
		t.Errorf("unknown code: got %q", got)
	}
}

func TestMySQLColumnTypeNames(t *testing.T) {
	if got := ColumnTypeName(0x03); got != "INT" {
		t.Errorf("0x03 = %q", got)
	}
	if got := ColumnTypeName(0x0f); got != "VARSTRING" {
		t.Errorf("0x0f = %q", got)
	}
	if got := ColumnTypeName(0x12); got != "DATETIME" {
		t.Errorf("0x12 = %q", got)
	}
}
