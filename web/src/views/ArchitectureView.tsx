import type { ReactNode } from 'react'
import { ActionIcon, Badge, Card, Code, ColorSwatch, Group, Paper, Stack, Text, Title } from '@mantine/core'
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
    <Card
      withBorder
      p="xs"
      radius="sm"
      className={isIface ? styles.layerPaperIface : styles.layerPaper}
    >
      <Text size="xs" tt="uppercase" fw={600} lts={1} mb={6} c={isIface ? 'accent' : 'dimmed'}>
        {label}
      </Text>
      {children}
    </Card>
  )
}

function Arrow({ note }: { note: string }) {
  return (
    <Group justify="center" gap={6} py={1} c="dimmed">
      <IconChevronDown size={14} aria-hidden="true" />
      <Code className={styles.arrowCode}>
        {note}
      </Code>
    </Group>
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
    <Card
      withBorder
      radius="sm"
      p="xs"
      className={boxCls}
      style={borderColor ? { borderColor } : undefined}
    >
      {children}
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
    <Stack gap={10} id="capabilities">
      <Text size="xs" tt="uppercase" fw={600} lts={1.5} c="dimmed">
        What each capability means
      </Text>
      {CAP_GLOSSARY.map(({ cap, what, unlocks }) => (
        <Group key={cap} gap="sm" align="flex-start" wrap="nowrap">
          <Badge
            color="accent"
            size="sm"
            variant="light"
            className={styles.capBadge}
          >
            {cap}
          </Badge>
          <Text size="sm" lh={1.5}>
            {what}{' '}
            <Text span size="sm" c="dimmed">
              → unlocks {unlocks}.
            </Text>
          </Text>
        </Group>
      ))}
    </Stack>
  )
}

function CapBadges({ caps }: { caps: string[] }) {
  return (
    <Group gap={4} mt={6}>
      {caps.map((cap) => (
        <Badge
          key={cap}
          color="accent"
          size="xs"
          variant="light"
          className="font-mono"
        >
          {cap}
        </Badge>
      ))}
    </Group>
  )
}

