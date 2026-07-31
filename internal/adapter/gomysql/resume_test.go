package gomysql

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

// corpusPath resolves a fixture relative to this source file so the test is
// CWD-independent. Skips the test when the fixture is absent.
func corpusPath(t *testing.T, rel string) string {
	t.Helper()
	_, self, _, _ := runtime.Caller(0)
	p := filepath.Join(filepath.Dir(self), "..", "..", "testdata", "corpus", rel)
	if _, err := os.Stat(p); err != nil {
		t.Skipf("corpus fixture %s not present", rel)
	}
	return p
}

// drain collects every event from a decode stream.
func drain(t *testing.T, a *Adapter, src adapter.Source) []*schema.Event {
	t.Helper()
	st, err := a.Decode(context.Background(), src, adapter.DecodeOpts{})
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	var out []*schema.Event
	for {
		ev, err := st.Next()
		if errors.Is(err, io.EOF) {
			return out
		}
		if err != nil {
			t.Fatalf("decode: %v", err)
		}
		out = append(out, ev)
	}
}

// resumeBoundary returns the NextPos of the first XID event — a committed-txn
// boundary mid-file where a resume decode is guaranteed safe (TABLE_MAPs are
// re-emitted per txn).
func resumeBoundary(t *testing.T, full []*schema.Event) uint64 {
	t.Helper()
	for _, ev := range full {
		if ev.Header.TypeName == "XID" {
			return ev.Header.NextPos
		}
	}
	t.Skip("fixture has no XID event to resume after")
	return 0
}

// assertResumeMatchesTail decodes from a mid-file committed boundary and
// asserts the result is exactly the tail of a full decode: same count, same
// positions, same types, contiguous chain, and no FORMAT_DESCRIPTION re-emitted.
func assertResumeMatchesTail(t *testing.T, fixture string) {
	t.Helper()
	a := New()
	path := corpusPath(t, fixture)
	full := drain(t, a, adapter.Source{Path: path})
	if len(full) < 4 {
		t.Skipf("fixture too small: %d events", len(full))
	}
	boundary := resumeBoundary(t, full)

	var tail []*schema.Event
	for _, ev := range full {
		if ev.Header.Pos >= boundary {
			tail = append(tail, ev)
		}
	}
	if len(tail) == 0 {
		t.Skip("no events after the chosen boundary")
	}

	resumed := drain(t, a, adapter.Source{Path: path, Offset: boundary})
	if len(resumed) != len(tail) {
		t.Fatalf("resume yielded %d events, full-decode tail has %d", len(resumed), len(tail))
	}
	if resumed[0].Header.Pos != boundary {
		t.Fatalf("first resumed event pos = %d, want boundary %d", resumed[0].Header.Pos, boundary)
	}
	for i := range resumed {
		r, w := resumed[i], tail[i]
		if r.Header.Pos != w.Header.Pos || r.Header.TypeName != w.Header.TypeName ||
			r.Header.NextPos != w.Header.NextPos || r.Header.Size != w.Header.Size {
			t.Fatalf("event %d mismatch: resumed {pos:%d %s next:%d size:%d} vs full {pos:%d %s next:%d size:%d}",
				i, r.Header.Pos, r.Header.TypeName, r.Header.NextPos, r.Header.Size,
				w.Header.Pos, w.Header.TypeName, w.Header.NextPos, w.Header.Size)
		}
		if r.Header.TypeName == "FORMAT_DESCRIPTION" {
			t.Fatalf("FORMAT_DESCRIPTION re-emitted at index %d — the priming event must be discarded", i)
		}
		// Positions must chain contiguously (guards the runPos init for events
		// with LogPos=0, e.g. MariaDB ANNOTATE_ROWS).
		if i+1 < len(resumed) && r.Header.NextPos != resumed[i+1].Header.Pos {
			t.Fatalf("position chain broken at %d: NextPos %d != next Pos %d",
				i, r.Header.NextPos, resumed[i+1].Header.Pos)
		}
	}
	// Row images must survive a resume (TABLE_MAP in scope from the txn).
	for i := range resumed {
		wantRows := 0
		if tail[i].Decoded != nil {
			wantRows = len(tail[i].Decoded.Rows)
		}
		gotRows := 0
		if resumed[i].Decoded != nil {
			gotRows = len(resumed[i].Decoded.Rows)
		}
		if gotRows != wantRows {
			t.Fatalf("event %d (%s) rows: resumed %d, full %d", i, tail[i].Header.TypeName, gotRows, wantRows)
		}
	}
}

func TestResumeDecodeMatchesFullTailMySQL(t *testing.T) {
	assertResumeMatchesTail(t, filepath.Join("8.0", "mysql-8.0.binlog"))
}

func TestResumeDecodeMatchesFullTailMySQL55(t *testing.T) {
	assertResumeMatchesTail(t, filepath.Join("5.5", "mysql-5.5.binlog"))
}

func TestResumeDecodeMatchesFullTailMariaDB(t *testing.T) {
	assertResumeMatchesTail(t, filepath.Join("maria-10.6", "mysql-maria-10.6.binlog"))
}

func TestResumeDecodeCapability(t *testing.T) {
	if !New().Capabilities().ResumeDecode {
		t.Fatal("gomysql must declare ResumeDecode")
	}
}
