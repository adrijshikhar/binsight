package conformance

import (
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/corpus"
)

// TestColumnNamesFromFullMetadata validates the column-name decode path against
// the committed corpus: fixtures written with binlog_row_metadata=FULL (feature
// "row_metadata_full") must carry a column name per column on every TABLE_MAP,
// while MINIMAL fixtures must leave names absent so the UI falls back to @1..@n.
func TestColumnNamesFromFullMetadata(t *testing.T) {
	m := loadCorpus(t)
	for _, f := range m.Fixtures {
		f := f
		t.Run(f.Path, func(t *testing.T) {
			evs := decodeAll(t, filepath.Join(corpusRoot, f.Path))

			var tableMaps int
			var sawNamed bool
			names := map[string]bool{}
			for _, ev := range evs {
				if ev.Header.TypeName != "TABLE_MAP" || ev.Decoded == nil {
					continue
				}
				tableMaps++
				cn := ev.Decoded.ColumnNames
				if f.HasFeature(corpus.FeatureRowMetadataFull) {
					// FULL: one name per column, none blank.
					if len(cn) != len(ev.Decoded.ColumnTypes) {
						t.Errorf("TABLE_MAP @%d: %d column names, %d types — want equal",
							ev.Header.Pos, len(cn), len(ev.Decoded.ColumnTypes))
						continue
					}
					for i, n := range cn {
						if n == "" {
							t.Errorf("TABLE_MAP @%d: column %d has empty name", ev.Header.Pos, i+1)
						}
						names[n] = true
					}
					sawNamed = true
				} else {
					// MINIMAL (default): no names — UI falls back to positional @n.
					if cn != nil {
						t.Errorf("TABLE_MAP @%d: expected no column names on a non-FULL fixture, got %v",
							ev.Header.Pos, cn)
					}
				}
			}

			// Every committed fixture has uncompressed top-level TABLE_MAPs, so a
			// zero count signals a decode regression — fail for all fixtures.
			// (A future transaction-compressed fixture, where row events are
			// wrapped in a TRANSACTION_PAYLOAD, would need its own handling.)
			if tableMaps == 0 {
				t.Fatal("no TABLE_MAP events decoded")
			}
			if f.HasFeature(corpus.FeatureRowMetadataFull) {
				if !sawNamed {
					t.Fatal("FULL fixture decoded no named TABLE_MAP")
				}
				// Spot-check known columns from workload/base.sql's types_all table.
				for _, want := range []string{"id", "v_varchar", "e_enum"} {
					if !names[want] {
						t.Errorf("expected decoded column name %q from base workload, not found", want)
					}
				}
			}
		})
	}
}
