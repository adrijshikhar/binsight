// Package mysqlbinlog wraps the official mysqlbinlog CLI as an exec adapter.
// Its text output is parsed into normalized events. Text is lossy, so every
// event carries Confidence=partial.
package mysqlbinlog

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/adrijshikhar/binsight/internal/schema"
)

// "# at 425"
var reAt = regexp.MustCompile(`^# at (\d+)$`)

// "#260603 11:42:01 server id 1  end_log_pos 477 CRC32 0x97bc1a29 \tUpdate_rows: ..."
// The separator between the CRC32 hex and the type label is a space+tab in real
// mysqlbinlog output; the optional CRC32 group followed by \s* handles both.
var reHeader = regexp.MustCompile(
	`^#(\d{6})\s+(\d{1,2}:\d{2}:\d{2})\s+server id (\d+)\s+end_log_pos (\d+)(?:\s+CRC32 0x[0-9a-fA-F]+)?\s+(\S+)(.*)$`)

// "###   @1=1001 /* INT meta=0 ... */"
var reColVal = regexp.MustCompile(`^###\s+@(\d+)=(.*?)(?:\s+/\*.*\*/)?\s*$`)

// "### UPDATE `shop`.`orders`"
// "`shop`.`orders` mapped to number 108" (TABLE_MAP header rest)
var reTableMap = regexp.MustCompile("`([^`]+)`\\.`([^`]+)` mapped to number (\\d+)")

var reTable = regexp.MustCompile("^### (?:INSERT INTO|UPDATE|DELETE FROM) `([^`]+)`\\.`([^`]+)`")

// "SET @@SESSION.GTID_NEXT= '9e79...:1'/*!*/;" — the real GTID for the preceding
// GTID/ANONYMOUS_GTID event (the header tail carries only commit metadata).
var reGTIDNext = regexp.MustCompile(`(?i)SET @@SESSION\.GTID_NEXT\s*=\s*'([^']+)'`)

// "use `corpus`/*!*/;" — the mysqlbinlog session directive giving the database
// for the following QUERY event (go-mysql reads it from QueryEvent.Schema). Match
// the exact backtick-quoted + /*!*/; form so a `use ...` statement inside a QUERY
// body is NOT mistaken for it (which would drop it from the SQL + overwrite db).
var reUse = regexp.MustCompile("^use `([^`]+)`/\\*!\\*/;\\s*$")

// typeCode maps a mysqlbinlog type label to its binlog wire code. The canonical
// name is NOT stored here — it is derived from the code via schema.TypeName, the
// single source of truth (internal/schema), so the two never drift.
// Keys must exactly match the first non-space token after the tab separator in
// mysqlbinlog output. Most row-event labels include a trailing colon (e.g.
// Write_rows:, Update_rows_partial:); structural events such as
// Transaction_Payload do not — match the binary's actual output, not a rule.
var typeCode = map[string]byte{
	"Query":          0x02,
	"Stop":           0x03,
	"Rotate":         0x04,
	"Start:":         0x0f,
	"Xid":            0x10,
	"Table_map:":     0x13,
	"Write_rows:":    0x1e,
	"Update_rows:":   0x1f,
	"Delete_rows:":   0x20,
	"GTID":           0x21,
	"Anonymous_GTID": 0x22,
	"Previous-GTIDs": 0x23,
	"Rows_query":     0x1d,
	// PARTIAL_UPDATE_ROWS (8.0.23+ partial JSON). The text adapter records the
	// inner @N=JSON_*(...) diff expressions as opaque row values (decoded-layer
	// only; header agreement is exact).
	"Update_rows_partial:": 0x27,
	// TRANSACTION_PAYLOAD (8.0.20+ compressed txn). Header maps correctly; the
	// text adapter does NOT decompress the inner events — a dedicated compressed
	// fixture (deferred) will exercise inner-event handling.
	"Transaction_Payload": 0x28,
}

