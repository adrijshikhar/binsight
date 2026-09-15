import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtBytes } from '../lib/format'
import { clickable, clickableRow } from '../lib/a11y'
import MetricsCharts from '../components/MetricsCharts'
import type { Anomaly, BinlogFile, FileMetrics, TypeCount } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import { IconArrowRight, IconCheck, IconRefresh } from '@tabler/icons-react'
import KindBadge from '../components/KindBadge'

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
    <div className="p-4 flex flex-col gap-4 w-full overflow-auto">
      <div className="flex items-start justify-between gap-2">
        <h2 className="wrap-anywhere">{file.path.split('/').pop()}</h2>
        <Button
          variant="outline"
          onClick={doReindex}
          disabled={reindexing}
          title="Re-decode and re-index this file (rebuilds the event index, parsed schema, and anomalies)"
        >
          <IconRefresh size={14} />
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
        <div className="py-3 flex h-full flex-col">
          <div className="mb-2">File Specifications</div>
          <Table className="table-fixed">
            <TableBody>
              {meta.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell className="w-[110px]">{k}</TableCell>
                  <TableCell className="break-all">{v}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Right column: Health & Row Mutations */}
        <div className="py-3 flex h-full flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>Health & Data Mutations</div>
            {total > 0 && (
              <Button variant="ghost" onClick={onShowAnomalies}>
                View all
                <IconArrowRight size={12} className="ml-1" />
              </Button>
            )}
          </div>

          {/* Anomaly summary badge strip */}
          <Alert
            variant={total > 0 ? 'warning' : 'default'}
            className="mb-2"
            {...(total > 0 ? clickable(onShowAnomalies) : {})}
          >
            {total === 0 ? (
              <div className="flex items-center gap-1.5">
                <IconCheck size={16} />
                <span>No anomalies detected in this binlog</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Anomalies: {total}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {byDetector.map(([det, n]) => (
                    <Badge key={det} variant="secondary" size="sm" className="cursor-pointer" onClick={onShowAnomalies}>
                      {det} <strong className="ml-1">{n}</strong>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Alert>

          {/* Row mutations breakdown table (relocated from sidebar) */}
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between mt-1">
              <span>Row Mutations</span>
              <span>
                {mutationCounts.length > 0
                  ? `${mutationCounts.reduce((n, c) => n + c.rows_total, 0).toLocaleString()} rows affected`
                  : '0 rows'}
              </span>
            </div>

            {mutationCounts.length === 0 ? (
              <p className="py-2">No row mutation events (inserts/updates/deletes) found in this binlog.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Bytes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mutationCounts.map((c) => {
                    const bytes = bytesByType.get(c.type_name)
                    return (
                      <TableRow
                        key={c.type_name}
                        {...clickableRow(() => onOpenType(c.type_name))}
                        className="cursor-pointer"
                      >
                        <TableCell>
                          <KindBadge typeName={c.type_name} size="sm" />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.rows_total > 0 ? c.rows_total.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{bytes ? fmtBytes(bytes) : '-'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}

            {decodeWarn && (
              <Alert variant="warning" className="mt-2">
                Decoded stream contains partial frames or errors.
              </Alert>
            )}
          </div>
        </div>
      </div>

      {err && (
        <Alert variant="error" role="alert" className="flex items-center justify-between">
          <span>{err}</span>
          <Button variant="outline" className="ml-2" onClick={() => setRetryKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}

      {!loading && !err && metrics && metrics.events === 0 && counts.length === 0 && (
        <Empty role="status">
          <EmptyHeader>
            <EmptyTitle>No events indexed for this file.</EmptyTitle>
            <EmptyDescription>The file may still be indexing or contain no parseable events.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={doReindex}>
              re-index now
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {metrics && (
        <>
          <div>Metrics</div>
          <div className="flex flex-wrap gap-3">
            <Card className="min-w-40 flex-1 basis-40">
              <CardHeader>
                <CardDescription>event size (avg)</CardDescription>
                <CardTitle>{fmtBytes(metrics.event_size.avg)}</CardTitle>
                <CardDescription>
                  {fmtBytes(metrics.event_size.min)} min · {fmtBytes(metrics.event_size.max)} max ·{' '}
                  {fmtBytes(metrics.event_size.total)} total
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="min-w-40 flex-1 basis-40">
              <CardHeader>
                <CardDescription>events</CardDescription>
                <CardTitle>{metrics.events.toLocaleString()}</CardTitle>
                <CardDescription>
                  {metrics.events_per_sec.toFixed(1)}/s · {fmtBytes(metrics.bytes_per_sec)}/s
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="min-w-40 flex-1 basis-40">
              <CardHeader>
                <CardDescription>time span</CardDescription>
                <CardTitle>{fmtDuration(metrics.span_sec)}</CardTitle>
                <CardDescription>{metrics.txns.count.toLocaleString()} txns</CardDescription>
              </CardHeader>
            </Card>
            <Card className="min-w-40 flex-1 basis-40">
              <CardHeader>
                <CardDescription>decode</CardDescription>
                <CardTitle>{metrics.decode.full.toLocaleString()} full</CardTitle>
                {decodeWarn && <Badge variant="warning">Incomplete decoding</Badge>}
                <CardDescription>
                  {metrics.decode.partial} partial · {metrics.decode.none} none · {metrics.decode.errors} err
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div>Event activity</div>
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

      <div>Breakdown</div>
      <div className="flex flex-wrap items-stretch gap-4">
        {metrics && metrics.largest_events.length > 0 && (
          <div className="py-3 flex min-w-0 flex-1 basis-72 flex-col" data-slot="breakdown-panel">
            <div className="mb-2">Largest events by size</div>
            <div className="min-h-0 flex-1 overflow-auto">
              <Table className="w-full table-fixed">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead>type</TableHead>
                    <TableHead className="w-14 text-right">txn</TableHead>
                    <TableHead className="w-20 text-right">size</TableHead>
                    <TableHead className="w-20 text-right" title="byte offset of the event in the binlog file">
                      offset
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.largest_events.map((e) => (
                    <TableRow key={e.pos} {...clickableRow(() => onOpenEvent(e.pos))} className="cursor-pointer">
                      <TableCell>
                        <KindBadge typeName={e.type_name} size="sm" />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e.txn_id ? `#${e.txn_id}` : '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBytes(e.size)}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.pos.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {metrics && metrics.largest_txns.length > 0 && (
          <div className="py-3 flex min-w-0 flex-1 basis-72 flex-col" data-slot="breakdown-panel">
            <div className="mb-2">Largest transactions by event count</div>
            <div className="min-h-0 flex-1 overflow-auto">
              <Table className="w-full table-fixed">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead>txn</TableHead>
                    <TableHead className="w-20 text-right">events</TableHead>
                    <TableHead className="w-20 text-right">rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.largest_txns.map((t) => (
                    <TableRow key={t.id} {...clickableRow(() => onOpenTxn(t.id))} className="cursor-pointer">
                      <TableCell className="break-all">
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
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.events.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.rows.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="py-3 flex min-w-0 flex-1 basis-72 flex-col" data-slot="breakdown-panel">
          <div className="mb-2">Event types</div>
          {loading && counts.length === 0 ? (
            <div className="p-2">loading...</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <Table className="w-full table-fixed">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead>type</TableHead>
                    <TableHead className="w-20 text-right">events</TableHead>
                    <TableHead className="w-20 text-right">rows</TableHead>
                    <TableHead className="w-20 text-right">bytes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.map((c) => {
                    const isRow = ROW_TYPES.has(c.type_name)
                    const bytes = bytesByType.get(c.type_name)
                    return (
                      <TableRow
                        key={c.type_name}
                        {...clickableRow(() => onOpenType(c.type_name))}
                        className="cursor-pointer"
                      >
                        <TableCell>
                          <KindBadge typeName={c.type_name} size="sm" />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {isRow && c.rows_total > 0 ? c.rows_total.toLocaleString() : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{bytes ? fmtBytes(bytes) : ''}</TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow>
                    <TableCell>total</TableCell>
                    <TableCell className="text-right tabular-nums">{totalEvents.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{totalRows.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBytes(metrics?.event_size.total ?? 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
