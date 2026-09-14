import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Close } from '../components/icons'
import { IconChevronDown } from '@tabler/icons-react'
import styles from './ArchitectureView.module.css'

// In-app rendering of the pluggable-decoder architecture diagram, so anyone
// opening the tool can understand how it fits together. Mirrors
// docs/pluggable-architecture.html.

interface LayerProps {
  label: string
  children: ReactNode
  variant?: 'iface'
}

function Layer({ label, children, variant }: LayerProps) {
  const isIface = variant === 'iface'
  return (
    <div
      className={`p-2.5 rounded-md border ${isIface ? styles.layerPaperIface : styles.layerPaper}`}
    >
      <div className={`text-xs uppercase font-semibold tracking-wider mb-1.5 ${isIface ? 'text-primary' : 'text-muted-foreground'}`}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Arrow({ note }: { note: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5 text-muted-foreground">
      <IconChevronDown size={14} aria-hidden="true" />
      <code className={styles.arrowCode}>
        {note}
      </code>
    </div>
  )
}

interface BoxProps {
  children: ReactNode
  borderColor?: string
  dashed?: boolean
  dimmed?: boolean
}

function Box({ children, borderColor, dashed, dimmed }: BoxProps) {
  const boxCls = [
    styles.cardBox,
    dashed && styles.cardBoxDashed,
    dimmed && styles.cardBoxDimmed,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`p-2.5 rounded-md border ${boxCls}`}
      style={borderColor ? { borderColor } : undefined}
    >
      {children}
    </div>
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
      <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
        What each capability means
      </div>
      {CAP_GLOSSARY.map(({ cap, what, unlocks }) => (
        <div key={cap} className="flex items-start gap-2 flex-nowrap">
          <Badge
            variant="secondary"
            size="sm"
            className={styles.capBadge}
          >
            {cap}
          </Badge>
          <div className="text-sm leading-normal">
            {what}{' '}
            <span className="text-sm text-muted-foreground">
              → unlocks {unlocks}.
            </span>
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
        <Badge
          key={cap}
          variant="secondary"
          size="xs"
          className="font-mono"
        >
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
            <code className={styles.brandCode}>
              binsight
            </code>
            <h3 className={styles.brandTitle}>
              - Pluggable Decoder Architecture
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Go core · no privileged library · adapters behind one interface · roles assigned by config
          </p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close architecture view"
          >
            <Close aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Event Sources */}
      <Layer label="Event Sources">
        <div className="flex items-stretch gap-2 flex-wrap">
          <Box>
            <div className="text-sm font-semibold font-mono mb-1">
              Directory watch
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              Scan dir / <code className="font-mono text-xs">binlog.index</code> · magic-byte check · fsnotify tail of growing file (live mode A)
            </div>
          </Box>
          <Box>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm font-semibold font-mono">
                Remote stream
              </span>
              <Badge size="xs" variant="secondary">
                shipped
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              Direct TCP connection to source MySQL/MariaDB server using replication protocol (live mode B). Spools to
              temp binlog file, indexer processes identical code path. Exposes local port, browser interacts with stream
              as a normal file. GTID-set resume (else file+pos), always txn-boundary aligned; cap + prune retention.
            </div>
          </Box>
        </div>
      </Layer>

      <Arrow note="file path + offset" />

      {/* Interface */}
      <Layer label="The Only Contract Core Knows" variant="iface">
        <div className="flex items-stretch gap-2 flex-wrap">
          <Box>
            <pre className={styles.codeBlock}>{`type Decoder interface {
    Name() string
    Capabilities() Capabilities
    Decode(ctx, src Source, opts DecodeOpts) (EventStream, error)
}`}</pre>
          </Box>
          <Box>
            <pre className={styles.codeBlock}>{`type Capabilities struct {
    FullScan     bool // eligible: indexer
    SeekDecode   bool // eligible: detail view
    ResumeDecode bool // eligible: incremental append-index (true seek)
    RemoteStream bool // eligible: remote streaming
    RowImages    bool // decodes row values
}`}</pre>
          </Box>
        </div>
        <div className={`p-3 rounded-md border mt-2 ${styles.capGlossaryPaper}`}>
          <CapGlossary />
        </div>
      </Layer>

      <Arrow note="implemented by" />

      {/* Adapters */}
      <Layer label="Adapters (2 shipped · 1 planned)">
        <div className="flex flex-col gap-2">
          <div className="flex items-stretch gap-2 flex-wrap">
            <Box borderColor="var(--primary)">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-semibold font-mono">
                  go-mysql
                </span>
                <Badge size="xs" variant="secondary">
                  builtin · in-process
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground leading-normal">
                Default indexer + detail + stream. Compiled in, but holds no special status - just adapter #1.
              </div>
              <CapBadges caps={['FullScan', 'SeekDecode', 'ResumeDecode', 'RemoteStream', 'RowImages']} />
            </Box>
            <Box borderColor="var(--data-update)">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-semibold font-mono">
                  mysqlbinlog
                </span>
                <Badge size="xs" variant="warning">
                  exec · subprocess
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground leading-normal">
                Wraps the official CLI, parses its text → JSON-lines. Output marked{' '}
                <code className="font-mono text-xs">decode_confidence: partial</code> where text is lossy.
              </div>
              <CapBadges caps={['FullScan', 'RowImages']} />
            </Box>
            <Box borderColor="var(--data-update)" dashed dimmed>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-semibold font-mono">
                  connector-java
                </span>
                <Badge size="xs" variant="warning">
                  exec · subprocess
                </Badge>
                <Badge size="xs" variant="secondary">
                  planned
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground leading-normal">
                Planned: ~200-line CLI wrapping mysql-binlog-connector-java (Debezium family) → JSON-lines. Drop-in:
                register in config, zero core changes. Not yet implemented.
              </div>
              <CapBadges caps={['FullScan', 'SeekDecode', 'RowImages']} />
            </Box>
          </div>

          <div className="flex items-stretch gap-2 flex-wrap">
            {/* roles */}
            <div className={`p-3 rounded-md border ${styles.rolesCard}`}>
              <div className="text-sm font-semibold font-mono text-purple-400 mb-1.5">
                roles, not hardcode (configured in Settings)
              </div>
              <pre className={styles.codeBlockSm}>{`adapters:
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
            <div className={`p-3 rounded-md border ${styles.schemaCard}`}>
              <div className="text-sm font-semibold font-mono text-primary mb-1.5">
                normalized event schema v1 - the real coupling point
              </div>
              <div className={`flex items-stretch gap-1.5 flex-wrap ${styles.schemaGroup}`}>
                <Box borderColor="var(--primary)">
                  <div className="text-sm font-semibold font-mono mb-1">
                    header
                  </div>
                  <div className="text-sm text-muted-foreground leading-normal">
                    19-byte common header. Mandatory. Byte-identical across correct adapters - disagreement = broken
                    adapter.
                  </div>
                </Box>
                <Box borderColor="var(--data-update)">
                  <div className="text-sm font-semibold font-mono mb-1">
                    decoded
                  </div>
                  <div className="text-sm text-muted-foreground leading-normal">
                    Best-effort canonical decode: tables, row values, SQL. Adapters fill what they can.
                  </div>
                </Box>
                <Box borderColor="var(--data-query)">
                  <div className="text-sm font-semibold font-mono mb-1">
                    native
                  </div>
                  <div className="text-sm text-muted-foreground leading-normal">
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
            <div className="text-sm font-semibold font-mono mb-1">
              Indexer
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              Streams events from the <code className="font-mono text-xs">indexer</code>-role adapter. Metadata only - no row values. On growth it{' '}
              <strong>true-seeks from the committed boundary</strong> (<code className="font-mono text-xs">last_indexed_offset</code>) and appends
              only the new tail. Positions come from a running byte accumulator, so &gt; 4 GiB files (uint32{' '}
              <code className="font-mono text-xs">end_log_pos</code> wrap) index correctly.
            </div>
          </Box>
          <Box>
            <div className="text-sm font-semibold font-mono mb-1">
              SQLite index
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              <code className="font-mono text-xs">files · events · txns · tables · anomalies · decode_errors</code>
              <br />
              Metadata only. Records which adapter built it. A post-index anomaly engine flags oversized/long txns and
              the 4 GiB position wrap.
            </div>
          </Box>
          <Box>
            <div className="text-sm font-semibold font-mono mb-1">
              Diff engine
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              Lazy, per-event, at click time: runs all <code className="font-mono text-xs">diff</code>-role adapters at one offset, aligns by schema
              layer, flags disagreements.
            </div>
          </Box>
          <Box>
            <div className="text-sm font-semibold font-mono mb-1">
              Hex service
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
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
            <div className="text-sm font-semibold font-mono mb-1">
              Event list
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              Cursor-paginated on <code className="font-mono text-xs">pos</code>; filters compose: type / db / table / txn / position. Txn-grouped.
            </div>
          </Box>
          <Box>
            <div className="text-sm font-semibold font-mono mb-1">
              Detail drawer
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              Type-aware: row before/after, TABLE_MAP mapping, GTID/XID, diff, hex, raw JSON.
            </div>
          </Box>
          <Box>
            <div className="text-sm font-semibold font-mono mb-1">
              Transactions
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              GTID → BEGIN → rows → Xid grouped; rows in/up/del, duration, incomplete flagged.
            </div>
          </Box>
          <Box>
            <div className="text-sm font-semibold font-mono mb-1">
              Tables
            </div>
            <div className="text-sm text-muted-foreground leading-normal">
              Per-table column types, op counts, row counts, byte share.
            </div>
          </Box>
        </div>
      </Layer>

      {/* Legend */}
      <div className={`p-2.5 rounded-md border ${styles.legendCard}`}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-xs" style={{ backgroundColor: 'var(--brand)' }} />
            <span className="text-xs text-muted-foreground">
              builtin adapter (in-process)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-xs" style={{ backgroundColor: 'var(--orange)' }} />
            <span className="text-xs text-muted-foreground">
              exec adapter (subprocess, JSON-lines)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-xs" style={{ backgroundColor: 'var(--grape)' }} />
            <span className="text-xs text-muted-foreground">
              planned
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-xs" style={{ backgroundColor: 'var(--brand)' }} />
            <span className="text-xs text-muted-foreground">
              interface / schema contract
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ArchitectureView({ onClose }: { onClose: () => void }) {
  return <ArchitectureContent onClose={onClose} />
}
