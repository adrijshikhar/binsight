package diffsvc

import (
	"context"
	"encoding/json"
	"io"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

type stubAdapter struct {
	name string
	ev   *schema.Event
}

func (s *stubAdapter) Name() string { return s.name }
func (s *stubAdapter) Capabilities() adapter.Capabilities {
	return adapter.Capabilities{FullScan: true}
}
func (s *stubAdapter) Supports(string) bool { return true }
func (s *stubAdapter) Decode(ctx context.Context, src adapter.Source, opts adapter.DecodeOpts) (adapter.EventStream, error) {
	return &stubStream{ev: s.ev}, nil
}

type stubStream struct {
	ev   *schema.Event
	done bool
}

func (s *stubStream) Next() (*schema.Event, error) {
	if s.done || s.ev == nil {
		return nil, io.EOF
	}
	s.done = true
	return s.ev, nil
}
func (s *stubStream) Close() error { return nil }

func mkEvent(ts uint32, sql string) *schema.Event {
	return &schema.Event{
		SchemaVersion: schema.Version,
		Header: schema.Header{
			Pos: 100, Timestamp: ts, TypeCode: 0x02, TypeName: "QUERY",
			ServerID: 1, Size: 80, NextPos: 180,
		},
		Decoded:    &schema.Decoded{SQL: sql},
		Native:     json.RawMessage(`{"adapter":"stub"}`),
		Confidence: schema.ConfidenceFull,
	}
}

func TestDiffAgreement(t *testing.T) {
	a := &stubAdapter{"a", mkEvent(1000, "TRUNCATE TABLE x")}
	b := &stubAdapter{"b", mkEvent(1000, "TRUNCATE TABLE x")}
	res, err := Diff(context.Background(), []adapter.Decoder{a, b}, "/f", 100)
	if err != nil {
		t.Fatal(err)
	}
	if res.DisagreementCount != 0 {
		t.Fatalf("identical events must agree: %+v", res)
	}
	if len(res.Fields) == 0 {
		t.Fatal("fields matrix must not be empty")
	}
}

func TestDiffDecodedDisagreement(t *testing.T) {
	a := &stubAdapter{"a", mkEvent(1000, "TRUNCATE TABLE x")}
	b := &stubAdapter{"b", mkEvent(1000, "truncate table x")}
	res, err := Diff(context.Background(), []adapter.Decoder{a, b}, "/f", 100)
	if err != nil {
		t.Fatal(err)
	}
	if res.DisagreementCount != 1 {
		t.Fatalf("want 1 disagreement, got %d", res.DisagreementCount)
	}
	var f *Field
	for i := range res.Fields {
		if res.Fields[i].Name == "decoded.sql" {
			f = &res.Fields[i]
		}
	}
	if f == nil || f.Agree || f.Severity != "decoded" {
		t.Fatalf("sql disagreement not flagged: %+v", f)
	}
}

func TestDiffHeaderDisagreementIsSevere(t *testing.T) {
	evB := mkEvent(1000, "X")
	evB.Header.Size = 99
	a := &stubAdapter{"a", mkEvent(1000, "X")}
	b := &stubAdapter{"b", evB}
	res, err := Diff(context.Background(), []adapter.Decoder{a, b}, "/f", 100)
	if err != nil {
		t.Fatal(err)
	}
	var f *Field
	for i := range res.Fields {
		if res.Fields[i].Name == "header.size" {
			f = &res.Fields[i]
		}
	}
	if f == nil || f.Agree || f.Severity != "header" {
		t.Fatalf("header disagreement must be severity=header: %+v", f)
	}
}

func TestDiffAdapterFailureSurfaced(t *testing.T) {
	a := &stubAdapter{"a", mkEvent(1000, "X")}
	b := &stubAdapter{"b", nil}
	res, err := Diff(context.Background(), []adapter.Decoder{a, b}, "/f", 100)
	if err != nil {
		t.Fatal(err)
	}
	if res.Errors["b"] == "" {
		t.Fatalf("missing event must surface as adapter error: %+v", res.Errors)
	}
}

// SQL differing only in whitespace/newlines (verbatim binlog vs reconstructed
// text output) must compare equal — normalizeSQL collapses it. Without this the
// decoded.sql field would flag a spurious decoded-layer disagreement.
func TestDiffNormalizesSQLWhitespace(t *testing.T) {
	a := &stubAdapter{"a", mkEvent(1000, "CREATE TABLE x (\n  id INT\n)")}
	b := &stubAdapter{"b", mkEvent(1000, "CREATE TABLE x ( id INT )")}
	res, err := Diff(context.Background(), []adapter.Decoder{a, b}, "/f", 100)
	if err != nil {
		t.Fatal(err)
	}
	if res.DisagreementCount != 0 {
		t.Fatalf("whitespace-only SQL difference must not disagree, got %d: %+v", res.DisagreementCount, res)
	}
	var f *Field
	for i := range res.Fields {
		if res.Fields[i].Name == "decoded.sql" {
			f = &res.Fields[i]
		}
	}
	if f == nil || !f.Agree {
		t.Fatalf("decoded.sql must agree after normalization: %+v", f)
	}
}

// A field only one adapter produces (a coverage gap, e.g. the text adapter can't
// decode a row event seeked-to without its TABLE_MAP) is Partial: Agree stays
// true and it is NOT counted as a disagreement.
func TestDiffOneSidedFieldIsPartialNotDisagreement(t *testing.T) {
	withRows := mkEvent(1000, "")
	withRows.Decoded = &schema.Decoded{Rows: []schema.RowImage{{After: []any{"1", "a"}}}}
	noRows := mkEvent(1000, "")
	noRows.Decoded = &schema.Decoded{} // same event, but produced no rows

	a := &stubAdapter{"a", withRows}
	b := &stubAdapter{"b", noRows}
	res, err := Diff(context.Background(), []adapter.Decoder{a, b}, "/f", 100)
	if err != nil {
		t.Fatal(err)
	}
	if res.DisagreementCount != 0 {
		t.Fatalf("one-sided field must not count as disagreement, got %d: %+v", res.DisagreementCount, res)
	}
	var f *Field
	for i := range res.Fields {
		if res.Fields[i].Name == "decoded.rows" {
			f = &res.Fields[i]
		}
	}
	if f == nil {
		t.Fatal("decoded.rows field missing")
	}
	if !f.Partial || !f.Agree {
		t.Fatalf("one-sided decoded.rows must be Partial && Agree, got Partial=%v Agree=%v", f.Partial, f.Agree)
	}
}

// Advisory (info-severity) fields such as header.ts may differ between adapters
// (text adapters reconstruct the timestamp) without counting as a disagreement.
func TestDiffInfoSeverityDifferenceNotCounted(t *testing.T) {
	a := &stubAdapter{"a", mkEvent(1000, "X")}
	b := &stubAdapter{"b", mkEvent(2000, "X")} // only header.ts differs
	res, err := Diff(context.Background(), []adapter.Decoder{a, b}, "/f", 100)
	if err != nil {
		t.Fatal(err)
	}
	if res.DisagreementCount != 0 {
		t.Fatalf("info-severity ts difference must not count, got %d: %+v", res.DisagreementCount, res)
	}
	var f *Field
	for i := range res.Fields {
		if res.Fields[i].Name == "header.ts" {
			f = &res.Fields[i]
		}
	}
	if f == nil || f.Agree || f.Severity != "info" {
		t.Fatalf("header.ts must be a non-agreeing info field: %+v", f)
	}
}
