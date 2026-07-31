// Command gen-corpus is the OFFLINE maintainer tool that generates authentic
// per-version binlog fixtures for the conformance matrix. It is NOT on the
// `go test` path — it requires Docker and is run only to (re)generate or add a
// version (version-testing spec §5). Its output (committed fixtures + manifest)
// is what the always-on internal/conformance matrix validates.
//
// Usage:
//
//	go run ./tools/gen-corpus             # all versions in the matrix
//	go run ./tools/gen-corpus -version 8.0
//
// For each selected version it: starts the pinned server container with binlog
// enabled, waits until healthy, applies the workload SQL (base + version-gated
// add-ons), FLUSH BINARY LOGS, copies the resulting binlog(s) out via docker cp,
// and writes them under internal/testdata/corpus/<key>/ with a manifest entry.
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"

	"github.com/adrijshikhar/binsight/internal/corpus"
)

//go:embed workload/*.sql
var workloadFS embed.FS

const corpusRoot = "internal/testdata/corpus"

func main() {
	version := flag.String("version", "", "single version key to generate (default: all)")
	out := flag.String("out", corpusRoot, "corpus output root")
	sample := flag.String("sample", "", "instead of the corpus, generate the demo binlog at this path (MySQL 8)")
	sampleSQL := flag.String("sample-sql", "samples/demo-workload.sql", "workload SQL for -sample")
	flag.Parse()

	if *sample != "" {
		if err := ensureDocker(); err != nil {
			fatalf("docker is required: %v", err)
		}
		c, _ := findConfig("8.0")
		// Keep the bulk insert as one large WRITE_ROWS event (default 8 KB cap
		// would split it) so the sample exercises the bulk_row_event detector.
		c.ExtraSrv = append(c.ExtraSrv, "--binlog-row-event-max-size=1073741824")
		// The demo workload lives in samples/ (next to the binlog it produces)
		// so it is self-documenting; read it from disk rather than the embed FS.
		sqlBytes, err := os.ReadFile(*sampleSQL)
		if err != nil {
			fatalf("read sample workload %s: %v", *sampleSQL, err)
		}
		fmt.Printf("==> generating demo sample (%s) → %s\n", c.Image, *sample)
		if _, err := dockerLifecycle(c, string(sqlBytes), *sample); err != nil {
			fatalf("generate sample: %v", err)
		}
		fmt.Println("done")
		return
	}

	configs := matrix
	if *version != "" {
		c, ok := findConfig(*version)
		if !ok {
			fatalf("unknown version %q; known: %s", *version, knownKeys())
		}
		configs = []versionConfig{c}
	}

	if err := ensureDocker(); err != nil {
		fatalf("docker is required for corpus generation: %v", err)
	}

	man := loadOrInit(filepath.Join(*out, "manifest.json"))
	for _, c := range configs {
		fmt.Printf("==> generating %s (%s)\n", c.Key, c.Image)
		fx, err := generate(c, *out)
		if err != nil {
			fatalf("generate %s: %v", c.Key, err)
		}
		man = upsert(man, fx)
	}
	if err := writeManifest(filepath.Join(*out, "manifest.json"), man); err != nil {
		fatalf("write manifest: %v", err)
	}
	fmt.Printf("done: %d fixtures in manifest\n", len(man.Fixtures))
}

// generate runs one version end-to-end via Docker and returns its fixture entry.
func generate(c versionConfig, out string) ([]corpus.Fixture, error) {
	rel := filepath.Join(c.Key, "mysql-"+c.Key+".binlog")
	dest := filepath.Join(out, rel)
	sql, applied := workloadSQL(c)
	serverVersion, err := dockerLifecycle(c, sql, dest)
	if err != nil {
		return nil, err
	}
	// Seed config-level features (server-flag driven, not workload-file driven).
	applied = append(applied, c.Features...)
	if applied == nil {
		applied = []string{} // marshal as [] not null
	}
	return []corpus.Fixture{{
		Path:          filepath.ToSlash(rel),
		ServerVersion: serverVersion,
		Format:        c.Format,
		Checksum:      c.Checksum,
		GTIDMode:      c.GTIDMode,
		Features:      applied, // only add-ons the workload actually applied
	}}, nil
}

// workloadSQL returns the base workload plus the version-gated add-on snippets
// for a config (concatenated in apply order), and the list of add-on features
// actually applied — i.e. those whose workload/<feature>.sql file exists. The
// applied list becomes the fixture's manifest features, so it reflects what the
// fixture truly exercises (not merely what the version could support).
func workloadSQL(c versionConfig) (sql string, applied []string) {
	sql = mustRead("workload/base.sql")
	for _, feat := range corpus.SupportedFeatures(serverVersionFor(c)) {
		if data, err := workloadFS.ReadFile("workload/" + feat + ".sql"); err == nil {
			sql += "\n-- feature: " + feat + "\n" + string(data)
			applied = append(applied, feat)
		}
	}
	return sql, applied
}

// serverVersionFor maps a config to a representative server_version string for
// feature gating (the real value is read from FORMAT_DESCRIPTION post-generate).
func serverVersionFor(c versionConfig) string {
	// Derive from the pinned image tag, e.g. "mysql:8.0.39" → "8.0.39",
	// "mariadb:10.6.18" → "10.6.18-MariaDB".
	tag := c.Image
	if i := indexByte(tag, ':'); i >= 0 {
		tag = tag[i+1:]
	}
	if hasPrefix(c.Image, "mariadb") {
		return tag + "-MariaDB"
	}
	return tag
}

func mustRead(name string) string {
	data, err := workloadFS.ReadFile(name)
	if err != nil {
		fatalf("read embedded %s: %v", name, err)
	}
	return string(data)
}

func loadOrInit(path string) *corpus.Manifest {
	m, err := corpus.Load(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &corpus.Manifest{} // first run — start fresh
		}
		// A malformed manifest must NOT be silently overwritten (it would destroy
		// every other version's entry on the next generate).
		fatalf("load manifest %s: %v", path, err)
	}
	return m
}

// upsert replaces any existing fixtures for the same version subdir, then adds
// the freshly generated ones; result stays sorted by path for stable diffs.
func upsert(m *corpus.Manifest, fresh []corpus.Fixture) *corpus.Manifest {
	if len(fresh) == 0 {
		return m
	}
	prefix := path.Dir(fresh[0].Path) + "/" // Path is slash-normalized; use slash-aware path.Dir
	kept := m.Fixtures[:0:0]
	for _, f := range m.Fixtures {
		if !hasPrefix(f.Path, prefix) {
			kept = append(kept, f)
		}
	}
	kept = append(kept, fresh...)
	sort.Slice(kept, func(i, j int) bool { return kept[i].Path < kept[j].Path })
	return &corpus.Manifest{Fixtures: kept}
}

func writeManifest(path string, m *corpus.Manifest) error {
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

func knownKeys() string {
	keys := make([]string, 0, len(matrix))
	for _, c := range matrix {
		keys = append(keys, c.Key)
	}
	return fmt.Sprint(keys)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "gen-corpus: "+format+"\n", args...)
	os.Exit(1)
}

// small dependency-free string helpers (avoid importing strings just for these)
func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func hasPrefix(s, p string) bool { return len(s) >= len(p) && s[:len(p)] == p }
