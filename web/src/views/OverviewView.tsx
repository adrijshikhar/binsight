import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtBytes } from '../lib/format'
import { clickable, clickableRow } from '../lib/a11y'
import MetricsCharts from '../components/MetricsCharts'
import type { Anomaly, BinlogFile, FileMetrics, TypeCount } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
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

// fmtDuration renders a second count compactly, e.g. 5 -> "5s", 3700 -> "1h 1m".
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
    <div className={`p-4 flex flex-col gap-4 ${styles.container}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className={`font-mono text-lg font-semibold text-brand-foreground ${styles.title}`}>
          {file.path.split('/').pop()}
        </h2>
        <Button
          variant="outline"
          size="xs"
          onClick={doReindex}
          disabled={reindexing}
          title="Re-decode and re-index this file (rebuilds the event index, parsed schema, and anomalies)"
        >
          <IconRefresh size={14} className={reindexing ? 'animate-spin mr-1.5' : 'mr-1.5'} />
          {reindexing ? 'Indexing...' : 'Re-index'}
        </Button>
      </div>

      {reindexErr && (
        <Alert variant="error" role="alert">
          {reindexErr}
        </Alert>
      )}

      {/* Balanced 2-column top grid: File Specifications + Health & Row Mutations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: File Specifications */}
        <div className={`rounded-xl border bg-card p-3 Paper ${styles.metaPaper}`}>
          <div className={`text-xs text-muted-foreground uppercase ${styles.sectionHeader} mb-2`}>
            File Specifications
          </div>
          <Table layout="fixed" withRowBorders={false} className="table-fixed">
            <Table.Tbody>
              {meta.map(([k, v]) => (
                <Table.Tr key={k}>
                  <Table.Td className="w-[110px] text-xs text-muted-foreground">
                    {k}
                  </Table.Td>
                  <Table.Td className="font-mono text-xs break-all">
                    {v}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>

        {/* Right column: Health & Row Mutations */}
        <div className={`rounded-xl border bg-card p-3 Paper ${styles.healthPaper}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`text-xs text-muted-foreground uppercase ${styles.sectionHeader}`}>
              Health & Data Mutations
            </div>
            {total > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onShowAnomalies}
                className={styles.viewAllBtn}
              >
                View all
                <IconArrowRight size={12} className="ml-1" />
              </Button>
            )}
          </div>

          {/* Anomaly summary badge strip */}
          <div
            className={`p-2.5 mb-2 rounded-lg border ${total > 0 ? styles.anomalySummary : styles.anomalySummaryDisabled}`}
            {...(total > 0 ? clickable(onShowAnomalies) : {})}
          >
            {total === 0 ? (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <IconCheck size={16} />
                <span className="text-xs font-medium">
                  No anomalies detected in this binlog
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-amber-500">
                  Anomalies: {total}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {byDetector.map(([det, n]) => (
                    <Badge
                      key={det}
                      variant="secondary"
                      size="sm"
                      className="font-mono cursor-pointer"
                      onClick={onShowAnomalies}
                    >
                      {det} <strong className="ml-1">{n}</strong>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Row mutations breakdown table (relocated from sidebar) */}
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between mt-1">
              <span className={`text-xs text-muted-foreground uppercase ${styles.sectionHeader}`}>
                Row Mutations
              </span>
              <span className="text-xs text-muted-foreground">
                {mutationCounts.length > 0
                  ? `${mutationCounts.reduce((n, c) => n + c.rows_total, 0).toLocaleString()} rows affected`
                  : '0 rows'}
              </span>
            </div>

            {mutationCounts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No row mutation events (inserts/updates/deletes) found in this binlog.
              </p>
            ) : (
              <Table withRowBorders={false} className="text-xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Type</Table.Th>
                    <Table.Th className="text-right">Events</Table.Th>
                    <Table.Th className="text-right">Rows</Table.Th>
                    <Table.Th className="text-right">Bytes</Table.Th>
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
                        <Table.Td className="text-right tabular-nums">
                          {c.count.toLocaleString()}
                        </Table.Td>
                        <Table.Td className="text-right tabular-nums">
                          {c.rows_total > 0 ? c.rows_total.toLocaleString() : '-'}
                        </Table.Td>
                        <Table.Td className="text-right tabular-nums">
                          {bytes ? fmtBytes(bytes) : '-'}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            )}

            {decodeWarn && (
              <Alert variant="warning" className="p-2 mt-2">
                Decoded stream contains partial frames or errors.
              </Alert>
            )}
          </div>
        </div>
      </div>

      {err && (
        <Alert variant="error" role="alert" className="flex items-center justify-between">
          <span>{err}</span>
          <Button size="xs" variant="outline" className="ml-2" onClick={() => setRetryKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}

      {!loading && !err && metrics && metrics.events === 0 && counts.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2" role="status">
            <p className="text-muted-foreground">No events indexed for this file.</p>
            <p className="text-muted-foreground text-xs">
              The file may still be indexing or contain no parseable events.
            </p>
            <Button variant="outline" size="xs" onClick={doReindex}>
              re-index now
            </Button>
          </div>
        </div>
      )}

      {metrics && (
        <>
          <div className={`text-xs text-muted-foreground uppercase ${styles.sectionHeader}`}>
            Metrics
          </div>
          <div className="flex flex-wrap gap-3">
            <Card className={`p-3 ${styles.metricCard}`}>
              <div className="text-xs text-muted-foreground">
                event size (avg)
              </div>
              <div className={`text-lg font-semibold font-mono ${styles.metricValue}`}>
                {fmtBytes(metrics.event_size.avg)}
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtBytes(metrics.event_size.min)} min · {fmtBytes(metrics.event_size.max)} max ·{' '}
                {fmtBytes(metrics.event_size.total)} total
              </div>
            </Card>
            <Card className={`p-3 ${styles.metricCard}`}>
              <div className="text-xs text-muted-foreground">
                events
              </div>
              <div className={`text-lg font-semibold font-mono ${styles.metricValue}`}>
                {metrics.events.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                {metrics.events_per_sec.toFixed(1)}/s · {fmtBytes(metrics.bytes_per_sec)}/s
              </div>
            </Card>
            <Card className={`p-3 ${styles.metricCard}`}>
              <div className="text-xs text-muted-foreground">
                time span
              </div>
              <div className={`text-lg font-semibold font-mono ${styles.metricValue}`}>
                {fmtDuration(metrics.span_sec)}
              </div>
              <div className="text-xs text-muted-foreground">
                {metrics.txns.count.toLocaleString()} txns
              </div>
            </Card>
            <Card
              className={`p-3 ${styles.metricCard} ${decodeWarn ? styles.metricCardWarn : ''}`}
            >
              <div className="text-xs text-muted-foreground">
                decode
              </div>
              <div
                className={`text-lg font-semibold font-mono ${decodeWarn ? 'text-amber-500' : ''} ${styles.metricValue}`}
              >
                {metrics.decode.full.toLocaleString()} full
              </div>
              <div className="text-xs text-muted-foreground">
                {metrics.decode.partial} partial · {metrics.decode.none} none · {metrics.decode.errors} err
              </div>
            </Card>
          </div>

          <div className={`text-xs text-muted-foreground uppercase ${styles.sectionHeader}`}>
            Event activity
          </div>
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

      <div className={`text-xs text-muted-foreground uppercase ${styles.sectionHeader}`}>
        Breakdown
      </div>
      <div className="flex flex-wrap items-stretch gap-4">
        {metrics && metrics.largest_events.length > 0 && (
          <div
            className={`rounded-xl border bg-card p-3 Paper ${styles.breakdownCol}`}
            data-slot="breakdown-panel"
          >
            <div className="text-xs text-muted-foreground mb-2">
              Largest events by size
            </div>
            <div className={styles.tableScroll}>
              <Table className={`text-xs ${styles.tableFixed}`}>
                <Table.Thead className={styles.stickyHeader}>
                  <Table.Tr>
                    <Table.Th>type</Table.Th>
                    <Table.Th className="w-14 text-right">
                      txn
                    </Table.Th>
                    <Table.Th className="w-20 text-right">
                      size
                    </Table.Th>
                    <Table.Th className="w-20 text-right" title="byte offset of the event in the binlog file">
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
                      <Table.Td className="text-right tabular-nums">
                        {e.txn_id ? `#${e.txn_id}` : '-'}
                      </Table.Td>
                      <Table.Td className="text-right tabular-nums">
                        {fmtBytes(e.size)}
                      </Table.Td>
                      <Table.Td className="text-right tabular-nums">
                        {e.pos.toLocaleString()}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </div>
        )}

        {metrics && metrics.largest_txns.length > 0 && (
          <div
            className={`rounded-xl border bg-card p-3 Paper ${styles.breakdownCol}`}
            data-slot="breakdown-panel"
          >
            <div className="text-xs text-muted-foreground mb-2">
              Largest transactions by event count
            </div>
            <div className={styles.tableScroll}>
              <Table className={`text-xs ${styles.tableFixed}`}>
                <Table.Thead className={styles.stickyHeader}>
                  <Table.Tr>
                    <Table.Th>txn</Table.Th>
                    <Table.Th className="w-20 text-right">
                      events
                    </Table.Th>
                    <Table.Th className="w-20 text-right">
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
                      <Table.Td className="break-all">
                        {t.gtid && t.gtid !== 'ANONYMOUS' ? (
                          <Tooltip>
                            <TooltipTrigger render={<span>{t.gtid}</span>} />
                            <TooltipPopup side="top" align="center">
                              {t.gtid}
                            </TooltipPopup>
                          </Tooltip>
                        ) : (
                          `#${t.id}`
                        )}
                      </Table.Td>
                      <Table.Td className="text-right tabular-nums">
                        {t.events.toLocaleString()}
                      </Table.Td>
                      <Table.Td className="text-right tabular-nums">
                        {t.rows.toLocaleString()}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </div>
        )}

        <div className={`rounded-xl border bg-card p-3 Paper ${styles.breakdownCol}`} data-slot="breakdown-panel">
          <div className="text-xs text-muted-foreground mb-2">
            Event types
          </div>
          {loading && counts.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">
              loading...
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <Table className={`text-xs ${styles.tableFixed}`}>
                <Table.Thead className={styles.stickyHeader}>
                  <Table.Tr>
                    <Table.Th>type</Table.Th>
                    <Table.Th className="w-20 text-right">
                      events
                    </Table.Th>
                    <Table.Th className="w-20 text-right">
                      rows
                    </Table.Th>
                    <Table.Th className="w-20 text-right">
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
                        <Table.Td className="text-right tabular-nums">
                          {c.count.toLocaleString()}
                        </Table.Td>
                        <Table.Td className="text-right tabular-nums">
                          {isRow && c.rows_total > 0 ? c.rows_total.toLocaleString() : ''}
                        </Table.Td>
                        <Table.Td className="text-right tabular-nums">
                          {bytes ? fmtBytes(bytes) : ''}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                  <Table.Tr className={styles.totalRow}>
                    <Table.Td className="text-muted-foreground font-semibold">
                      total
                    </Table.Td>
                    <Table.Td className="text-right text-muted-foreground font-semibold tabular-nums">
                      {totalEvents.toLocaleString()}
                    </Table.Td>
                    <Table.Td className="text-right text-muted-foreground font-semibold tabular-nums">
                      {totalRows.toLocaleString()}
                    </Table.Td>
                    <Table.Td className="text-right text-muted-foreground font-semibold tabular-nums">
                      {fmtBytes(metrics?.event_size.total ?? 0)}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
