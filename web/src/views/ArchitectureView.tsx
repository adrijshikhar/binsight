import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardPanel } from '@/components/ui/card'
import { Close } from '../components/icons'
import { IconChevronDown } from '@tabler/icons-react'

// In-app rendering of the pluggable-decoder architecture diagram, so anyone
// opening the tool can understand how it fits together. Mirrors
// docs/pluggable-architecture.html.

interface LayerProps {
  label: string
  children: ReactNode
}

function Layer({ label, children }: LayerProps) {
  return (
    <section className="space-y-2">
      <h4>{label}</h4>
      {children}
    </section>
  )
}

function Arrow({ note }: { note: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5">
      <IconChevronDown size={14} aria-hidden="true" />
      <code>{note}</code>
    </div>
  )
}

function Box({ children }: { children: ReactNode }) {
  return (
    <Card className="min-w-36 flex-1">
      <CardPanel>{children}</CardPanel>
    </Card>
  )
}

/** Plain-English meaning of each capability + the role/feature it unlocks.
 *  This is the canonical "what is what" the Settings page links to. */
const CAP_GLOSSARY: { cap: string; what: string; unlocks: string }[] = [
  {
    cap: 'FullScan',
    what: 'Decode an entire binlog file start-to-finish in one pass.',
    unlocks: 'indexer role - building the SQLite index',
  },
  {
    cap: 'SeekDecode',
    what: 'Decode a single event at a given byte offset, without reading the whole file first.',
    unlocks: 'detail role - the drawer & jump-to-position',
  },
  {
    cap: 'ResumeDecode',
    what: 'Resume decoding from the last committed offset via a true seek, instead of re-parsing the prefix.',
    unlocks: 'incremental append-index - the live tail',
  },
  {
    cap: 'RemoteStream',
    what: 'Connect to a live MySQL/MariaDB server as a replica and stream its binlog events.',
    unlocks: 'remote streaming',
  },
  {
    cap: 'RowImages',
    what: 'Decode the actual before/after column values carried inside row events.',
    unlocks: 'Rows & Diff views',
  },
]

