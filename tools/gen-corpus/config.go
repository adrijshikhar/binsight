package main

// versionConfig pins one server image and the extra flags/quirks needed to
// produce a binlog from it. Tags are pinned for reproducibility (spec §5).
type versionConfig struct {
	Key      string   // corpus subdir + `make corpus VERSION=<Key>`
	Image    string   // pinned docker image tag
	Platform string   // "" = native; "linux/amd64" for amd64-only EOL images
	GTIDMode string   // ON | OFF
	Checksum string   // CRC32 | NONE (expected default for the version)
	Format   string   // ROW (the harness always sets ROW for fixtures)
	ExtraSrv []string // extra server args appended after the base binlog flags
	Features []string // config-level features to seed in the manifest (e.g.
	// row_metadata_full) that are driven by a server flag, not a workload SQL file.
}

// matrix is the version order from spec §3: most-relevant + native-arch first,
// EOL/emulated and divergent (MariaDB) last. Generation is opt-in per version
// via `make corpus VERSION=<key>`; `make corpus` does all.
var matrix = []versionConfig{
	// PARTIAL_JSON enables PARTIAL_UPDATE_ROWS (8.0.23+). Transaction compression
	// is NOT global — the txn_payload workload turns it on per-session for one
	// transaction, so the rest of the fixture keeps plain (visible) row events.
	{Key: "8.0", Image: "mysql:8.0.39", GTIDMode: "ON", Checksum: "CRC32", Format: "ROW",
		ExtraSrv: []string{"--binlog-row-value-options=PARTIAL_JSON"}},
	// Same server as 8.0 but with FULL row metadata so TABLE_MAP carries column
	// names — validates the column-name decode path (vs the MINIMAL default).
	// Carries PARTIAL_JSON too (same as 8.0) so the version-gated partial_json
	// workload it applies actually emits PARTIAL_UPDATE_ROWS — otherwise the
	// manifest would record a feature the fixture doesn't truly exercise.
	{Key: "8.0-full", Image: "mysql:8.0.39", GTIDMode: "ON", Checksum: "CRC32", Format: "ROW",
		ExtraSrv: []string{"--binlog-row-metadata=FULL", "--binlog-row-value-options=PARTIAL_JSON"},
		Features: []string{"row_metadata_full"}},
	// Dedicated FK-cascade fixture: the fkeys workload builds a parent/child pair
	// with ON DELETE CASCADE and deletes a parent row. InnoDB's child cascade
	// deletes are NOT written to the binlog, so the cascade_risk detector should
	// fire. Plain 8.0 config (no special ExtraSrv) — the workload alone exercises it.
	{Key: "8.0-fkeys", Image: "mysql:8.0.39", GTIDMode: "ON", Checksum: "CRC32", Format: "ROW"},
	{Key: "8.4", Image: "mysql:8.4.3", GTIDMode: "ON", Checksum: "CRC32", Format: "ROW",
		ExtraSrv: []string{"--binlog-row-value-options=PARTIAL_JSON"}},
	{Key: "5.7", Image: "mysql:5.7.44", Platform: "linux/amd64", GTIDMode: "ON", Checksum: "CRC32", Format: "ROW"},
	{Key: "5.6", Image: "mysql:5.6.51", Platform: "linux/amd64", GTIDMode: "OFF", Checksum: "CRC32", Format: "ROW"},
	{Key: "5.5", Image: "mysql:5.5.62", Platform: "linux/amd64", GTIDMode: "OFF", Checksum: "NONE", Format: "ROW"},
	{Key: "maria-10.6", Image: "mariadb:10.6.18", GTIDMode: "OFF", Checksum: "CRC32", Format: "ROW",
		ExtraSrv: []string{"--binlog-annotate-row-events=ON"},
		Features: []string{"annotate_rows", "maria_gtid"}},
	{Key: "maria-11.4", Image: "mariadb:11.4.3", GTIDMode: "OFF", Checksum: "CRC32", Format: "ROW",
		ExtraSrv: []string{"--binlog-annotate-row-events=ON"},
		Features: []string{"annotate_rows", "maria_gtid"}},
}

func findConfig(key string) (versionConfig, bool) {
	for _, c := range matrix {
		if c.Key == key {
			return c, true
		}
	}
	return versionConfig{}, false
}