// ParseText converts mysqlbinlog -vv --base64-output=decode-rows output into
// normalized events. keepPos bounds memory on a seek decode: when non-zero, only
// the event at that position is retained (others are parsed for context — e.g.
// the TABLE_MAP that lets a later row event decode — then discarded). keepPos==0
// keeps every event (full decode).
func ParseText(r io.Reader, keepPos uint64) ([]*schema.Event, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 1024*1024), 16*1024*1024)
	var (
		out     []*schema.Event
		cur     *schema.Event
		pendPos uint64
		mode    string // "", "where", "set"
		curRow  *schema.RowImage
		sqlBuf  []string
	)

	flushSQL := func() {
		if cur != nil && cur.Header.TypeName == "QUERY" && len(sqlBuf) > 0 {
			if cur.Decoded == nil {
				cur.Decoded = &schema.Decoded{}
			}
			cur.Decoded.SQL = strings.Join(sqlBuf, "\n")
		}
		sqlBuf = nil
	}
	flushRow := func() {
		if cur != nil && curRow != nil && (len(curRow.Before) > 0 || len(curRow.After) > 0) {
			if cur.Decoded == nil {
				cur.Decoded = &schema.Decoded{}
			}
			cur.Decoded.Rows = append(cur.Decoded.Rows, *curRow)
		}
		curRow = nil
	}
	flushEvent := func() {
		flushSQL()
		flushRow()
		if cur != nil && (keepPos == 0 || cur.Header.Pos == keepPos) {
			out = append(out, cur)
		}
		cur = nil
		mode = ""
	}

	for sc.Scan() {
		line := sc.Text()

		if m := reAt.FindStringSubmatch(line); m != nil {
			flushEvent()
			pendPos, _ = strconv.ParseUint(m[1], 10, 64)
			continue
		}

		if m := reHeader.FindStringSubmatch(line); m != nil && pendPos != 0 {
			flushEvent()
			serverID, _ := strconv.ParseUint(m[3], 10, 32)
			endPos, _ := strconv.ParseUint(m[4], 10, 64)
			label := m[5]
			code, ok := typeCode[label]
			name := schema.TypeName(code) // canonical name from the code (single source)
			if !ok {
				name = "UNKNOWN_" + label
			}
			ts := parseTS(m[1], m[2])
			// Guard against corrupt output where end_log_pos < pos: the uint64
			// subtraction would wrap to a garbage size. Flag the event instead.
			var size uint32
			conf := schema.ConfidencePartial
			errMsg := ""
			if endPos >= pendPos {
				size = uint32(endPos - pendPos)
			} else {
				conf = schema.ConfidenceFailed
				errMsg = fmt.Sprintf("corrupt header: end_log_pos %d < pos %d", endPos, pendPos)
			}
			cur = &schema.Event{
				SchemaVersion: schema.Version,
				Header: schema.Header{
					Pos: pendPos, Timestamp: ts, TypeCode: code, TypeName: name,
					ServerID: uint32(serverID), NextPos: endPos,
					Size: size,
				},
				Confidence: conf,
				Error:      errMsg,
			}
			cur.Native, _ = json.Marshal(map[string]any{
				"adapter": "mysqlbinlog", "raw_header": strings.TrimSpace(line),
			})
			rest := strings.TrimSpace(m[6])
			switch name {
			case "XID":
				if _, after, ok0 := strings.Cut(rest, "= "); ok0 {
					xid, _ := strconv.ParseUint(strings.TrimSpace(after), 10, 64)
					cur.Decoded = &schema.Decoded{XID: xid}
				}
			case "TABLE_MAP":
				if mm := reTableMap.FindStringSubmatch(rest); mm != nil {
					tid, _ := strconv.ParseUint(mm[3], 10, 64)
					cur.Decoded = &schema.Decoded{DB: mm[1], Table: mm[2], TableID: tid}
				}
			case "GTID", "ANONYMOUS_GTID":
				// The header tail is only commit metadata (last_committed=...,
				// sequence_number=...). The real GTID is on the following
				// SET @@SESSION.GTID_NEXT line — captured in the scan loop below.
				cur.Decoded = &schema.Decoded{}
			}
			pendPos = 0
			continue
		}

		if cur == nil {
			continue
		}

		if strings.HasPrefix(line, "### ") {
			if m := reTable.FindStringSubmatch(line); m != nil {
				if cur.Decoded == nil {
					cur.Decoded = &schema.Decoded{}
				}
				cur.Decoded.DB, cur.Decoded.Table = m[1], m[2]
				flushRow()
				curRow = &schema.RowImage{}
				if strings.HasPrefix(line, "### INSERT") {
					mode = "set"
				}
				continue
			}
			switch strings.TrimSpace(line) {
			case "### WHERE":
				mode = "where"
				continue
			case "### SET":
				mode = "set"
				continue
			}
			if m := reColVal.FindStringSubmatch(line); m != nil && curRow != nil {
				val := strings.TrimSpace(m[2])
				if mode == "where" {
					curRow.Before = append(curRow.Before, val)
				} else {
					curRow.After = append(curRow.After, val)
				}
				continue
			}
			continue
		}

		// Real GTID lives on the SET @@SESSION.GTID_NEXT line that follows a
		// GTID/ANONYMOUS_GTID header (uuid:seqno, or 'ANONYMOUS').
		if cur.Header.TypeName == "GTID" || cur.Header.TypeName == "ANONYMOUS_GTID" {
			if mm := reGTIDNext.FindStringSubmatch(line); mm != nil {
				if cur.Decoded == nil {
					cur.Decoded = &schema.Decoded{}
				}
				cur.Decoded.GTID = mm[1]
				continue
			}
		}

		// SQL body lines for QUERY events (skip session SET noise / delimiters)
		if cur.Header.TypeName == "QUERY" {
			t := strings.TrimSpace(line)
			switch {
			case t == "":
				continue
			case t == "BEGIN" || t == "BEGIN/*!*/;":
				sqlBuf = append(sqlBuf, "BEGIN")
			case reUse.MatchString(t):
				// The session `use \`db\`/*!*/;` directive carries the QUERY's
				// database — capture it, don't include it in the SQL body. (A
				// `use ...` statement in the body won't match this strict form.)
				mm := reUse.FindStringSubmatch(t)
				if cur.Decoded == nil {
					cur.Decoded = &schema.Decoded{}
				}
				cur.Decoded.DB = mm[1]
				continue
			case strings.HasPrefix(t, "SET "), strings.HasPrefix(t, "/*!"),
				strings.HasPrefix(t, "DELIMITER"), t == "/*!*/;":
				continue
			default:
				sqlBuf = append(sqlBuf, strings.TrimSuffix(t, "/*!*/;"))
			}
		}
	}
	flushEvent()
	return out, sc.Err()
}

// parseTS converts "#YYMMDD HH:MM:SS" to a UTC epoch. The mysqlbinlog process
// is spawned with TZ=UTC (see Decode), so the printed time is UTC and this
// matches the raw epoch go-mysql reads from the event header.
func parseTS(yymmdd, hms string) uint32 {
	t, err := time.Parse("060102 15:04:05", yymmdd+" "+hms)
	if err != nil {
		return 0
	}
	return uint32(t.UTC().Unix())
}
