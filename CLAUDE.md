# binlog-event-viewer — Concepts & Maintenance Notes

A living reference for how this app works, the invariants it relies on, and the
binlog-format gotchas that are easy to get wrong. **Read the "Binlog format
gotchas" section before reasoning about file sizes, positions, or resume.**

> Keep this file current. When a phase ships or a non-obvious fact is learned,
> add it here. This is the durable memory of the project's concepts and its
> evolution — code/git history records *what* changed; this records *why* and
> *what must not be re-derived wrong*.

---

## What it is

Local, read-only **MySQL/MariaDB binlog inspector**. Scans a directory of
binlog files (detected by magic bytes, not filename), decodes them, builds a
**SQLite index**, and serves a React UI: Events / Transactions / Tables /
Overview-metrics / Anomalies / Schema views, with a Rows/Diff/Hex/JSON drawer.
Decode never blocks the UI — everything the UI reads comes from the index.

It is a **debugging tool**, not an archive: bounded history, single-user,
binds `127.0.0.1` by default, no auth.

## Architecture (packages)

- `internal/scanner` — discovers binlogs by magic bytes (`fe 62 69 6e`).
- `internal/adapter` — the `Decoder` interface + `Capabilities` + registry.
  Adapters: `gomysql` (go-mysql-org/go-mysql, the workhorse) and `mysqlbinlog`
  (exec wrapper, used as a cross-check oracle for Diff).
- `internal/indexer` — decodes a file → rows in the SQLite index. Full pass
  (`IndexFile`) and incremental tail (`IndexAppend`, Phase 1.5b).
- `internal/store` — SQLite schema + queries (files, events, txns, tables,
  anomalies, metrics).
- `internal/anomaly` — pluggable `Detector` + `Engine`, post-index pass over
  the index only (no decode).
- `internal/server` — HTTP API + SSE + scan/watch lifecycle; embeds the web
  `dist`.
- `internal/streamer` (Phase 2) — connects to a remote server as a replica
  (go-mysql `BinlogSyncer`) and mirrors binlogs byte-for-byte into a local
  spool the normal pipeline then consumes.
- `web/` — React + Vite + TypeScript UI. **Tooling is `bun`** (`bun install`,
  `bun run build`, `bun run dev`). `make ui` builds dist into
  `internal/server/dist` (gitignored except `index.html`). The UI is **Mantine
  v8** (`@mantine/core`); theme and JS tokens live in `web/src/theme.ts`. The
  only bespoke CSS is the virtualized events table, Drawer, and chart containers
  (`web/src/styles.css`); all other views use Mantine components.

Data flow: scan dir → per file `IndexFile`/`IndexAppend` → SQLite → anomaly
`detect` → SSE `index_done` → UI fetches from the index.

---

## Core concepts & invariants

### Committed boundary — `File.LastIndexedOffset`
The single most load-bearing concept. Defined as **the highest stream position
P such that every event below P is fully indexed and no transaction is open at
P** (Phase 1.5b). On a quiescent file P == file size, so the
`LastIndexedOffset == size` check short-circuits re-indexing. If a txn is open
at EOF (mid-flush read), P = the open txn's `StartPos`, so the whole txn
re-decodes next pass. Producers/consumers in indexer, server, and the streamer
all share this contract.

**This is a BYTE OFFSET.** It must equal a real position in the file. See the
4 GiB gotcha below — when positions come from the wire `end_log_pos` they can
be wrong, and then this invariant silently breaks.

### True-seek resume (Phase 1.5b)
`IndexAppend` resumes decoding from `LastIndexedOffset` without re-parsing the
prefix: prime the FORMAT_DESCRIPTION at offset 4, then seek + `ParseReader`.
Capability-gated by `Capabilities.ResumeDecode` (gomysql only).

### Adapters & capabilities
`FullScan` (eligible indexer), `SeekDecode` (AtPos detail lookup),
`ResumeDecode` (true-seek append), `RemoteStream` (replication), `RowImages`.
Roles (indexer/detail/diff/stream) are validated against capabilities.

