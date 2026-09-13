<p align="center">
  <a href="https://binsight.adrijshikhar.dev">
    <img src="docs/assets/logo.svg" alt="Binsight — MySQL &amp; MariaDB Binlog Analyzer" width="100%">
  </a>
</p>

<p align="center">
  <strong>A fast, local, read-only MySQL &amp; MariaDB binlog viewer, decoder, and transaction analyzer.</strong>
</p>

<p align="center">
  <a href="https://github.com/adrijshikhar/binsight/releases/latest"><img src="https://img.shields.io/github/v/release/adrijshikhar/binsight?color=0ea5e9&label=release" alt="GitHub Release"></a>
  <a href="https://github.com/adrijshikhar/binsight/actions/workflows/ci.yml"><img src="https://github.com/adrijshikhar/binsight/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <a href="https://binsight.adrijshikhar.dev"><img src="https://img.shields.io/badge/website-binsight.adrijshikhar.dev-0284c7?logo=cloudflarepages&logoColor=white" alt="Website"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="go.mod"><img src="https://img.shields.io/github/go-mod/go-version/adrijshikhar/binsight?color=blue" alt="Go Version"></a>
  <a href="https://ghcr.io/adrijshikhar/binsight"><img src="https://img.shields.io/badge/ghcr.io-adrijshikhar%2Fbinsight-blue?logo=docker&logoColor=white" alt="Docker Image"></a>
</p>

<p align="center">
  <a href="https://binsight.adrijshikhar.dev"><strong>Explore Website »</strong></a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#key-features">Key Features</a> ·
  <a href="#remote-replication-streaming">Remote Streaming</a> ·
  <a href="#safety--production-trust">Safety &amp; Trust</a> ·
  <a href="#configuration">Configuration</a>
</p>

---

## Why Binsight?

When replication breaks, transactions blow up your storage, or data goes missing, database engineers are forced to reach for:

```bash
mysqlbinlog --verbose --base64-output=DECODE-ROWS mysql-bin.000124 | less
```

That means parsing **gigabytes of text streams**, guessing transaction boundaries, manually hunting for rollback flags, and dealing with decoder discrepancies between tools.

**Binsight** transforms raw, opaque binlog bytes into a structured, searchable SQLite metadata index with a zero-latency local browser interface:

* ⚡ **Indexed & Non-Blocking**: Decode once into SQLite; virtualized tables navigate millions of events instantly without locking or freezing your browser.
* 🔍 **Side-by-Side Decoder Diff**: Cross-compare pure Go decoders (`go-mysql`) against native `mysqlbinlog` output with per-field divergence highlighting.
* 🚨 **Automated Anomaly Detection**: 6 built-in forensic detectors flag huge transactions, rolled-back writes, bulk row mutations, and position wrap boundaries.
* 📡 **Live Replica Streaming**: Mirror binlog events directly from running MySQL/MariaDB instances using the native replication protocol.
* 🔒 **Safe By Default**: 100% read-only, loopback `127.0.0.1` binding, zero telemetry, zero CGO, and zero outbound network calls.

---

## Interface Preview

<p align="center">
  <img src="docs/screenshots/events-dark.png" alt="Binsight Events View — Filterable virtualized event table with transaction grouping" width="100%">
</p>

<p align="center">
  <em>Filterable event stream with transaction grouping, before/after row image inspection, and inline anomaly alerts.</em>
</p>

---

## Quickstart

### 1. Launch against local binlogs
Point Binsight at any folder containing binary log files:

```bash
binsight serve /var/lib/mysql
```
Open **`http://localhost:8080`** in your browser.

### 2. Try with a sample binlog
Don't have binlogs handy? Download our prepared sample corpus:

```bash
mkdir -p samples && curl -L https://github.com/adrijshikhar/binsight/releases/latest/download/sample-binlog.tar.gz | tar -xz -C samples
binsight serve samples
```

---

## Installation

### Homebrew (macOS & Linux)
```bash
brew install adrijshikhar/tap/binsight
```

### Standalone Shell Installer
Automatically detects OS (`Darwin` / `Linux`) and architecture (`amd64` / `arm64`), verifies SHA-256 checksums, and installs cleanly to `~/.local/bin` without requiring `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/adrijshikhar/binsight/main/install.sh | sh
```
*Options: Set `BINSIGHT_VERSION=v0.2.0` to pin a specific version, or `BINSIGHT_INSTALL_DIR=/usr/local/bin` to customize destination.*

