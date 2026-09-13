# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/adrijshikhar/binsight/compare/v0.2.1...v0.3.0) (2026-09-13)


### Features

* **website:** add comprehensive /docs documentation section ([#26](https://github.com/adrijshikhar/binsight/issues/26)) ([a6ead0c](https://github.com/adrijshikhar/binsight/commit/a6ead0c1d37db098565eedd2bf68ee841fc7e91c))
* **website:** add custom 1200x630 OpenGraph social share card ([#21](https://github.com/adrijshikhar/binsight/issues/21)) ([72a1581](https://github.com/adrijshikhar/binsight/commit/72a158127858d0c5c3911761f2bb6304e1e23174))
* **website:** elevate landing page with zed.dev blueprint aesthetics ([#23](https://github.com/adrijshikhar/binsight/issues/23)) ([c55bb00](https://github.com/adrijshikhar/binsight/commit/c55bb000f38bd5f1c7680c596e6a06ca80802aeb))
* **website:** redirect binsight.pages.dev to custom domain via edge middleware ([#19](https://github.com/adrijshikhar/binsight/issues/19)) ([d1df148](https://github.com/adrijshikhar/binsight/commit/d1df14891125cf707e5219713cdc7a7161cecfb4))
* **website:** scaffold marketing website with Astro and static Cloudflare Pages pipeline ([#18](https://github.com/adrijshikhar/binsight/issues/18)) ([662ba53](https://github.com/adrijshikhar/binsight/commit/662ba53f3d9805c734c4b79f317ad8a338cc2746))
* **website:** show GitHub stars and forks badges across navigation and CTAs ([#22](https://github.com/adrijshikhar/binsight/issues/22)) ([03ee87a](https://github.com/adrijshikhar/binsight/commit/03ee87af3d2fbb16fa9ed58d4128be7e611581c2))
* **website:** space out layout, add Anime.js scroll animations, and uupm.cc resources ([#25](https://github.com/adrijshikhar/binsight/issues/25)) ([0b51f02](https://github.com/adrijshikhar/binsight/commit/0b51f02d51e8c0efaec1cbd516fd97f88bd6f5c2))


### Bug Fixes

* **ci:** use HOMEBREW_TAP_TOKEN for release-please to trigger downstream distribution ([3143cee](https://github.com/adrijshikhar/binsight/commit/3143cee1b05a62073ccbf914d32489e35724437a))
* **website:** eliminate glow halos, blur blobs, and text gradients ([#24](https://github.com/adrijshikhar/binsight/issues/24)) ([56c4c48](https://github.com/adrijshikhar/binsight/commit/56c4c481eaea6bb3f2541d1987e21dc00cee448f))


### Reverts

* remove premature web app migration design spec ([26edbe8](https://github.com/adrijshikhar/binsight/commit/26edbe879af6363d81bf031434ea17c1d558864a))

## [0.2.1](https://github.com/adrijshikhar/binsight/compare/v0.2.0...v0.2.1) (2026-09-12)


### Performance Improvements

* optimize binlog event conversion and SQLite WAL indexing ([#13](https://github.com/adrijshikhar/binsight/issues/13)) ([58fea9e](https://github.com/adrijshikhar/binsight/commit/58fea9e48ba64f09b30ffdf58074106fa97b1b0b))

## [0.2.0] - 2026-09-11

### Changed

- **Breaking:** Environment variables renamed from `BV_*` to `BINSIGHT_*`
  (`BINSIGHT_PORT`, `BINSIGHT_BIND`, `BINSIGHT_DATA_DIR`, `BINSIGHT_WATCH_DIR`,
  `BINSIGHT_WATCH`, `BINSIGHT_MYSQLBINLOG_PATH`, `BINSIGHT_STREAM_*`,
  `BINSIGHT_EXEC_ADAPTERS`, `BINSIGHT_E2E_DOCKER`).
- **Breaking:** Default data directory moved from `/var/lib/binlog-viewer` to
  `/var/lib/binsight` (local dev fallback moved from `~/.binlog-viewer` to
  `~/.binsight`).
- Frontend upgraded to Mantine v9 and React 19.
- Dockerfile frontend stage switched from npm to bun for toolchain consistency.

### Added

- Contributor Covenant Code of Conduct (`CODE_OF_CONDUCT.md`).
- Race detector enabled in CI workflow (`go test -race`).

## [0.1.1] - 2026-08-01

### Fixed

- Homebrew on macOS: the installed binary was killed on first run (exit 137).
  The binaries are not notarized, so Homebrew's download carried
  `com.apple.quarantine` and Gatekeeper blocked it. The cask now strips the
  attribute on install.
- `go install` reported `dev` instead of the version. `go install` cannot pass
  ldflags, so the version now falls back to the module version from the build
  info.

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
