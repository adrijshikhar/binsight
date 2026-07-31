package corpus

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

func writeFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0o644)
}

func TestLoadManifest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "manifest.json")
	if err := writeFile(path, `{"fixtures":[
		{"path":"8.0/a.binlog","server_version":"8.0.29","format":"ROW","checksum":"CRC32","gtid_mode":"ON","features":["json","partial_json"]},
		{"path":"5.5/b.binlog","server_version":"5.5.62","format":"ROW","checksum":"NONE","gtid_mode":"OFF","features":[]}
	]}`); err != nil {
		t.Fatal(err)
	}
	m, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.Fixtures) != 2 {
		t.Fatalf("want 2 fixtures, got %d", len(m.Fixtures))
	}
	a := m.Fixtures[0]
	if !a.HasCRC32() || !a.IsRow() || !a.HasFeature("json") || a.HasFeature("annotate_rows") {
		t.Errorf("fixture a gating wrong: %+v", a)
	}
	b := m.Fixtures[1]
	if b.HasCRC32() {
		t.Error("5.5 NONE-checksum fixture must not assert CRC32")
	}
}

func TestLoadMissingManifestIsNotExist(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "nope.json"))
	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("missing manifest should return fs.ErrNotExist, got %v", err)
	}
}

func TestLoadEmptyManifest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "manifest.json")
	if err := writeFile(path, "  "); err != nil {
		t.Fatal(err)
	}
	m, err := Load(path)
	if err != nil || m == nil || len(m.Fixtures) != 0 {
		t.Fatalf("empty manifest should parse to zero fixtures: m=%v err=%v", m, err)
	}
}

func TestSupportedFeatures(t *testing.T) {
	cases := map[string][]string{
		"5.5.62":     nil,
		"5.7.31-log": {FeatureFKeys, FeatureJSON, FeatureGeneratedCols},
		// transaction_payload is no longer version-gated (it needs global
		// compression — a dedicated fixture; see features.go / ROADMAP).
		"8.0.20": {FeatureFKeys, FeatureJSON, FeatureGeneratedCols},
		"8.0.29": {FeatureFKeys, FeatureJSON, FeatureGeneratedCols, FeaturePartialJSON},
		// annotate_rows/maria_gtid are config-level (seeded via versionConfig.Features),
		// not version-gated here — SupportedFeatures returns only workload-driven JSON.
		"10.6.4-MariaDB": {FeatureJSON},
		"garbage":        nil,
	}
	for ver, want := range cases {
		got := SupportedFeatures(ver)
		sort.Strings(got)
		w := append([]string(nil), want...)
		sort.Strings(w)
		if len(got) == 0 && len(w) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, w) {
			t.Errorf("SupportedFeatures(%q) = %v, want %v", ver, got, w)
		}
	}
}
