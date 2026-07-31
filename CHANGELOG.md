# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-01

First public release of **binsight**.

### Added

- Read-only MySQL/MariaDB binlog viewer and analyzer; directory scan into a
  SQLite index.
- Views: Events, Transactions, Tables, Overview metrics, Anomalies, Schema.
  Drawer: Rows, Diff, Hex, JSON.
- Pluggable decode adapters (go-mysql, with mysqlbinlog as a cross-check oracle).
- Anomaly detection engine.
- DDL → schema parsing with cascade-risk detection.
- Live tail (fsnotify + SSE) and incremental append-index with true-seek resume.
- Remote streaming: mirror a server's binlogs as a replica.
- Mantine v8 UI, light/dark.

### Fixed

- Files >4 GiB: positions no longer break on the uint32 `end_log_pos` wrap.
- TIMESTAMP columns decode in UTC, so output no longer varies by host timezone.

### Security

- Refuse cross-origin and non-loopback requests (DNS rebinding, CSRF). Host
  check is skipped when `BV_BIND` is set.
- `GET /api/settings` no longer returns the stored replication password.
