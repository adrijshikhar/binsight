// Package schema defines normalized event schema v1 — the contract between
// all decoder adapters and the core. Three layers per event:
// header (mandatory, byte-identical across correct adapters),
// decoded (best-effort canonical), native (adapter-specific, opaque).
package schema

import "encoding/json"

const Version = 1

const (
	ConfidenceFull    = "full"
	ConfidencePartial = "partial"
	ConfidenceFailed  = "failed"
)

// Header mirrors the 19-byte binlog common header.
type Header struct {
	Pos       uint64 `json:"pos"`
	Timestamp uint32 `json:"ts"`
	TypeCode  byte   `json:"type_code"`
	TypeName  string `json:"type_name"`
	ServerID  uint32 `json:"server_id"`
	Size      uint32 `json:"size"`
	NextPos   uint64 `json:"next_pos"`
	Flags     uint16 `json:"flags"`
}

// RowImage holds before/after column values for one row.
// INSERT: After only. DELETE: Before only. UPDATE: both.
type RowImage struct {
	Before []any `json:"before,omitempty"`
	After  []any `json:"after,omitempty"`
}

// Decoded is the best-effort canonical decode layer. Canonical renderings:
// DECIMAL as exact string, timestamps as UTC ISO-8601 strings.
type Decoded struct {
	DB          string   `json:"db,omitempty"`
	Table       string   `json:"table,omitempty"`
	TableID     uint64   `json:"table_id,omitempty"`
	SQL         string   `json:"sql,omitempty"`
	GTID        string   `json:"gtid,omitempty"`
	XID         uint64   `json:"xid,omitempty"`
	ColumnTypes []string `json:"column_types,omitempty"`
	// ColumnNames is populated only when the binlog carries FULL row metadata
	// (MySQL 8.0+ binlog_row_metadata=FULL); otherwise nil and callers fall back
	// to positional @1..@n. When present, len == len(ColumnTypes).
	ColumnNames []string   `json:"column_names,omitempty"`
	Rows        []RowImage `json:"rows,omitempty"`
}

// Event is the normalized event envelope: exact header layer, best-effort
// decoded layer, opaque adapter-native layer, plus decode confidence/error.
type Event struct {
	SchemaVersion int             `json:"schema_version"`
	Header        Header          `json:"header"`
	Decoded       *Decoded        `json:"decoded,omitempty"`
	Native        json.RawMessage `json:"native,omitempty"`
	Confidence    string          `json:"decode_confidence"`
	Error         string          `json:"error,omitempty"`
}

// NewDecodeError builds the placeholder event emitted when an adapter fails
// on a single event; raw bytes are preserved in Native for forensics.
func NewDecodeError(pos uint64, msg string, raw []byte) *Event {
	native, _ := json.Marshal(map[string]any{"raw_excerpt": raw})
	return &Event{
		SchemaVersion: Version,
		Header:        Header{Pos: pos, TypeName: "DECODE_ERROR"},
		Confidence:    ConfidenceFailed,
		Error:         msg,
		Native:        native,
	}
}

// Summary renders the one-line event summary stored in the index.
func (e *Event) Summary() string {
	d := e.Decoded
	if d == nil {
		if e.Error != "" {
			return "decode error: " + e.Error
		}
		return ""
	}
	switch {
	case d.SQL != "":
		if len(d.SQL) > 200 {
			return d.SQL[:200] + "…"
		}
		return d.SQL
	case d.GTID != "":
		return "GTID " + d.GTID
	case d.XID != 0:
		return "Xid commit"
	case len(d.Rows) > 0:
		return itoa(len(d.Rows)) + " row(s)"
	case d.Table != "":
		return d.DB + "." + d.Table
	}
	return ""
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
