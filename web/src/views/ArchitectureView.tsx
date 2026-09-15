import { useEffect, type ReactNode } from 'react'
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
  className?: string
}

function Layer({ label, children, className }: LayerProps) {
  return (
    <section className={`architecture-layer ${className ?? ''}`}>
      <h4 className="architecture-layer-label">{label}</h4>
      {children}
    </section>
  )
}

function Arrow({ note }: { note: string }) {
  return (
    <div className="architecture-arrow">
      <IconChevronDown size={14} aria-hidden="true" />
      <code>{note}</code>
    </div>
  )
}

function Box({ children }: { children: ReactNode }) {
  return (
    <Card className="architecture-box">
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
    <div className="architecture-glossary" id="capabilities">
      <div className="architecture-box-title">What each capability means</div>
      {CAP_GLOSSARY.map(({ cap, what, unlocks }) => (
        <div key={cap} className="architecture-glossary-row">
          <Badge variant="secondary" size="sm" className="architecture-glossary-badge">
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
    <div className="architecture-badges">
      {caps.map((cap) => (
        <Badge key={cap} variant="secondary" size="sm">
          {cap}
        </Badge>
      ))}
    </div>
  )
}

export function ArchitectureContent({ onClose }: { onClose?: () => void } = {}) {
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-slot="scroll-area-viewport"]').forEach((viewport) => {
      if (viewport.closest('[data-slot="dialog-popup"]')) viewport.scrollTop = 0
    })
  }, [])

  return (
    <div className="architecture-content">
      {/* Header */}
      <div className="architecture-header">
        <div>
          <div className="architecture-title">
            <code>binsight</code>
            <h3>- Pluggable Decoder Architecture</h3>
          </div>
          <p className="architecture-subtitle">Go core · no privileged library · adapters behind one interface · roles assigned by config</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close architecture view">
            <Close aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Event Sources */}
      <Layer label="Event Sources">
        <div className="architecture-row">
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
      <Layer label="The Only Contract Core Knows" className="architecture-interface">
        <div className="architecture-cols">
          <Box>
            <pre className="architecture-pre">{`type Decoder interface {
    Name() string
    Capabilities() Capabilities
    Decode(ctx, src Source, opts DecodeOpts) (EventStream, error)
}`}</pre>
          </Box>
          <Box>
            <pre className="architecture-pre">{`type Capabilities struct {
    FullScan     bool // eligible: indexer
    SeekDecode   bool // eligible: detail view
    ResumeDecode bool // eligible: incremental append-index (true seek)
    RemoteStream bool // eligible: remote streaming
    RowImages    bool // decodes row values
}`}</pre>
          </Box>
        </div>
        <div className="architecture-glossary-panel">
          <CapGlossary />
        </div>
      </Layer>

      <Arrow note="implemented by" />

      {/* Adapters */}
      <Layer label="Adapters (2 shipped · 1 planned)">
        <div className="flex flex-col gap-2">
          <div className="architecture-row">
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

          <div className="architecture-cols">
            {/* roles */}
            <div className="architecture-roles">
              <div className="mb-1.5">roles, not hardcode (configured in Settings)</div>
              <pre className="architecture-pre">{`adapters:
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
            <div className="architecture-roles architecture-schema">
              <div className="mb-1.5">normalized event schema v1 - the real coupling point</div>
              <div className="architecture-schema-layers">
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
        <div className="architecture-row">
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
        <div className="architecture-row">
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