### Docker Container
Run standalone without installing Go:

```bash
docker run --rm -p 8080:8080 -v /path/to/binlogs:/data \
  ghcr.io/adrijshikhar/binsight:0.2.0 serve /data
```

### Go Toolchain
```bash
go install github.com/adrijshikhar/binsight/cmd/binsight@v0.2.0
```

### Prebuilt Standalone Binaries
Direct compiled binaries are available for every release on the [Releases Page](https://github.com/adrijshikhar/binsight/releases/latest):
* macOS Apple Silicon (`darwin_arm64`) & Intel (`darwin_amd64`)
* Linux 64-bit (`linux_amd64`) & ARM64 (`linux_arm64`)

---

## Key Features

### 1. Side-by-Side Decoder Diff
When investigating corrupt rows or replication drift, discrepancies between parser implementations can lead to false conclusions. Binsight parses events using both internal decoders (`go-mysql`) and external native `mysqlbinlog`, highlighting field-level differences side-by-side:

<p align="center">
  <img src="docs/screenshots/diff-dark.png" alt="Binsight Diff View — Decoder comparison" width="100%">
</p>

### 2. Automated Anomaly Detection
Binsight continuously inspects transaction boundaries and event metadata for 6 critical operational anomalies:

| Detector | Trigger Criteria | Operational Impact |
|---|---|---|
| **Huge Transaction (Bytes)** | Exceeds byte threshold (default `50 MiB`) | Risk of replication lag, OOM, or disk saturation |
| **Huge Transaction (Rows)** | Row mutation count exceeds threshold (default `10,000`) | Lock contention, long-running buffer pool hold |
| **Long-Running Transaction** | Wall-clock span between `BEGIN` and `XID` > threshold (default `60s`) | Replica lag accumulation, undo log bloat |
| **Rolled-Back Transaction** | Explicit rollback or transaction boundary abort | Failed application writes consuming binlog capacity |
| **Bulk Row Mutation** | Single `WRITE_ROWS` / `UPDATE_ROWS` event > threshold | Massive batch updates bypassing safe pagination |
| **Position Wrap (&gt; 4 GiB)** | File position crosses $2^{32}$ (4 GiB) boundary | Critical `pos_wrap` risk for older 32-bit tooling |

### 3. Analytics & Overview Dashboard
Per-file metrics breakdown including event distributions, size breakdowns, TPS throughput, and hottest tables:

<p align="center">
  <img src="docs/screenshots/overview-dark.png" alt="Binsight Overview Metrics" width="100%">
</p>

### 4. Forensic Hex Viewer & Schema Timeline
* **Hex Inspection**: Raw byte offset viewer overlaid with structured binlog event header layouts (timestamp, type, server ID, event length, next position, flags).
* **Schema / DDL Timeline**: Chronological log of `CREATE`, `ALTER`, `DROP`, and `TRUNCATE` statements with cascade risk warnings.
* **Live SSE Tail**: File watching via `fsnotify` pushes real-time event commits straight to the browser without re-scanning files.

---

## Remote Replication Streaming

Instead of manually exporting binlog files from production instances, Binsight can act as a **lightweight replica** over the MySQL replication protocol:

```
┌─────────────────────────┐          MySQL Replication Protocol          ┌─────────────────────────┐
│ Live MySQL / MariaDB    │ ───────────────────────────────────────────> │ Binsight Streamer       │
│ Source Server           │          (COM_BINLOG_DUMP / GTID)            │ (Stores in local spool) │
└─────────────────────────┘                                              └────────────┬────────────┘
                                                                                      │
                                                                         ┌────────────▼────────────┐
                                                                         │ SQLite Metadata Index   │
                                                                         │ + Real-Time Browser UI  │
                                                                         └─────────────────────────┘
```

1. Create a dedicated read-only replication user on the source:
```sql
CREATE USER 'binsight'@'%' IDENTIFIED BY 'strong_password';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'binsight'@'%';
```

2. Start Binsight with streaming enabled:
```bash
BINSIGHT_STREAM_ENABLED=true \
BINSIGHT_STREAM_HOST=mysql.internal \
BINSIGHT_STREAM_USER=binsight \
BINSIGHT_STREAM_PASSWORD=strong_password \
binsight serve /data
```
*Supports GTID auto-reconnect (`gtid_mode=ON`) and file-offset resume at clean transaction boundaries.*

---

## Safety & Production Trust

Binsight was engineered from day one for strict security and isolation in production environments:

* 🔒 **100% Read-Only Operation**: Binsight never writes to source database tables or binlog files.
* 🏠 **Loopback Binding by Default**: Server binds strictly to `127.0.0.1`. Remote traffic cannot access your UI unless explicitly overridden with `BINSIGHT_BIND=0.0.0.0`.
* 🚫 **Zero External Telemetry**: No phone-home beacons, tracking scripts, Google Analytics, or third-party cookies.
* 📦 **Pure Go & Zero CGO**: Single static binary compiled with zero external C runtime dependencies.

---

## Database Compatibility

Tested against official database engines in automated CI test matrices:

| Engine | Verified Versions | Protocol / Format |
|---|---|---|
| **MySQL** | `5.5`, `5.6`, `5.7`, `8.0`, `8.4 LTS` | Row-Based (RBR), Statement (SBR), Mixed, GTID |
| **MariaDB** | `10.6 LTS`, `11.4 LTS` | MariaDB Binlog format & GTID event types |

---

## Configuration

All parameters can be configured via environment variables or CLI flags:

| Environment Variable | Default | Description |
|---|---|---|
| `BINSIGHT_PORT` | `8080` | HTTP listen port for the web console |
| `BINSIGHT_BIND` | `127.0.0.1` | Bind address. Defaults to loopback for security. Set `0.0.0.0` to expose externally |
| `BINSIGHT_DATA_DIR` | `/var/lib/binsight` | Location for SQLite metadata index and spool files (`~/.binsight` locally) |
| `BINSIGHT_WATCH_DIR` | `/data` | Binlog directory to scan (overridden by `binsight serve <dir>`) |
| `BINSIGHT_WATCH` | `true` | Enable live filesystem watching (`fsnotify`) for incoming events |
| `BINSIGHT_MYSQLBINLOG_PATH` | `mysqlbinlog` | Path to `mysqlbinlog` executable (required for Diff comparison adapter) |
| `BINSIGHT_STREAM_ENABLED` | `false` | Enable live remote replication streaming from a database host |
| `BINSIGHT_STREAM_HOST` | _(unset)_ | Remote MySQL/MariaDB server host |
| `BINSIGHT_STREAM_PORT` | `3306` | Remote MySQL/MariaDB server port |
| `BINSIGHT_STREAM_USER` | _(unset)_ | Replication username |
| `BINSIGHT_STREAM_PASSWORD` | _(unset)_ | Replication password |
| `BINSIGHT_STREAM_FLAVOR` | `mysql` | Protocol flavor: `mysql` or `mariadb` |
| `BINSIGHT_STREAM_SERVER_ID` | `51789` | Replica server ID (must be unique on the replication topology) |
| `BINSIGHT_STREAM_MAX_SPOOL_BYTES` | `2147483648` | Maximum disk size for mirrored spool (default `2 GiB`, oldest pruned) |

---

## Architecture

```
                                  ┌───────────────────────────┐
                                  │   Binlog Source Files     │
                                  │   (Disk or Remote Spool)  │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │  Pluggable Decoder Engine │
                                  │ (go-mysql / mysqlbinlog)  │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │    SQLite Metadata Index   │
                                  │  (Transactions, DDL, Pos) │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │  Go HTTP Server (Chi/SSE) │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │   Embedded React 19 UI    │
                                  │    (Mantine 9, Vite)      │
                                  └───────────────────────────┘
```

For more details on adapter interfaces and capability negotiation, see [docs/pluggable-architecture.html](docs/pluggable-architecture.html).

---

## Development & Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflows, testing guidelines, and environment setup.

```bash
# Clone and build the full binary with embedded web UI
git clone https://github.com/adrijshikhar/binsight.git
cd binsight

# Build web frontend
make ui

# Run tests with race detector
go test -race ./...

# Start development server
go run ./cmd/binsight serve samples/
```

---

## License

Binsight is open-source software licensed under the [MIT License](LICENSE).  
Copyright © 2026 [Adrij Shikhar](https://adrijshikhar.dev).
