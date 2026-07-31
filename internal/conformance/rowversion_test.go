package conformance

// Locks the V1/V2 row-event boundary across the version matrix: MySQL < 5.6
// emits V1 row events (WRITE/UPDATE/DELETE_ROWS_V1, 0x17/18/19) and go-mysql must
// decode them — the mysqlbinlog client cannot read pre-5.6 logs (see the adapter
// Supports floor). MySQL 5.6+ emits V2. This is the Phase 4 deliverable: go-mysql
// is the V1-capable decoder, validated end-to-end against a real 5.5 fixture.

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
)

func TestRowEventVersionByServer(t *testing.T) {
	m := loadCorpus(t)
	for _, f := range m.Fixtures {
		f := f
		t.Run(f.Path, func(t *testing.T) {
			if !f.IsMySQLRow() {
				t.Skip("not a MySQL ROW fixture")
			}
			v, ok := adapter.ParseServerVersion(f.ServerVersion)
			if !ok {
				t.Fatalf("unparseable server version %q", f.ServerVersion)
			}
			wantV1 := v.Major < 5 || (v.Major == 5 && v.Minor < 6)

			evs := decodeAll(t, filepath.Join(corpusRoot, f.Path))
			var v1, v2 int
			for _, ev := range evs {
				switch {
				case strings.HasSuffix(ev.Header.TypeName, "_ROWS_V1"):
					v1++
				case strings.HasSuffix(ev.Header.TypeName, "_ROWS_V2"):
					v2++
				}
			}
			if v1+v2 == 0 {
				t.Fatal("no versioned row events decoded")
			}
			if wantV1 && (v1 == 0 || v2 > 0) {
				t.Errorf("%s (V1 server): expected only V1 row events, got v1=%d v2=%d", f.ServerVersion, v1, v2)
			}
			if !wantV1 && (v2 == 0 || v1 > 0) {
				t.Errorf("%s (V2 server): expected only V2 row events, got v1=%d v2=%d", f.ServerVersion, v1, v2)
			}
		})
	}
}
