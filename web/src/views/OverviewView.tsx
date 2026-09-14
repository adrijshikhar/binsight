import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtBytes } from '../lib/format'
import { clickable, clickableRow } from '../lib/a11y'
import MetricsCharts from '../components/MetricsCharts'
import type { Anomaly, BinlogFile, FileMetrics, TypeCount } from '../lib/types'
import { Alert, Badge, Button, Card, Center, Group, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import { IconArrowRight, IconCheck, IconRefresh } from '@tabler/icons-react'
import KindBadge from '../components/KindBadge'
import styles from './OverviewView.module.css'

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
    ['Server version', file.server_version || '-'],
    ['Format', file.format_version ? `v${file.format_version}` : '-'],
    ['Checksum', file.checksum_algo || 'none'],
    ['Indexed by', file.indexed_by_adapter || '-'],
    ['State', file.state],
  ]

  const total = anomalies.length
  const byDetector = Object.entries(
    anomalies.reduce<Record<string, number>>((m, a) => {
      m[a.detector] = (m[a.detector] ?? 0) + 1
      return m
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  const mutationCounts = counts.filter((c) => ROW_TYPES.has(c.type_name) && c.count > 0)

  return (
    <Stack p="md" gap="md" className={styles.container}>
      <Group justify="space-between" align="flex-start" gap="sm">
        <Title order={2} ff="monospace" c="var(--brand-foreground)" className={styles.title}>
          {file.path.split('/').pop()}
        </Title>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconRefresh size={14} className={reindexing ? 'animate-spin' : undefined} />}
          onClick={doReindex}
          loading={reindexing}
          disabled={reindexing}
          title="Re-decode and re-index this file (rebuilds the event index, parsed schema, and anomalies)"
        >
          {reindexing ? 'Indexing…' : 'Re-index'}
        </Button>
      </Group>

      {reindexErr && (
        <Alert color="red" role="alert">
          {reindexErr}
        </Alert>
      )}

      {/* Balanced 2-column top grid: File Specifications + Health & Row Mutations */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Left column: File Specifications */}
        <Paper withBorder p="sm" className={styles.metaPaper}>
          <Text size="xs" c="dimmed" tt="uppercase" className={styles.sectionHeader} mb="xs">
            File Specifications
          </Text>
          <Table withRowBorders={false} className="table-fixed">
            <Table.Tbody>
              {meta.map(([k, v]) => (
                <Table.Tr key={k}>
                  <Table.Td w={110} c="dimmed" fz="xs">
                    {k}
                  </Table.Td>
                  <Table.Td ff="monospace" fz="xs" className="wrap-anywhere">
                    {v}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>

        {/* Right column: Health & Row Mutations */}
        <Paper withBorder p="sm" className={styles.healthPaper}>
          <Group justify="space-between" align="center" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" className={styles.sectionHeader}>
              Health & Data Mutations
            </Text>
            {total > 0 && (
              <Button
                variant="subtle"
                size="compact-xs"
                color="accent"
                rightSection={<IconArrowRight size={12} />}
                onClick={onShowAnomalies}
                className={styles.viewAllBtn}
              >
                View all
              </Button>
            )}
          </Group>

          {/* Anomaly summary badge strip */}
          <Paper
            withBorder
            p="xs"
            mb="xs"
            className={total > 0 ? styles.anomalySummary : styles.anomalySummaryDisabled}
            {...(total > 0 ? clickable(onShowAnomalies) : {})}
          >
            {total === 0 ? (
              <Group gap={6} c="var(--emerald)">
                <IconCheck size={16} />
                <Text fw={500} size="xs">
                  No anomalies detected in this binlog
                </Text>
              </Group>
            ) : (
              <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                <Text size="xs" fw={600} c="var(--orange)">
                  Anomalies: {total}
                </Text>
                <Group gap={6} wrap="wrap">
                  {byDetector.map(([det, n]) => (
                    <Badge
                      key={det}
                      color="gray"
                      variant="light"
                      size="xs"
                      ff="monospace"
                      className="cursor-pointer"
                      onClick={onShowAnomalies}
                    >
                      {det} <strong>{n}</strong>
                    </Badge>
                  ))}
                </Group>
              </Group>
            )}
          </Paper>

          {/* Row mutations breakdown table (relocated from sidebar) */}
          <Stack gap={4} style={{ flex: 1 }}>
            <Group justify="space-between" align="center" mt={4}>
              <Text size="xs" c="dimmed" tt="uppercase" className={styles.sectionHeader}>
                Row Mutations
              </Text>
              <Text size="xs" c="dimmed">
                {mutationCounts.length > 0
                  ? `${mutationCounts.reduce((n, c) => n + c.rows_total, 0).toLocaleString()} rows affected`
                  : '0 rows'}
              </Text>
            </Group>

            {mutationCounts.length === 0 ? (
              <Text size="xs" c="dimmed" py="xs">
                No row mutation events (inserts/updates/deletes) found in this binlog.
              </Text>
            ) : (
              <Table verticalSpacing={4} fz="xs" withRowBorders={false}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Type</Table.Th>
                    <Table.Th ta="right">Events</Table.Th>
                    <Table.Th ta="right">Rows</Table.Th>
                    <Table.Th ta="right">Bytes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {mutationCounts.map((c) => {
                    const bytes = bytesByType.get(c.type_name)
                    return (
                      <Table.Tr
                        key={c.type_name}
                        {...clickableRow(() => onOpenType(c.type_name))}
                        className="cursor-pointer"
                      >
                        <Table.Td>
                          <KindBadge typeName={c.type_name} size="xs" />
                        </Table.Td>
                        <Table.Td ta="right" className="tabular-nums">
                          {c.count.toLocaleString()}
                        </Table.Td>
                        <Table.Td ta="right" className="tabular-nums">
                          {c.rows_total > 0 ? c.rows_total.toLocaleString() : '-'}
                        </Table.Td>
                        <Table.Td ta="right" className="tabular-nums">
                          {bytes ? fmtBytes(bytes) : '-'}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            )}

            {decodeWarn && (
              <Alert color="yellow" variant="light" p="xs" mt="xs">
                Decoded stream contains partial frames or errors.
              </Alert>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      {err && (
        <Alert color="red" role="alert">
          {err}
          <Button size="xs" variant="outline" color="accent" ml="xs" onClick={() => setRetryKey((k) => k + 1)}>
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
          <Text size="xs" c="dimmed" tt="uppercase" className={styles.sectionHeader}>
            Metrics
          </Text>
          <Group gap="sm" wrap="wrap">
            <Card withBorder padding="sm" className={styles.metricCard}>
              <Text size="xs" c="dimmed">
                event size (avg)
              </Text>
              <Text size="lg" fw={600} ff="monospace" className={styles.metricValue}>
                {fmtBytes(metrics.event_size.avg)}
              </Text>
              <Text size="xs" c="dimmed">
                {fmtBytes(metrics.event_size.min)} min · {fmtBytes(metrics.event_size.max)} max ·{' '}
                {fmtBytes(metrics.event_size.total)} total
              </Text>
            </Card>
            <Card withBorder padding="sm" className={styles.metricCard}>
              <Text size="xs" c="dimmed">
                events
              </Text>
              <Text size="lg" fw={600} ff="monospace" className={styles.metricValue}>
                {metrics.events.toLocaleString()}
              </Text>
              <Text size="xs" c="dimmed">
                {metrics.events_per_sec.toFixed(1)}/s · {fmtBytes(metrics.bytes_per_sec)}/s
              </Text>
            </Card>
            <Card withBorder padding="sm" className={styles.metricCard}>
              <Text size="xs" c="dimmed">
                time span
              </Text>
              <Text size="lg" fw={600} ff="monospace" className={styles.metricValue}>
                {fmtDuration(metrics.span_sec)}
              </Text>
              <Text size="xs" c="dimmed">
                {metrics.txns.count.toLocaleString()} txns
              </Text>
            </Card>
            <Card
              withBorder
              padding="sm"
              className={`${styles.metricCard} ${decodeWarn ? styles.metricCardWarn : ''}`}
            >
              <Text size="xs" c="dimmed">
                decode
              </Text>
              <Text
                size="lg"
                fw={600}
                ff="monospace"
                c={decodeWarn ? 'orange' : undefined}
                className={styles.metricValue}
              >
                {metrics.decode.full.toLocaleString()} full
              </Text>
              <Text size="xs" c="dimmed">
                {metrics.decode.partial} partial · {metrics.decode.none} none · {metrics.decode.errors} err
              </Text>
            </Card>
          </Group>

          <Text size="xs" c="dimmed" tt="uppercase" className={styles.sectionHeader}>
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

      <Text size="xs" c="dimmed" tt="uppercase" className={styles.sectionHeader}>
        Breakdown
      </Text>
      <Group gap="md" align="stretch" wrap="wrap">
        {metrics && metrics.largest_events.length > 0 && (
          <Paper
            withBorder
            p="xs"
            className={styles.breakdownCol}
          >
            <Text size="xs" c="dimmed" mb="xs">
              Largest events by size
            </Text>
            <div className={styles.tableScroll}>
              <Table fz="xs" className={styles.tableFixed}>
                <Table.Thead className={styles.stickyHeader}>
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
                    <Table.Tr
                      key={e.pos}
                      {...clickableRow(() => onOpenEvent(e.pos))}
                      className="cursor-pointer"
                    >
                      <Table.Td>
                        <KindBadge typeName={e.type_name} size="xs" />
                      </Table.Td>
                      <Table.Td ta="right" className="tabular-nums">
                        {e.txn_id ? `#${e.txn_id}` : '-'}
                      </Table.Td>
                      <Table.Td ta="right" className="tabular-nums">
                        {fmtBytes(e.size)}
                      </Table.Td>
                      <Table.Td ta="right" className="tabular-nums">
                        {e.pos.toLocaleString()}
                      </Table.Td>
                    </Table.Tr>
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
            className={styles.breakdownCol}
          >
            <Text size="xs" c="dimmed" mb="xs">
              Largest transactions by event count
            </Text>
            <div className={styles.tableScroll}>
              <Table fz="xs" className={styles.tableFixed}>
                <Table.Thead className={styles.stickyHeader}>
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
                    <Table.Tr
                      key={t.id}
                      {...clickableRow(() => onOpenTxn(t.id))}
                      className="cursor-pointer"
                    >
                      <Table.Td className="wrap-anywhere">
                        {t.gtid && t.gtid !== 'ANONYMOUS' ? (
                          <Tooltip label={t.gtid} openDelay={200} withinPortal>
                            <span>{t.gtid}</span>
                          </Tooltip>
                        ) : (
                          `#${t.id}`
                        )}
                      </Table.Td>
                      <Table.Td ta="right" className="tabular-nums">
                        {t.events.toLocaleString()}
                      </Table.Td>
                      <Table.Td ta="right" className="tabular-nums">
                        {t.rows.toLocaleString()}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </Paper>
        )}

        <Paper withBorder p="xs" className={styles.breakdownCol}>
          <Text size="xs" c="dimmed" mb="xs">
            Event types
          </Text>
          {loading && counts.length === 0 ? (
            <Text size="xs" c="dimmed" p="xs">
              loading…
            </Text>
          ) : (
            <div className={styles.tableScroll}>
              <Table fz="xs" className={styles.tableFixed}>
                <Table.Thead className={styles.stickyHeader}>
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
                      <Table.Tr
                        key={c.type_name}
                        {...clickableRow(() => onOpenType(c.type_name))}
                        className="cursor-pointer"
                      >
                        <Table.Td>
                          <KindBadge typeName={c.type_name} size="xs" />
                        </Table.Td>
                        <Table.Td ta="right" className="tabular-nums">
                          {c.count.toLocaleString()}
                        </Table.Td>
                        <Table.Td ta="right" className="tabular-nums">
                          {isRow && c.rows_total > 0 ? c.rows_total.toLocaleString() : ''}
                        </Table.Td>
                        <Table.Td ta="right" className="tabular-nums">
                          {bytes ? fmtBytes(bytes) : ''}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                  <Table.Tr className={styles.totalRow}>
                    <Table.Td c="dimmed" fw={600}>
                      total
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed" fw={600} className="tabular-nums">
                      {totalEvents.toLocaleString()}
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed" fw={600} className="tabular-nums">
                      {totalRows.toLocaleString()}
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed" fw={600} className="tabular-nums">
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