### Anomaly engine
Detectors read ONLY the index (no decode). `Engine.DefaultEngine()` registers
them; add a detector by implementing `Detector` and registering it. Severity:
critical/high/medium/low. Thresholds live in `config.Config.Anomaly` and are
editable in Settings.

### Phase 2 remote streaming
Spool files are **byte-identical mirrors** of the server's binlogs. Resume is
GTID-set (baseline ∪ committed-txn gtids ≤ `LastIndexedOffset`) when
`gtid_mode=ON` (always for MariaDB), else file+pos — both txn-boundary-aligned,
never mid-txn. First connect snaps to the start of the server's current binlog
file so local byte offset == event position.

---

## ⚠ Binlog format gotchas (DO NOT re-derive these wrong)

### 1. uint32 `end_log_pos` wraps on files > 4 GiB — CONFIRMED, reproduced 2026-06-17

**The binlog event header's `end_log_pos` (and go-mysql's `Header.LogPos`) is a
4-byte unsigned int. It wraps at 4,294,967,296 (2³²).**

Normally binlog files stay under `max_binlog_size` (≤ 1 GiB), so this never
shows. BUT: **a single transaction is never split across binlog files** —
rotation is deferred until COMMIT. So **a transaction larger than 4 GiB forces
a single binlog file larger than 4 GiB**, and every event past the 4 GiB mark
has a wrapped (small) `end_log_pos`.

This means the earlier review claim "a binlog file can't exceed 4 GiB" is
**WRONG**. It can, via one big transaction.