export function ArchitectureContent({ onClose }: { onClose?: () => void } = {}) {
  return (
    <Stack p={0} maw={1100} gap="xs" mx="auto">
      {/* Header */}
      <Group justify="space-between" align="flex-start" mb={2}>
        <Stack gap={2}>
          <Group gap="xs" align="center">
            <Code className={styles.brandCode}>
              binsight
            </Code>
            <Title order={3} className={styles.brandTitle}>
              - Pluggable Decoder Architecture
            </Title>
          </Group>
          <Text size="xs" c="dimmed">
            Go core · no privileged library · adapters behind one interface · roles assigned by config
          </Text>
        </Stack>
        {onClose && (
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close architecture view">
            <Close aria-hidden="true" />
          </ActionIcon>
        )}
      </Group>

      {/* Event Sources */}
      <Layer label="Event Sources">
        <Group gap="sm" align="stretch" className="flex-wrap">
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Directory watch
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              Scan dir / <Code>binlog.index</Code> · magic-byte check · fsnotify tail of growing file (live mode A)
            </Text>
          </Box>
          <Box>
            <Group gap={6} mb={4}>
              <Text size="sm" fw={600} ff="monospace">
                Remote stream
              </Text>
              <Badge size="xs" color="accent" variant="light">
                shipped
              </Badge>
            </Group>
            <Text size="sm" c="dimmed" lh={1.5}>
              Direct TCP connection to source MySQL/MariaDB server using replication protocol (live mode B). Spools to
              temp binlog file, indexer processes identical code path. Exposes local port, browser interacts with stream
              as a normal file. GTID-set resume (else file+pos), always txn-boundary aligned; cap + prune retention.
            </Text>
          </Box>
        </Group>
      </Layer>

      <Arrow note="file path + offset" />

      {/* Interface */}
      <Layer label="The Only Contract Core Knows" variant="iface">
        <Group gap="sm" align="stretch" className="flex-wrap">
          <Box>
            <Code
              block
              className={styles.codeBlock}
            >{`type Decoder interface {
    Name() string
    Capabilities() Capabilities
    Decode(ctx, src Source, opts DecodeOpts) (EventStream, error)
}`}</Code>
          </Box>
          <Box>
            <Code
              block
              className={styles.codeBlock}
            >{`type Capabilities struct {
    FullScan     bool // eligible: indexer
    SeekDecode   bool // eligible: detail view
    ResumeDecode bool // eligible: incremental append-index (true seek)
    RemoteStream bool // eligible: remote streaming
    RowImages    bool // decodes row values
}`}</Code>
          </Box>
        </Group>
        <Paper withBorder p="sm" radius="sm" mt="sm" className={styles.capGlossaryPaper}>
          <CapGlossary />
        </Paper>
      </Layer>

      <Arrow note="implemented by" />

      {/* Adapters */}
      <Layer label="Adapters (2 shipped · 1 planned)">
        <Stack gap="sm">
          <Group gap="sm" align="stretch" className="flex-wrap">
            <Box borderColor="var(--mantine-color-accent-6)">
              <Group gap={6} mb={4}>
                <Text size="sm" fw={600} ff="monospace">
                  go-mysql
                </Text>
                <Badge size="xs" color="accent" variant="light">
                  builtin · in-process
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" lh={1.5}>
                Default indexer + detail + stream. Compiled in, but holds no special status - just adapter #1.
              </Text>
              <CapBadges caps={['FullScan', 'SeekDecode', 'ResumeDecode', 'RemoteStream', 'RowImages']} />
            </Box>
            <Box borderColor="var(--mantine-color-orange-6)">
              <Group gap={6} mb={4}>
                <Text size="sm" fw={600} ff="monospace">
                  mysqlbinlog
                </Text>
                <Badge size="xs" color="orange" variant="light">
                  exec · subprocess
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" lh={1.5}>
                Wraps the official CLI, parses its text → JSON-lines. Output marked{' '}
                <Code>decode_confidence: partial</Code> where text is lossy.
              </Text>
              <CapBadges caps={['FullScan', 'RowImages']} />
            </Box>
            <Box borderColor="var(--mantine-color-orange-6)" dashed dimmed>
              <Group gap={6} mb={4}>
                <Text size="sm" fw={600} ff="monospace">
                  connector-java
                </Text>
                <Badge size="xs" color="orange" variant="light">
                  exec · subprocess
                </Badge>
                <Badge size="xs" color="gray" variant="light">
                  planned
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" lh={1.5}>
                Planned: ~200-line CLI wrapping mysql-binlog-connector-java (Debezium family) → JSON-lines. Drop-in:
                register in config, zero core changes. Not yet implemented.
              </Text>
              <CapBadges caps={['FullScan', 'SeekDecode', 'RowImages']} />
            </Box>
          </Group>

          <Group gap="sm" align="stretch" className="flex-wrap">
            {/* roles */}
            <Card
              withBorder
              radius="sm"
              p="sm"
              className={styles.rolesCard}
            >
              <Text size="sm" fw={600} ff="monospace" c="grape" mb={6}>
                roles, not hardcode (configured in Settings)
              </Text>
              <Code
                block
                className={styles.codeBlockSm}
              >{`adapters:
  go-mysql:       { type: builtin }
  mysqlbinlog:    { type: exec }
  connector-java: { type: exec }   # planned

roles:
  indexer: go-mysql                # swap → re-index prompted
  detail:  go-mysql
  diff:    [go-mysql, mysqlbinlog] # N-way compare set
  stream:  go-mysql                # shipped`}</Code>
            </Card>

            {/* normalized event schema */}
            <Card
              withBorder
              radius="sm"
              p="sm"
              className={styles.schemaCard}
            >
              <Text size="sm" fw={600} ff="monospace" c="accent" mb={6}>
                normalized event schema v1 - the real coupling point
              </Text>
              <Group gap="xs" align="stretch" className={`flex-wrap ${styles.schemaGroup}`}>
                <Box borderColor="var(--mantine-color-accent-6)">
                  <Text size="sm" fw={600} ff="monospace" mb={4}>
                    header
                  </Text>
                  <Text size="sm" c="dimmed" lh={1.5}>
                    19-byte common header. Mandatory. Byte-identical across correct adapters - disagreement = broken
                    adapter.
                  </Text>
                </Box>
                <Box borderColor="var(--mantine-color-orange-6)">
                  <Text size="sm" fw={600} ff="monospace" mb={4}>
                    decoded
                  </Text>
                  <Text size="sm" c="dimmed" lh={1.5}>
                    Best-effort canonical decode: tables, row values, SQL. Adapters fill what they can.
                  </Text>
                </Box>
                <Box borderColor="var(--mantine-color-grape-6)">
                  <Text size="sm" fw={600} ff="monospace" mb={4}>
                    native
                  </Text>
                  <Text size="sm" c="dimmed" lh={1.5}>
                    Adapter-specific rendering, opaque. Preserved verbatim - this is what the diff view compares.
                  </Text>
                </Box>
              </Group>
            </Card>
          </Group>
        </Stack>
      </Layer>

      <Arrow note="JSON-lines (exec) / structs (builtin) - same schema" />

      {/* Core */}
      <Layer label="Core (Go binary)">
        <Group gap="sm" align="stretch" className="flex-wrap">
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Indexer
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              Streams events from the <Code>indexer</Code>-role adapter. Metadata only - no row values. On growth it{' '}
              <strong>true-seeks from the committed boundary</strong> (<Code>last_indexed_offset</Code>) and appends
              only the new tail. Positions come from a running byte accumulator, so &gt; 4 GiB files (uint32{' '}
              <Code>end_log_pos</Code> wrap) index correctly.
            </Text>
          </Box>
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              SQLite index
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              <Code>files · events · txns · tables · anomalies · decode_errors</Code>
              <br />
              Metadata only. Records which adapter built it. A post-index anomaly engine flags oversized/long txns and
              the 4 GiB position wrap.
            </Text>
          </Box>
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Diff engine
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              Lazy, per-event, at click time: runs all <Code>diff</Code>-role adapters at one offset, aligns by schema
              layer, flags disagreements.
            </Text>
          </Box>
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Hex service
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              Adapter-independent. Raw bytes read straight from the file via offset, header fields annotated + CRC32
              checked.
            </Text>
          </Box>
        </Group>
      </Layer>

      <Arrow note="REST/JSON + SSE" />

      {/* Web UI */}
      <Layer label="Web UI (React + TS · go:embed · localhost)">
        <Group gap="sm" align="stretch" className="flex-wrap">
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Event list
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              Cursor-paginated on <Code>pos</Code>; filters compose: type / db / table / txn / position. Txn-grouped.
            </Text>
          </Box>
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Detail drawer
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              Type-aware: row before/after, TABLE_MAP mapping, GTID/XID, diff, hex, raw JSON.
            </Text>
          </Box>
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Transactions
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              GTID → BEGIN → rows → Xid grouped; rows in/up/del, duration, incomplete flagged.
            </Text>
          </Box>
          <Box>
            <Text size="sm" fw={600} ff="monospace" mb={4}>
              Tables
            </Text>
            <Text size="sm" c="dimmed" lh={1.5}>
              Per-table column types, op counts, row counts, byte share.
            </Text>
          </Box>
        </Group>
      </Layer>

      {/* Legend */}
      <Card withBorder p="xs" radius="sm" className={styles.legendCard}>
        <Group gap="md" wrap="wrap" align="center">
          <Group gap={6} align="center">
            <ColorSwatch color="var(--brand)" size={8} radius={2} />
            <Text size="xs" c="dimmed">
              builtin adapter (in-process)
            </Text>
          </Group>
          <Group gap={6} align="center">
            <ColorSwatch color="var(--orange)" size={8} radius={2} />
            <Text size="xs" c="dimmed">
              exec adapter (subprocess, JSON-lines)
            </Text>
          </Group>
          <Group gap={6} align="center">
            <ColorSwatch color="var(--grape)" size={8} radius={2} />
            <Text size="xs" c="dimmed">
              planned
            </Text>
          </Group>
          <Group gap={6} align="center">
            <ColorSwatch color="var(--brand)" size={8} radius={2} />
            <Text size="xs" c="dimmed">
              interface / schema contract
            </Text>
          </Group>
        </Group>
      </Card>
    </Stack>
  )
}

export default function ArchitectureView({ onClose }: { onClose: () => void }) {
  return <ArchitectureContent onClose={onClose} />
}
