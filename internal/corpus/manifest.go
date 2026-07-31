// Package corpus describes the multi-version conformance fixture set: the
// manifest schema shared by the offline generator (tools/gen-corpus) and the
// always-on conformance matrix (internal/conformance), plus the version→feature
// gating used to decide which workload add-ons and which assertions apply.
package corpus

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/adrijshikhar/binsight/internal/adapter"
)

// Fixture is one committed binlog file plus the metadata the conformance matrix
// needs to gate its assertions. Path is relative to the corpus root.
type Fixture struct {
	Path          string   `json:"path"`
	ServerVersion string   `json:"server_version"`
	Format        string   `json:"format"`    // ROW | STATEMENT | MIXED
	Checksum      string   `json:"checksum"`  // CRC32 | NONE
	GTIDMode      string   `json:"gtid_mode"` // ON | OFF
	Features      []string `json:"features"`  // e.g. ["json","partial_json"]
}

// HasFeature reports whether the fixture exercises a named edge-case feature.
func (f Fixture) HasFeature(name string) bool {
	for _, x := range f.Features {
		if strings.EqualFold(x, name) {
			return true
		}
	}
	return false
}

// HasCRC32 reports whether CRC32 checksum assertions apply to this fixture.
func (f Fixture) HasCRC32() bool { return strings.EqualFold(f.Checksum, "CRC32") }

// IsRow reports whether the fixture was written in ROW format (gates row-image
// assertions).
func (f Fixture) IsRow() bool { return strings.EqualFold(f.Format, "ROW") }

// IsMySQLRow reports whether the fixture is a MySQL ROW-format binlog — the
// scope shared by the L2 cross-adapter and L3 golden oracles (MariaDB and
// non-ROW fixtures are out of scope). Centralized so both layers agree.
func (f Fixture) IsMySQLRow() bool {
	if !f.IsRow() {
		return false
	}
	v, ok := adapter.ParseServerVersion(f.ServerVersion)
	return ok && v.Flavor == adapter.FlavorMySQL
}

// Manifest is the corpus index: every committed fixture across all versions.
type Manifest struct {
	Fixtures []Fixture `json:"fixtures"`
}

// Load reads and parses a manifest.json. A missing file returns os.ErrNotExist
// (callers — e.g. the conformance matrix — should skip when the corpus has not
// been generated yet). An empty/zero manifest is valid.
func Load(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err // includes fs.ErrNotExist; caller decides to skip
	}
	var m Manifest
	if len(strings.TrimSpace(string(data))) == 0 {
		return &m, nil
	}
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}