function CapGlossary() {
  return (
    <div className="flex flex-col gap-2.5" id="capabilities">
      <div>What each capability means</div>
      {CAP_GLOSSARY.map(({ cap, what, unlocks }) => (
        <div key={cap} className="flex items-start gap-2 flex-nowrap">
          <Badge variant="secondary" size="sm" className="min-w-28 shrink-0">
            {cap}
          </Badge>
          <div>
            {what} <span>→ unlocks {unlocks}.</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function CapBadges({ caps }: { caps: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {caps.map((cap) => (
        <Badge key={cap} variant="secondary" size="sm">
          {cap}
        </Badge>
      ))}
    </div>
  )
}

export function ArchitectureContent({ onClose }: { onClose?: () => void } = {}) {
  return (
    <div className="flex flex-col p-0 max-w-[1100px] gap-2 mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-0.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <code>binsight</code>
            <h3>- Pluggable Decoder Architecture</h3>
          </div>
          <p>Go core · no privileged library · adapters behind one interface · roles assigned by config</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close architecture view">
            <Close aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Event Sources */}
      <Layer label="Event Sources">
        <div className="flex items-stretch gap-2 flex-wrap">
          <Box>
            <div className="mb-1">Directory watch</div>
            <div>
              Scan dir / <code>binlog.index</code> · magic-byte check · fsnotify tail of growing file (live mode A)
            </div>
          </Box>
          <Box>
            <div className="flex items-center gap-1.5 mb-1">
              <span>Remote stream</span>
              <Badge size="sm" variant="secondary">
                shipped
              </Badge>
            </div>
            <div>
              Direct TCP connection to source MySQL/MariaDB server using replication protocol (live mode B). Spools to
              temp binlog file, indexer processes identical code path. Exposes local port, browser interacts with stream
              as a normal file. GTID-set resume (else file+pos), always txn-boundary aligned; cap + prune retention.
            </div>
          </Box>
        </div>
      </Layer>

      <Arrow note="file path + offset" />

      {/* Interface */}
      <Layer label="The Only Contract Core Knows">
        <div className="flex items-stretch gap-2 flex-wrap">
          <Box>
            <pre className="overflow-x-auto whitespace-pre">{`type Decoder interface {
    Name() string
    Capabilities() Capabilities
    Decode(ctx, src Source, opts DecodeOpts) (EventStream, error)
}`}</pre>
          </Box>
          <Box>
            <pre className="overflow-x-auto whitespace-pre">{`type Capabilities struct {
    FullScan     bool // eligible: indexer
    SeekDecode   bool // eligible: detail view
    ResumeDecode bool // eligible: incremental append-index (true seek)
    RemoteStream bool // eligible: remote streaming
    RowImages    bool // decodes row values
}`}</pre>
          </Box>
        </div>
        <div className="p-3 border mt-2">
          <CapGlossary />
        </div>
      </Layer>

      <Arrow note="implemented by" />

      {/* Adapters */}
      <Layer label="Adapters (2 shipped · 1 planned)">
        <div className="flex flex-col gap-2">
          <div className="flex items-stretch gap-2 flex-wrap">
            <Box>
              <div className="flex items-center gap-1.5 mb-1">
                <span>go-mysql</span>
                <Badge size="sm" variant="secondary">
                  builtin · in-process
                </Badge>
              </div>
              <div>Default indexer + detail + stream. Compiled in, but holds no special status - just adapter #1.</div>
              <CapBadges caps={['FullScan', 'SeekDecode', 'ResumeDecode', 'RemoteStream', 'RowImages']} />
            </Box>
            <Box>
              <div className="flex items-center gap-1.5 mb-1">
                <span>mysqlbinlog</span>
                <Badge size="sm" variant="warning">
                  exec · subprocess
                </Badge>
              </div>
              <div>
                Wraps the official CLI, parses its text → JSON-lines. Output marked{' '}
                <code>decode_confidence: partial</code> where text is lossy.
              </div>
              <CapBadges caps={['FullScan', 'RowImages']} />
            </Box>
            <Box>
              <div className="flex items-center gap-1.5 mb-1">
                <span>connector-java</span>
                <Badge size="sm" variant="warning">
                  exec · subprocess
                </Badge>
                <Badge size="sm" variant="secondary">
                  planned
                </Badge>
              </div>
              <div>
                Planned: ~200-line CLI wrapping mysql-binlog-connector-java (Debezium family) → JSON-lines. Drop-in:
                register in config, zero core changes. Not yet implemented.
              </div>
              <CapBadges caps={['FullScan', 'SeekDecode', 'RowImages']} />
            </Box>
          </div>

          <div className="flex items-stretch gap-2 flex-wrap">
            {/* roles */}
            <div className="flex-1">
              <div className="mb-1.5">roles, not hardcode (configured in Settings)</div>
              <pre className="overflow-x-auto whitespace-pre">{`adapters:
  go-mysql:       { type: builtin }
  mysqlbinlog:    { type: exec }
  connector-java: { type: exec }   # planned

roles:
  indexer: go-mysql                # swap → re-index prompted
  detail:  go-mysql
  diff:    [go-mysql, mysqlbinlog] # N-way compare set
  stream:  go-mysql                # shipped`}</pre>
            </div>

            {/* normalized event schema */}
            <div className="flex-1">
              <div className="mb-1.5">normalized event schema v1 - the real coupling point</div>
              <div className="flex items-stretch gap-1.5 flex-wrap mt-1">
                <Box>
                  <div className="mb-1">header</div>
                  <div>
                    19-byte common header. Mandatory. Byte-identical across correct adapters - disagreement = broken
                    adapter.
                  </div>
                </Box>
                <Box>
                  <div className="mb-1">decoded</div>
                  <div>Best-effort canonical decode: tables, row values, SQL. Adapters fill what they can.</div>
                </Box>
                <Box>
                  <div className="mb-1">native</div>
                  <div>
                    Adapter-specific rendering, opaque. Preserved verbatim - this is what the diff view compares.
                  </div>
                </Box>
              </div>
            </div>
          </div>
        </div>
      </Layer>

      <Arrow note="JSON-lines (exec) / structs (builtin) - same schema" />

      {/* Core */}
      <Layer label="Core (Go binary)">
        <div className="flex items-stretch gap-2 flex-wrap">
          <Box>
            <div className="mb-1">Indexer</div>
            <div>
              Streams events from the <code>indexer</code>-role adapter. Metadata only - no row values. On growth it{' '}
              <strong>true-seeks from the committed boundary</strong> (<code>last_indexed_offset</code>) and appends
              only the new tail. Positions come from a running byte accumulator, so &gt; 4 GiB files (uint32{' '}
              <code>end_log_pos</code> wrap) index correctly.
            </div>
          </Box>
          <Box>
            <div className="mb-1">SQLite index</div>
            <div>
              <code>files · events · txns · tables · anomalies · decode_errors</code>
              <br />
              Metadata only. Records which adapter built it. A post-index anomaly engine flags oversized/long txns and
              the 4 GiB position wrap.
            </div>
          </Box>
          <Box>
            <div className="mb-1">Diff engine</div>
            <div>
              Lazy, per-event, at click time: runs all <code>diff</code>-role adapters at one offset, aligns by schema
              layer, flags disagreements.
            </div>
          </Box>
          <Box>
            <div className="mb-1">Hex service</div>
            <div>
              Adapter-independent. Raw bytes read straight from the file via offset, header fields annotated + CRC32
              checked.
            </div>
          </Box>
        </div>
      </Layer>

      <Arrow note="REST/JSON + SSE" />

      {/* Web UI */}
      <Layer label="Web UI (React + TS · go:embed · localhost)">
        <div className="flex items-stretch gap-2 flex-wrap">
          <Box>
            <div className="mb-1">Event list</div>
            <div>
              Cursor-paginated on <code>pos</code>; filters compose: type / db / table / txn / position. Txn-grouped.
            </div>
          </Box>
          <Box>
            <div className="mb-1">Detail drawer</div>
            <div>Type-aware: row before/after, TABLE_MAP mapping, GTID/XID, diff, hex, raw JSON.</div>
          </Box>
          <Box>
            <div className="mb-1">Transactions</div>
            <div>GTID → BEGIN → rows → Xid grouped; rows in/up/del, duration, incomplete flagged.</div>
          </Box>
          <Box>
            <div className="mb-1">Tables</div>
            <div>Per-table column types, op counts, row counts, byte share.</div>
          </Box>
        </div>
      </Layer>
    </div>
  )
}

export default function ArchitectureView({ onClose }: { onClose?: () => void } = {}) {
  return <ArchitectureContent onClose={onClose} />
}
