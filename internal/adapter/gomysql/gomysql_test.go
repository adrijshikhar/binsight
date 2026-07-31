package gomysql

import (
	"context"
	"io"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

func fixturePath(t *testing.T) string {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	p := filepath.Join(filepath.Dir(thisFile), "..", "..", "testdata", "binlog.000002")
	return p
}

func collectAll(t *testing.T, src adapter.Source, opts adapter.DecodeOpts) []*eventInfo {
	t.Helper()
	a := New()
	stream, err := a.Decode(context.Background(), src, opts)
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()
	var out []*eventInfo
	for {
		ev, err := stream.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, &eventInfo{ev.Header.TypeName, ev.Header.Pos, ev})
	}
	return out
}

type eventInfo struct {
	typeName string
	pos      uint64
	ev       any
}

func TestDecodeFixture(t *testing.T) {
	evs := collectAll(t, adapter.Source{Path: fixturePath(t)}, adapter.DecodeOpts{})
	if len(evs) < 20 {
		t.Fatalf("expected >=20 events in fixture, got %d", len(evs))
	}
	if evs[0].typeName != "FORMAT_DESCRIPTION" || evs[0].pos != 4 {
		t.Fatalf("first event must be FORMAT_DESCRIPTION at pos 4: %+v", evs[0])
	}
	var sawWrite, sawXid bool
	for _, e := range evs {
		if e.typeName == "WRITE_ROWS_V2" {
			sawWrite = true
		}
		if e.typeName == "XID" {
			sawXid = true
		}
	}
	if !sawWrite || !sawXid {
		t.Fatalf("fixture must contain WRITE_ROWS_V2 and XID (write=%v xid=%v)", sawWrite, sawXid)
	}
}

func TestDecodeAtPos(t *testing.T) {
	all := collectAll(t, adapter.Source{Path: fixturePath(t)}, adapter.DecodeOpts{})
	var target uint64
	for _, e := range all {
		if e.typeName == "WRITE_ROWS_V2" {
			target = e.pos
			break
		}
	}
	if target == 0 {
		t.Skip("no write rows in fixture")
	}
	got := collectAll(t, adapter.Source{Path: fixturePath(t)}, adapter.DecodeOpts{AtPos: target})
	if len(got) != 1 || got[0].pos != target {
		t.Fatalf("AtPos must return exactly the target event: %+v", got)
	}
}

func TestCapabilities(t *testing.T) {
	c := New().Capabilities()
	if !c.FullScan || !c.SeekDecode || !c.RemoteStream || !c.RowImages {
		t.Fatalf("go-mysql capabilities wrong: %+v", c)
	}
}

// TestSizeEqualsPosSpan verifies the binlog invariant that an event's
// EventSize (Header.Size) equals next_log_pos - start_pos for every event.
// This is what lets the UI treat "size" and "end_pos - pos" interchangeably.
func TestSizeEqualsPosSpan(t *testing.T) {
	evs := collectAll(t, adapter.Source{Path: fixturePath(t)}, adapter.DecodeOpts{})
	for _, e := range evs {
		h := e.ev.(*schema.Event).Header
		span := h.NextPos - h.Pos
		if uint64(h.Size) != span {
			t.Fatalf("event at pos %d: size %d != next_pos-pos %d", h.Pos, h.Size, span)
		}
	}
}
