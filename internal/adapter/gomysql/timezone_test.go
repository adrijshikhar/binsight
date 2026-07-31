package gomysql

import (
	"encoding/json"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

// corpusFixture returns a versioned conformance fixture (these carry a TIMESTAMP
// column; internal/testdata/binlog.000002 does not).
func corpusFixture(t *testing.T, version, name string) string {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "testdata", "corpus", version, name)
}

// decodeRowsIn decodes the fixture with time.Local pinned to loc and returns the
// JSON of every row image, so the result captures any host-timezone dependence.
func decodeRowsIn(t *testing.T, path string, loc *time.Location) string {
	t.Helper()
	saved := time.Local
	time.Local = loc
	t.Cleanup(func() { time.Local = saved })

	var rows []schema.RowImage
	for _, e := range collectAll(t, adapter.Source{Path: path}, adapter.DecodeOpts{}) {
		ev, ok := e.ev.(*schema.Event)
		if !ok || ev.Decoded == nil {
			continue
		}
		rows = append(rows, ev.Decoded.Rows...)
	}
	if len(rows) == 0 {
		t.Fatalf("fixture %s decoded no row images", path)
	}
	b, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// TIMESTAMP columns are stored in the binlog as a UTC epoch. go-mysql renders
// them through time.Local unless the parser is given an explicit location, so
// without that the decode output differs per host — and the committed L3
// goldens only pass in the timezone they were recorded in.
func TestRowDecodeIsHostTimezoneIndependent(t *testing.T) {
	kolkata, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		t.Skipf("tzdata unavailable: %v", err)
	}
	path := corpusFixture(t, "8.0", "mysql-8.0.binlog")

	utc := decodeRowsIn(t, path, time.UTC)
	ist := decodeRowsIn(t, path, kolkata)

	if utc != ist {
		t.Fatalf("decode differs by host timezone:\n  UTC: %s\n  IST: %s", utc, ist)
	}
}
