// Package diffsvc decodes one event with every adapter in the diff set and
// aligns the results. Header-layer disagreement = broken adapter (red).
// Decoded-layer disagreement = the interesting CDC bug territory (amber).
package diffsvc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

// Field is one row of the adapters × fields comparison matrix.
type Field struct {
	Name   string            `json:"name"`
	Values map[string]string `json:"values"` // adapter name → rendered value
	Agree  bool              `json:"agree"`
	// Partial: only some adapters produced this field (a coverage gap, e.g. the
	// text adapter can't decode a row event seeked-to without its TABLE_MAP) —
	// NOT a value conflict, so it isn't counted as a disagreement.
	Partial  bool   `json:"partial"`
	Severity string `json:"severity"` // "header" | "decoded" | "info"
}

// Result is the full diff outcome for one event position.
type Result struct {
	Pos               uint64            `json:"pos"`
	Adapters          []string          `json:"adapters"`
	TimingMS          map[string]int64  `json:"timing_ms"`
	Errors            map[string]string `json:"errors"`
	Fields            []Field           `json:"fields"`
	DisagreementCount int               `json:"disagreement_count"`
}

// Diff decodes the event at pos with every decoder and aligns the layers.
func Diff(ctx context.Context, decoders []adapter.Decoder, path string, pos uint64) (*Result, error) {
	res := &Result{
		Pos: pos, TimingMS: map[string]int64{}, Errors: map[string]string{},
	}
	events := map[string]*schema.Event{}
	for _, d := range decoders {
		res.Adapters = append(res.Adapters, d.Name())
		start := time.Now()
		ev, err := decodeOne(ctx, d, path, pos)
		res.TimingMS[d.Name()] = time.Since(start).Milliseconds()
		if err != nil {
			res.Errors[d.Name()] = err.Error()
			continue
		}
		events[d.Name()] = ev
	}

	fields := map[string]map[string]string{}
	sev := map[string]string{}
	add := func(field, severity, adapterName, value string) {
		if fields[field] == nil {
			fields[field] = map[string]string{}
		}
		fields[field][adapterName] = value
		sev[field] = severity
	}
	for name, ev := range events {
		h := ev.Header
		add("header.pos", "header", name, fmt.Sprint(h.Pos))
		add("header.type_code", "header", name, fmt.Sprintf("0x%02X", h.TypeCode))
		add("header.type_name", "header", name, h.TypeName)
		add("header.server_id", "header", name, fmt.Sprint(h.ServerID))
		add("header.size", "header", name, fmt.Sprint(h.Size))
		add("header.next_pos", "header", name, fmt.Sprint(h.NextPos))
		// ts is advisory for text adapters — info severity, not header
		add("header.ts", "info", name, fmt.Sprint(h.Timestamp))
		if d := ev.Decoded; d != nil {
			if d.DB != "" {
				add("decoded.db", "decoded", name, d.DB)
			}
			if d.Table != "" {
				add("decoded.table", "decoded", name, d.Table)
			}
			if d.SQL != "" {
				// Compare on whitespace-normalized SQL: go-mysql returns the
				// binlog statement verbatim while mysqlbinlog reconstructs it from
				// text output (different indentation/line breaks). Without this,
				// functionally identical DDL flags a spurious decoded-layer diff.
				add("decoded.sql", "decoded", name, normalizeSQL(d.SQL))
			}
			if d.GTID != "" {
				add("decoded.gtid", "decoded", name, d.GTID)
			}
			if d.XID != 0 {
				add("decoded.xid", "decoded", name, fmt.Sprint(d.XID))
			}
			if len(d.Rows) > 0 {
				b, _ := json.Marshal(d.Rows)
				add("decoded.rows", "decoded", name, string(b))
			}
		}
		add("confidence", "info", name, ev.Confidence)
	}

	names := make([]string, 0, len(fields))
	for n := range fields {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		vals := fields[n]
		f := Field{Name: n, Values: vals, Agree: true, Severity: sev[n]}
		var first string
		i := 0
		for _, v := range vals {
			if i == 0 {
				first = v
			} else if v != first {
				f.Agree = false
			}
			i++
		}
		// One-sided: only some adapters produced this field. That's a coverage
		// gap (already signalled by `confidence`), e.g. mysqlbinlog can't decode
		// a row event seeked-to without its preceding TABLE_MAP — NOT a value
		// conflict. Mark Partial; do NOT flip Agree or count it as a disagreement.
		f.Partial = len(vals) < len(events) && len(events) > 1
		// A disagreement is a genuine value conflict among the adapters that DID
		// produce the field (Agree=false), excluding advisory/info rows.
		if !f.Agree && f.Severity != "info" {
			res.DisagreementCount++
		}
		res.Fields = append(res.Fields, f)
	}
	return res, nil
}

// normalizeSQL collapses all runs of whitespace to single spaces and trims, so
// SQL that differs only in formatting (verbatim binlog vs reconstructed text)
// compares equal. The UI re-beautifies CREATE/ALTER for display.
func normalizeSQL(s string) string { return strings.Join(strings.Fields(s), " ") }

func decodeOne(ctx context.Context, d adapter.Decoder, path string, pos uint64) (*schema.Event, error) {
	stream, err := d.Decode(ctx, adapter.Source{Path: path}, adapter.DecodeOpts{AtPos: pos})
	if err != nil {
		return nil, err
	}
	defer stream.Close()
	ev, err := stream.Next()
	if err == io.EOF {
		return nil, fmt.Errorf("adapter produced no event at pos %d", pos)
	}
	if err != nil {
		return nil, err
	}
	return ev, nil
}