**Upstream bug reports (found 2026-08-01 — this is a known, unfixed MySQL bug,
not a binsight-specific discovery):**
- [#55231](https://bugs.mysql.com/bug.php?id=55231) — "COM_BINLOG_DUMP needs to
  accept 64-bit positions else slaves can break". Filed **2010-07-13**,
  severity **S2**, still *In progress*. The canonical bug; MySQL's own source
  carries `/* TODO: The following has to be changed to an 8 byte integer */`.
- [#95074](https://bugs.mysql.com/bug.php?id=95074) — "binlog: end_log_pos is
  less than pos" (2019, 5.7.18). Closed as a **duplicate of #55231**.
- [#112189](https://bugs.mysql.com/bug.php?id=112189) — "Binlog::EventHeader
  position overflow", **Verified** against 8.0. Proposes an 8-byte position
  field. Same diagnosis as ours: rotation deferred until COMMIT → >4 GiB file →
  overflow.
- [gh-ost#1366](https://github.com/github/gh-ost/issues/1366) — real-world data
  loss (2024-01-11). gh-ost skips events whose `end_log_pos <= last` as a
  duplicate guard, so after the wrap (`4294962881` → `3601`) every subsequent
  event fails the guard and is dropped. **Closed as `completed` the same day
  WITHOUT a code change** — gh-ost deliberately declined, arguing they mimic a
  replica and MySQL replication is not designed for transactions beyond
  `max_allowed_packet`; they would rather make it a hard failure. The reporter
  countered that gh-ost's own chunking (4 MB rows × chunk 1000) produces such a
  transaction unavoidably. Do NOT cite this as "a tool that got it wrong" — it
  is a documented design decision and an unresolved disagreement.

**Reproduced** (BLACKHOLE table → ROW events to binlog with no InnoDB cost):
```sql
CREATE TABLE big (id INT PRIMARY KEY AUTO_INCREMENT, payload LONGBLOB) ENGINE=BLACKHOLE;
-- single transaction, 340 rows × 16 MB = ~5.3 GB, no intermediate COMMIT:
START TRANSACTION; -- (loop) INSERT INTO big(payload) VALUES (REPEAT('x',16*1024*1024)); COMMIT;
```
→ one binlog file of **5,704,288,226 bytes** in < 15 s.

**The exact math (memorize this):**
```
file size            = 5,704,288,226
2^32                 = 4,294,967,296
size mod 2^32        = 1,409,320,930   ← the WRAPPED value
```
`mysqlbinlog` itself shows the wrap: `end_log_pos` climbs to ~4,278,216,212
then resets to ~26,176, ending at 1,409,320,930.

**What the viewer does on such a file (observed):**
- Decode is **clean** — go-mysql parses all events, **0 errors**, correct
  event *lengths*/sizes/row data. `metrics.event_size.total` ≈ the real 5.7 GB
  (event LENGTH fields are fine; only the POSITION field wraps).
- BUT `LastIndexedOffset` is set to the wrapped last position (1,409,320,930),
  **not** the file size (5,704,288,226). So `LastIndexedOffset != size`
  **forever**.
- Consequence: every scan tick sees `size > LastIndexedOffset` → runs
  `IndexAppend` from the wrapped offset → seek lands mid-event → "tail
  truncated … need X got Y" → finalize-early at another wrapped value →
  **perpetual re-index**, never reaches steady state. For live tail / Phase 2
  this is an SSE storm. Positions past 4 GiB collide (AtPos detail / hex view
  unreliable).

**Why event sizes are fine but positions are not:** the per-event *length*
field is read from the event header's `event_size` (also 4 bytes, but
individual events are < 16 MB so never overflow). Summing lengths gives the
true file size. The `end_log_pos`/`LogPos` is a cumulative offset and it is the
thing that overflows.

**FIX (implemented 2026-06-17):** the gomysql adapter no longer trusts
`LogPos`. Both decode paths (main + `decodeResume`) now use a pure running
**byte-offset accumulator** — `pos = runPos; endPos = pos + size; runPos =
endPos` — starting at 4 (or `src.Offset` on resume), advancing by each event's
`EventSize`. This is the true file offset and is wrap-immune. Verified on the
5.7 GB repro: positions monotonic to 5,704,288,226, `LastIndexedOffset ==
size`, 0 backward jumps, no re-index churn, 686 events. `<4 GiB` files are
unchanged (accumulator == `LogPos-size` there; conformance goldens still pass).

**Detection (shipped):** the `pos_wrap` anomaly detector flags files ≥ 4 GiB
and transactions whose true byte size is ≥ 4 GiB. The Events view highlights
the single event that straddles each 4 GiB boundary
(`floor(pos/2³²) != floor((end_pos-1)/2³²)`) with an amber row + `↩` marker —
the spot where the on-disk uint32 `end_log_pos` wraps (now that stored
positions are the true accumulator values). NOTE: `end_pos ≤ start_pos` is NOT a reliable
signature — a big txn that *starts* early in the file wraps its `end_pos` to a
value still greater than its small `start_pos` (e.g. start 377, wrapped end
1.4 GB). The reliable signals are **file size ≥ 2³²** and **true-bytes vs
pos-span divergence ≈ a multiple of 2³²**.

**Corollary — `huge_txn_bytes` is unreliable on wrapped txns:** it computes
`end_pos − start_pos`, which *under-reports* a > 4 GiB txn by a multiple of
2³² (it reported ~1.4 GB for a real 5.7 GB txn). Use summed event bytes for a
true measure.

### 2. MariaDB needs `FillZeroLogPos` for ANNOTATE_ROWS
go-mysql omits `ANNOTATE_ROWS_EVENT` from the replication dump stream unless
`BinlogSyncerConfig.FillZeroLogPos=true` — yet the server's on-disk `LogPos`
accounts for those bytes, so without the flag the spool develops a gap and the
streamer crash-loops. Set it **for the mariadb flavor only** (keeps the
verified MySQL byte path unchanged).

### 3. Anonymous transactions store the literal `"ANONYMOUS"`
Not an empty string. The indexer writes `"ANONYMOUS"` for ANONYMOUS_GTID
events; resume-GTID queries must exclude `('', 'ANONYMOUS')`.

### 4. `LOG_EVENT_BINLOG_IN_USE_F` flag on the active file
The currently-open binlog's FORMAT_DESCRIPTION has the IN_USE flag set on disk
(byte 21, value `0x01`); the replication stream delivers it cleared, and it is
cleared on rotation. A replica copy of the *active* file therefore differs from
the server file in exactly this one flag — `FLUSH LOGS` first when byte-comparing.

### 5. gomysql `ParseFile` must start at offset 4
The FORMAT_DESCRIPTION at offset 4 carries the checksum algorithm; the resume
path primes it then seeks (`adapter.BinlogHeaderEnd`).

### 6. TIMESTAMP columns render in `time.Local` unless the parser is pinned
A TIMESTAMP column is a **UTC epoch** on disk. go-mysql decodes it via
`time.Unix(...)` and `fracTime.String()` only re-locates when the parser's
`timestampStringLocation` is non-nil — which defaults to nil. So without an
explicit setting, **decoded row output depends on the host's `TZ`**: the same
fixture renders `12:34:56` on a UTC box and `18:04:56` on an IST box. DATETIME
is unaffected (no zone conversion), which makes the bug easy to miss — the two
columns sit side by side and only one moves.

Every parser that decodes rows therefore calls
`p.SetTimestampStringLocation(time.UTC)` (both paths in the gomysql adapter),
and the streamer's `BinlogSyncerConfig` sets `TimestampStringLocation: time.UTC`.
This also keeps go-mysql in agreement with the mysqlbinlog adapter, which is
already spawned with `TZ=UTC`; before the fix the Diff cross-adapter oracle
would disagree on TIMESTAMP columns for any non-UTC host.

Caught 2026-08-01 by CI: the L3 goldens had been recorded on an IST box and
passed only there. Regression test:
`gomysql.TestRowDecodeIsHostTimezoneIndependent` decodes one fixture under two
`time.Local` values and asserts identical output. **Goldens must be regenerated
under any TZ only after this pinning holds** — otherwise they re-bake the host
zone.

---

## Repo facts / gotchas

- `corpus/` at repo root is a scratch dir for real-world binlogs under test. It
  is gitignored — never commit private or production binlog data.
- Conformance corpus fixtures live under `internal/testdata/corpus/<version>/`
  (e.g. `8.0/mysql-8.0.binlog`, `maria-11.4/mysql-maria-11.4.binlog`).
- `internal/server/dist` is a gitignored build artifact (`make ui` regenerates;
  only `index.html` is tracked). A bare `go build` without a prior `make ui`
  embeds a stale/empty UI → blank page.
- Planning docs (specs + plans) live ONLY in a SEPARATE repo:
  `~/Projects/my-projects/projects/binsight/` (`ROADMAP.md` =
  sequencing). They are NOT committed to this code repo — `docs/superpowers/`
  was removed 2026-06-19; do not re-add plan/spec docs here.

## Dev workflow

- **Web tooling: `bun`.** `make dev DIR=/path/to/binlogs` runs the Go API
  (:8080) + Vite hot-reload UI (:5173, proxies `/api`). `make ui` builds dist.
  `make run` builds + serves. `make fmt` = gofmt + prettier (via bun).
- Set `BV_DATA_DIR` to a writable path when running ad-hoc (default
  `/var/lib/binlog-viewer` is not writable on a dev box).
- Tests: `go test -race ./...`; web `bun run test`. Pre-commit hook runs gofmt +
  prettier; install once with `make hooks`.
- Workflow norms: brainstorm → spec → plan → subagent-driven dev (two-stage
  review per task); squash-merge with `(#N)` titles; merge only on explicit
  instruction.

## Evolution log

- **Phase 1** — viewer core (dir scan + SQLite index, adapters, views, drawer).
- **Anomaly detection** — pluggable detectors + Anomalies UI.
- **Overview metrics** — per-file dashboard computed from the index.
- **Version testing** — Docker version matrix (MySQL 5.5–8.4 + MariaDB
  10.6/11.4), 3-layer conformance oracle.
- **DDL → schema parsing** + cascade-risk detector.
- **Phase 1.5 — live tail** (fsnotify watcher + SSE follow).
- **Phase 1.5b — incremental append-index** (true-seek resume from the
  committed boundary).
- **Phase 2 — remote streaming** (replica spool mirror; PR #17).
- **2026-06-17** — confirmed the uint32 `end_log_pos` wrap on > 4 GiB
  single-transaction files (see gotcha #1); added the `pos_wrap` anomaly
  detector; migrated web tooling to `bun`.
