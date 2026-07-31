package corpus

import "github.com/adrijshikhar/binsight/internal/adapter"

// Feature names recorded in the manifest and gated by server version. These are
// the version-specific binlog edge cases the workload catalog exercises.
const (
	FeatureJSON          = "json"                // JSON columns (MySQL 5.7+)
	FeatureGeneratedCols = "generated_columns"   // generated/virtual columns (5.7+)
	FeaturePartialJSON   = "partial_json"        // PARTIAL_UPDATE_ROWS (8.0.23+)
	FeatureTxnPayload    = "transaction_payload" // compressed TRANSACTION_PAYLOAD (8.0.20+)
	FeatureFKeys         = "fkeys"               // FK parent/child with ON DELETE CASCADE (5.6+)
	FeatureAnnotateRows  = "annotate_rows"       // MariaDB ANNOTATE_ROWS
	FeatureMariaGTID     = "maria_gtid"          // MariaDB GTID events
	// FeatureRowMetadataFull marks a fixture written with binlog_row_metadata=FULL
	// (MySQL 8.0+), so its TABLE_MAP events carry column names. Unlike the others,
	// this is driven by a server config flag, not a workload/<feature>.sql file —
	// the generator seeds it from versionConfig.Features.
	FeatureRowMetadataFull = "row_metadata_full"
)

// atLeast reports whether v is >= the given major.minor.patch.
func atLeast(v adapter.ServerVersion, maj, min, patch int) bool {
	if v.Major != maj {
		return v.Major > maj
	}
	if v.Minor != min {
		return v.Minor > min
	}
	return v.Patch >= patch
}

// Two kinds of corpus feature, recorded the same way in a fixture's manifest
// features[] but declared in different places:
//
//   - version-gated (below): producible from a plain workload SQL file on any
//     server new enough — gated here by version, applied by workloadSQL. Some
//     still need a server flag to take their special form (e.g. partial_json
//     needs binlog_row_value_options=PARTIAL_JSON); that flag lives in the
//     versionConfig.ExtraSrv for each config that should exercise it.
//   - config-level (e.g. row_metadata_full): driven purely by a server flag with
//     no dedicated workload — seeded from versionConfig.Features, NOT returned
//     here. transaction_payload is config-level too (needs global compression);
//     it is intentionally absent below — see the NOTE.
//
// SupportedFeatures returns the version-gated add-ons a server version can
// produce; unparseable versions yield no add-ons (base workload only).
func SupportedFeatures(serverVersion string) []string {
	v, ok := adapter.ParseServerVersion(serverVersion)
	if !ok {
		return nil
	}
	var out []string
	switch v.Flavor {
	case adapter.FlavorMySQL:
		if atLeast(v, 5, 6, 0) {
			out = append(out, FeatureFKeys)
		}
		if atLeast(v, 5, 7, 0) {
			out = append(out, FeatureJSON, FeatureGeneratedCols)
		}
		if atLeast(v, 8, 0, 23) {
			out = append(out, FeaturePartialJSON)
		}
		// NOTE: FeatureTxnPayload (TRANSACTION_PAYLOAD) is intentionally NOT
		// version-gated here. It needs binlog_transaction_compression, which is
		// global (hides every other event behind payload wrappers) — so it
		// warrants its own dedicated compressed fixture rather than riding along
		// on the shared per-version workload. Deferred; see ROADMAP.
	case adapter.FlavorMariaDB:
		// annotate_rows + maria_gtid are flavor/server-flag driven (no workload
		// SQL file), so they are config-level features seeded via
		// versionConfig.Features, NOT returned here — a feature is only recorded
		// when a matching workload/<feature>.sql exists. See gen-corpus config.go.
		if atLeast(v, 10, 2, 0) {
			out = append(out, FeatureJSON) // MariaDB JSON is an alias but still exercised
		}
	}
	return out
}
