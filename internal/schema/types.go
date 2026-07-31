package schema

import "fmt"

// Canonical binlog event type names, keyed by wire type code.
// Every adapter MUST map its library's naming into these — this is what
// makes cross-adapter diff alignment and filtering work.
var typeNames = map[byte]string{
	0x00: "UNKNOWN", 0x01: "START_V3", 0x02: "QUERY", 0x03: "STOP",
	0x04: "ROTATE", 0x05: "INTVAR", 0x0e: "USER_VAR",
	0x0f: "FORMAT_DESCRIPTION", 0x10: "XID", 0x11: "BEGIN_LOAD_QUERY",
	0x12: "EXECUTE_LOAD_QUERY", 0x13: "TABLE_MAP",
	0x17: "WRITE_ROWS_V1", 0x18: "UPDATE_ROWS_V1", 0x19: "DELETE_ROWS_V1",
	0x1a: "INCIDENT", 0x1b: "HEARTBEAT", 0x1c: "IGNORABLE",
	0x1d: "ROWS_QUERY", 0x1e: "WRITE_ROWS_V2", 0x1f: "UPDATE_ROWS_V2",
	0x20: "DELETE_ROWS_V2", 0x21: "GTID", 0x22: "ANONYMOUS_GTID",
	0x23: "PREVIOUS_GTIDS", 0x24: "TRANSACTION_CONTEXT", 0x25: "VIEW_CHANGE",
	0x26: "XA_PREPARE", 0x27: "PARTIAL_UPDATE_ROWS",
	0x28: "TRANSACTION_PAYLOAD", 0x29: "HEARTBEAT_V2",
	// MariaDB-specific event types (0xA0+). MariaDB has its own GTID scheme and
	// the ANNOTATE_ROWS event (the original SQL for a row event), so these are
	// distinct from the MySQL GTID/GTID-related codes above.
	0xa0: "ANNOTATE_ROWS", 0xa1: "BINLOG_CHECKPOINT", 0xa2: "MARIA_GTID",
	0xa3: "MARIA_GTID_LIST", 0xa4: "START_ENCRYPTION",
}

// TypeName maps a wire type code to its canonical name.
func TypeName(code byte) string {
	if n, ok := typeNames[code]; ok {
		return n
	}
	return fmt.Sprintf("UNKNOWN_0x%02X", code)
}

// MySQL column type codes (a subset; unknowns render as TYPE_0xNN).
var columnTypeNames = map[byte]string{
	0x00: "DECIMAL", 0x01: "TINYINT", 0x02: "SMALLINT", 0x03: "INT",
	0x04: "FLOAT", 0x05: "DOUBLE", 0x06: "NULL", 0x07: "TIMESTAMP",
	0x08: "BIGINT", 0x09: "MEDIUMINT", 0x0a: "DATE", 0x0b: "TIME",
	0x0c: "DATETIME", 0x0d: "YEAR", 0x0f: "VARSTRING", 0x10: "BIT",
	0x11: "TIMESTAMP", 0x12: "DATETIME", 0x13: "TIME",
	0xf5: "JSON", 0xf6: "NEWDECIMAL", 0xf7: "ENUM", 0xf8: "SET",
	0xf9: "TINYBLOB", 0xfa: "MEDIUMBLOB", 0xfb: "LONGBLOB", 0xfc: "BLOB",
	0xfd: "VARSTRING", 0xfe: "STRING", 0xff: "GEOMETRY",
}

// ColumnTypeName maps a MySQL column type code to a display name.
func ColumnTypeName(code byte) string {
	if n, ok := columnTypeNames[code]; ok {
		return n
	}
	return fmt.Sprintf("TYPE_0x%02X", code)
}
