# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Database administrators (DBAs), Site Reliability Engineers (SREs), backend infrastructure engineers, and systems developers troubleshooting MySQL/MariaDB replication failures, analyzing binlog event volume/spikes, or auditing binary log corruption and replication lag.

## Product Purpose
Binsight is a local, high-performance, read-only binary log inspector and forensics workbench for MySQL and MariaDB. It gives engineers instant visibility into binlog events, transaction boundaries, schema alterations (DDL), row mutations (DML), and payload hex dumps without needing a live MySQL server or external dependencies.

## Positioning
Unlike standard command-line tools like `mysqlbinlog` (which produce overwhelming, unindexed multi-gigabyte text dumps) or enterprise replication proxies, Binsight delivers:
1. Pure-Go streaming parser with zero C/MySQL client library dependencies.
2. Dual-engine differential verification: cross-verifies pure-Go parser decoding against `mysqlbinlog` ground truth.
3. Automated 4GiB position wrap corruption detection and anomaly flagging.
4. Instant interactive desktop workbench with virtualized event inspection, live tailing via SSE, and payload diffing.

## Operating Context
- Local desktop or server environment inspecting raw binlog files (`mysql-bin.000001`) directly from disk.
- Live replication stream ingestion directly from MySQL/MariaDB masters as a replica client.
- Air-gapped or high-security database environments where zero external telemetry and read-only safety are mandatory.

## Capabilities and Constraints
- Read-only by design: zero mutation risk to running databases or binary log files.
- Dual-engine parsing: pure-Go fast path + reference comparison engine.
- 4GiB wrap detection: detects 32-bit position rollbacks in large binary logs.
- Web UI built with Mantine 9 + React 19 embedded into a single self-contained binary via Go embed.
- Static marketing site built with Astro 5 + Tailwind CSS v4.
- 100% local operation: zero analytics, zero external network requests, zero telemetry.

## Brand Commitments
- Name: Binsight (`binsight`)
- Aesthetic: Technical, blueprint-grade developer tool inspired by Zed.dev, Swiss editorial typography, IBM Plex Mono & IBM Plex Serif, solid electric cyan (`#38bdf8`) accents on slate surfaces.
- Anti-slop rule: No glowing purple/violet AI gradients, no floating fake cards, no bloated marketing fluff. Clean structural rails, corner diamond marks, monospaced data density.
- Voice: Precise, confident, engineering-led, authoritative.

## Evidence on Hand
- Production website: `https://binsight.adrijshikhar.dev`
- GitHub repository: `https://github.com/adrijshikhar/binsight`
- Homebrew Cask: `adrijshikhar/tap/binsight`
- Technical deep-dive: `adrijshikhar.dev/blog/building-a-pure-go-binlog-analyzer`
- Current release version: `v0.2.1`

## Product Principles
1. **Zero-Friction Inspection**: Run `binsight mysql-bin.000001` and get an immediate interactive forensics workbench in milliseconds.
2. **Absolute Read-Only Safety**: The database is sacred; Binsight never alters or locks logs.
3. **Data Density Over White Space**: High-signal monospace event streams, hex diffs, and transaction graphs tailored for engineering diagnostics.
4. **Verifiable Correctness**: When binlog specifications are ambiguous, dual-engine validation surfaces deviations honestly.
