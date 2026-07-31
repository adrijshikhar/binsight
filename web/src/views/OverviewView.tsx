import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtBytes } from '../lib/format'
import { clickable, clickableRow } from '../lib/a11y'
import MetricsCharts from '../components/MetricsCharts'
import type { Anomaly, BinlogFile, FileMetrics, TypeCount } from '../lib/types'
import { Alert, Badge, Button, Card, Center, Group, Paper, Stack, Table, Text, Title, Tooltip } from '@mantine/core'

const ROW_TYPES = new Set([
  'WRITE_ROWS_V2',
  'WRITE_ROWS_V1',
  'UPDATE_ROWS_V2',
  'UPDATE_ROWS_V1',
  'DELETE_ROWS_V2',
  'DELETE_ROWS_V1',
])

// fmtDuration renders a second count compactly, e.g. 5 → "5s", 3700 → "1h 1m".
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

export interface OverviewViewProps {
  file: BinlogFile
  onOpenType: (type: string) => void
  onOpenEvent: (pos: number) => void
  onOpenTxn: (id: number) => void
  anomalies: Anomaly[]
  onShowAnomalies: () => void
}

// OverviewView is the readable per-file dashboard: file metadata, computed
// metrics (size/throughput/decode + event-time chart + largest events/txns),
// and the full event-type matrix with per-type byte totals. Clicking a row
// type, event, or transaction navigates to the relevant view.
export default function OverviewView({
  file,
  onOpenType,
  onOpenEvent,
  onOpenTxn,
  anomalies,
  onShowAnomalies,
}: OverviewViewProps) {
  const [counts, setCounts] = useState<TypeCount[]>([])
  const [metrics, setMetrics] = useState<FileMetrics | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [retryKey, setRetryKey] = useState(0)
  const [reindexErr, setReindexErr] = useState('')

  // Re-decode + re-index this file: rebuilds the event index, parsed schema, and
  // anomalies. The file transitions to "indexing" (reflected via SSE in file.state)
  // and back to "ready"; the metrics effect re-runs on that state change.
  const reindexing = file.state === 'indexing'
  const doReindex = () => {
    setReindexErr('')
    api.reindex(file.id).catch((e: unknown) => setReindexErr(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCounts([])
    setMetrics(null)
    setErr('')
    Promise.all([api.typeCounts(file.id), api.metrics(file.id)])
      .then(([c, m]) => {
        if (cancelled) return
        setCounts(c)
        setMetrics(m)
        setErr('')
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file.id, file.state, retryKey])

  const totalEvents = counts.reduce((n, c) => n + c.count, 0)
  const totalRows = counts.reduce((n, c) => n + c.rows_total, 0)
  const bytesByType = new Map((metrics?.by_type ?? []).map((b) => [b.type_name, b.bytes]))
  const decodeWarn = metrics ? metrics.decode.partial + metrics.decode.none + metrics.decode.errors > 0 : false

  const meta: [string, string][] = [
    ['Path', file.path],
    ['Size', fmtBytes(file.size)],
    ['Server version', file.server_version || '—'],
    ['Format', file.format_version ? `v${file.format_version}` : '—'],
    ['Checksum', file.checksum_algo || 'none'],
    ['Indexed by', file.indexed_by_adapter || '—'],
    ['State', file.state],
  ]

  const total = anomalies.length
  const byDetector = Object.entries(
    anomalies.reduce<Record<string, number>>((m, a) => {
      m[a.detector] = (m[a.detector] ?? 0) + 1
      return m
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  return (
    <Stack p="md" gap="md" style={{ width: '100%', overflowY: 'auto' }}>
      <Group justify="space-between" align="flex-start" gap="sm">
        <Title order={2} ff="monospace" c="blue.4" style={{ overflowWrap: 'anywhere' }}>
          {file.path.split('/').pop()}
        </Title>
        <Button
          variant="default"
          size="xs"
          ff="monospace"
          onClick={doReindex}
          disabled={reindexing}
          title="Re-decode and re-index this file (rebuilds the event index, parsed schema, and anomalies)"
        >
          {reindexing ? 'indexing…' : '↻ re-index'}
        </Button>
      </Group>

      {reindexErr && (
        <Alert color="red" role="alert">
          {reindexErr}
        </Alert>
      )}

      {/* File metadata grid */}
      <Paper withBorder p="sm" style={{ maxWidth: 720 }}>
        <Table withRowBorders={false} style={{ tableLayout: 'fixed' }}>
          <Table.Tbody>
            {meta.map(([k, v]) => (
              <Table.Tr key={k}>
                <Table.Td w={140} c="dimmed">
                  {k}
                </Table.Td>
                <Table.Td ff="monospace" style={{ overflowWrap: 'anywhere' }}>
                  {v}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Anomaly summary strip */}
      <Tooltip label="view anomalies" openDelay={150} withinPortal disabled={total === 0}>
        <Paper
          withBorder
          p="xs"
          style={{
            borderLeft: total > 0 ? '3px solid var(--mantine-color-red-6)' : undefined,
            cursor: total > 0 ? 'pointer' : undefined,
          }}
          {...(total > 0 ? clickable(onShowAnomalies) : {})}
        >
          <Group gap="xs" wrap="wrap" align="center">
            <Text size="sm">Anomalies: {total}</Text>
            {byDetector.map(([det, n]) => (
              <Badge key={det} color="gray" variant="light" size="sm" ff="monospace">
                {det} <strong>{n}</strong>
              </Badge>
            ))}
          </Group>
        </Paper>
      </Tooltip>

      {err && (
        <Alert color="red" role="alert">
          {err}
          <Button size="xs" variant="outline" color="blue" ml="xs" onClick={() => setRetryKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}

      {!loading && !err && metrics && metrics.events === 0 && counts.length === 0 && (
        <Center py="xl">
          <Stack align="center" gap="xs" role="status">
            <Text c="dimmed">No events indexed for this file.</Text>
            <Text c="dimmed" size="xs">
              The file may still be indexing or contain no parseable events.
            </Text>
            <Button variant="default" size="xs" onClick={doReindex}>
              re-index now
            </Button>
          </Stack>
        </Center>
      )}

      {metrics && (
        <>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 1 }}>
            Metrics
          </Text>
          <Group gap="sm" wrap="wrap">
            <Card withBorder padding="sm" style={{ minWidth: 160 }}>
              <Text size="xs" c="dimmed">
                event size (avg)
              </Text>
              <Text size="lg" fw={600} ff="monospace">
                {fmtBytes(metrics.event_size.avg)}
              </Text>
              <Text size="xs" c="dimmed">
                {fmtBytes(metrics.event_size.min)} min · {fmtBytes(metrics.event_size.max)} max ·{' '}
                {fmtBytes(metrics.event_size.total)} total
              </Text>
            </Card>
            <Card withBorder padding="sm" style={{ minWidth: 160 }}>
              <Text size="xs" c="dimmed">
                events
              </Text>
              <Text size="lg" fw={600} ff="monospace">
                {metrics.events.toLocaleString()}
              </Text>
              <Text size="xs" c="dimmed">
                {metrics.events_per_sec.toFixed(1)}/s · {fmtBytes(metrics.bytes_per_sec)}/s
              </Text>
            </Card>
            <Card withBorder padding="sm" style={{ minWidth: 160 }}>
              <Text size="xs" c="dimmed">
                time span
              </Text>
              <Text size="lg" fw={600} ff="monospace">
                {fmtDuration(metrics.span_sec)}
              </Text>
              <Text size="xs" c="dimmed">
                {metrics.txns.count.toLocaleString()} txns
              </Text>
            </Card>
            <Card
              withBorder
              padding="sm"
              style={{ minWidth: 160, borderColor: decodeWarn ? 'var(--mantine-color-orange-6)' : undefined }}
            >
              <Text size="xs" c="dimmed">
                decode
              </Text>
              <Text size="lg" fw={600} ff="monospace" c={decodeWarn ? 'orange' : undefined}>
                {metrics.decode.full.toLocaleString()} full
              </Text>
              <Text size="xs" c="dimmed">
                {metrics.decode.partial} partial · {metrics.decode.none} none · {metrics.decode.errors} err
              </Text>
            </Card>
          </Group>

          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 1 }}>
            Event activity
          </Text>
          <MetricsCharts
            series={metrics.series}
            byType={metrics.by_type}
            onOpenType={onOpenType}
            loading={loading}
            error={err || undefined}
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        </>
      )}

      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 1 }}>
        Breakdown
      </Text>
      <Group gap="md" align="stretch" wrap="wrap">
        {metrics && metrics.largest_events.length > 0 && (
          <Paper
            withBorder
            p="xs"
            style={{ flex: '1 1 280px', minWidth: 220, display: 'flex', flexDirection: 'column' }}
          >
            <Text size="xs" c="dimmed" mb="xs">
              Largest events by size
            </Text>
            <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
              <Table fz="xs" style={{ tableLayout: 'fixed', width: '100%' }}>
                <Table.Thead style={{ position: 'sticky', top: 0, background: 'var(--panel)' }}>
                  <Table.Tr>
                    <Table.Th>type</Table.Th>
                    <Table.Th w="3.5rem" ta="right">
                      txn
                    </Table.Th>
                    <Table.Th w="5.5rem" ta="right">
                      size
                    </Table.Th>
                    <Table.Th w="5.5rem" ta="right" title="byte offset of the event in the binlog file">
                      offset
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {metrics.largest_events.map((e) => (
                    <Tooltip key={e.pos} label="open event" openDelay={150} withinPortal>
                      <Table.Tr {...clickableRow(() => onOpenEvent(e.pos))} style={{ cursor: 'pointer' }}>
                        <Table.Td style={{ overflowWrap: 'anywhere' }}>{e.type_name}</Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {e.txn_id ? `#${e.txn_id}` : '—'}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtBytes(e.size)}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {e.pos.toLocaleString()}
                        </Table.Td>
                      </Table.Tr>
                    </Tooltip>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </Paper>
        )}

        {metrics && metrics.largest_txns.length > 0 && (
          <Paper
            withBorder
            p="xs"
            style={{ flex: '1 1 280px', minWidth: 220, display: 'flex', flexDirection: 'column' }}
          >
            <Text size="xs" c="dimmed" mb="xs">
              Largest transactions by event count
            </Text>
            <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
              <Table fz="xs" style={{ tableLayout: 'fixed', width: '100%' }}>
                <Table.Thead style={{ position: 'sticky', top: 0, background: 'var(--panel)' }}>
                  <Table.Tr>
                    <Table.Th>txn</Table.Th>
                    <Table.Th w="5.5rem" ta="right">
                      events
                    </Table.Th>
                    <Table.Th w="5.5rem" ta="right">
                      rows
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {metrics.largest_txns.map((t) => (
                    <Tooltip key={t.id} label={t.gtid} openDelay={150} withinPortal disabled={!t.gtid}>
                      <Table.Tr {...clickableRow(() => onOpenTxn(t.id))} style={{ cursor: 'pointer' }}>
                        <Table.Td style={{ overflowWrap: 'anywhere' }}>
                          {t.gtid && t.gtid !== 'ANONYMOUS' ? t.gtid : `#${t.id}`}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {t.events.toLocaleString()}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {t.rows.toLocaleString()}
                        </Table.Td>
                      </Table.Tr>
                    </Tooltip>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </Paper>
        )}

        <Paper withBorder p="xs" style={{ flex: '1 1 280px', minWidth: 220, display: 'flex', flexDirection: 'column' }}>
          <Text size="xs" c="dimmed" mb="xs">
            Event types
          </Text>
          {loading && counts.length === 0 ? (
            <Text size="xs" c="dimmed" p="xs">
              loading…
            </Text>
          ) : (
            <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
              <Table fz="xs" style={{ tableLayout: 'fixed', width: '100%' }}>
                <Table.Thead style={{ position: 'sticky', top: 0, background: 'var(--panel)' }}>
                  <Table.Tr>
                    <Table.Th>type</Table.Th>
                    <Table.Th w="5.5rem" ta="right">
                      events
                    </Table.Th>
                    <Table.Th w="5.5rem" ta="right">
                      rows
                    </Table.Th>
                    <Table.Th w="5.5rem" ta="right">
                      bytes
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {counts.map((c) => {
                    const isRow = ROW_TYPES.has(c.type_name)
                    const bytes = bytesByType.get(c.type_name)
                    return (
                      <Tooltip
                        key={c.type_name}
                        label="show these events"
                        openDelay={150}
                        withinPortal
                        disabled={!isRow}
                      >
                        <Table.Tr
                          {...(isRow ? clickableRow(() => onOpenType(c.type_name)) : {})}
                          style={{ cursor: isRow ? 'pointer' : undefined }}
                        >
                          <Table.Td>{c.type_name}</Table.Td>
                          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {c.count.toLocaleString()}
                          </Table.Td>
                          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {isRow && c.rows_total > 0 ? c.rows_total.toLocaleString() : ''}
                          </Table.Td>
                          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {bytes ? fmtBytes(bytes) : ''}
                          </Table.Td>
                        </Table.Tr>
                      </Tooltip>
                    )
                  })}
                  <Table.Tr style={{ borderTop: '1px solid var(--border)' }}>
                    <Table.Td c="dimmed" fw={600}>
                      total
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {totalEvents.toLocaleString()}
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {totalRows.toLocaleString()}
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtBytes(metrics?.event_size.total ?? 0)}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </div>
          )}
        </Paper>
      </Group>
    </Stack>
  )
}
