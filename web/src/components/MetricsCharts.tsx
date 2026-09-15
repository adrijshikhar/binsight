import { useState, type ReactElement } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, Label } from 'recharts'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardPanel, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table'
import { fmtBytes } from '../lib/format'
import type { Bucket, TypeBytes } from '../lib/types'

// Scheme-aware chrome: semantic CSS vars flip automatically between
// light/dark. Recharts renders SVG, where `fill`/`stroke="var(--x)"` resolve
// fine, so charts track the active color scheme with no JS recompute.
const MUTED = 'var(--muted-foreground)'
const BORDER = 'var(--border)'
const AXIS = { stroke: MUTED } as const
const GRID = BORDER
const PANEL_H = 300 // chart height; panel ≈ 340 to match the Breakdown panels
const TOP_TYPES = 8

// Semantic colors for event types: WRITE green, UPDATE amber, DELETE rose, QUERY grape, others neutral.
export function colorFor(type: string): string {
  if (type.startsWith('WRITE_ROWS')) return 'var(--success)'
  if (type.startsWith('UPDATE_ROWS')) return 'var(--warning)'
  if (type.startsWith('DELETE_ROWS')) return 'var(--destructive)'
  if (type === 'QUERY') return 'var(--info)'
  return 'var(--muted-foreground)'
}

// bucket start ts is unix seconds; show wall-clock time.
function fmtTime(t: number): string {
  return new Date(t * 1000).toLocaleTimeString()
}

interface TipItem {
  value?: number | string
  name?: string
  color?: string
  dataKey?: string | number
}

// Recharts owns positioning; stock Coss owns the tooltip surface and table.
export function ChartTooltip({
  active,
  payload,
  label,
  bytes = false,
  time = false,
  positiveOnly = false,
}: {
  active?: boolean
  payload?: TipItem[]
  label?: number | string
  bytes?: boolean
  time?: boolean
  positiveOnly?: boolean
}) {
  if (!active || !payload) return null
  const items = positiveOnly ? payload.filter((p) => Number(p.value ?? 0) > 0) : payload
  if (items.length === 0) return null
  return (
    <Card>
      <CardPanel>
        <CardDescription>{time ? fmtTime(Number(label)) : label}</CardDescription>
        <Table>
          <TableBody>
            {items.map((p) => (
              <TableRow key={String(p.dataKey)}>
                <TableCell>{p.name}</TableCell>
                <TableCell>{bytes ? fmtBytes(Number(p.value)) : p.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

// TypeTick is a clickable Y-axis category label, so tiny bars (whose hit area
// is too small to click) are still openable via their type name.
function TypeTick({
  x,
  y,
  payload,
  onSelect,
}: {
  x?: number
  y?: number
  payload?: { value?: string }
  onSelect: (t: string) => void
}) {
  const v = payload?.value ?? ''
  return (
    <text x={x} y={y} dy={3} textAnchor="end" fill={MUTED} className="cursor-pointer" onClick={() => v && onSelect(v)}>
      <title>{`filter events: ${v}`}</title>
      {v}
    </text>
  )
}

function Panel({
  title,
  summary,
  height,
  wide,
  children,
}: {
  title: string
  summary?: string
  height?: number
  wide?: boolean
  children: ReactElement
}) {
  return (
    <div className={wide ? 'min-w-0 w-full' : 'min-w-0 flex-1 basis-64'}>
      <div className="mb-2">{title}</div>
      <div role="img" aria-label={summary ?? title}>
        <ResponsiveContainer width="100%" height={height ?? PANEL_H}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export interface MetricsChartsProps {
  series: Bucket[]
  byType: TypeBytes[]
  onOpenType: (type: string) => void
  loading?: boolean
  error?: string
  onRetry?: () => void
}

// MetricsCharts renders the Overview activity charts: a 3-up row (event count,
// byte throughput, bytes-by-type) plus a full-width chart stacking every event
// type over time. All data is pre-aggregated server-side.
export default function MetricsCharts({ series, byType, onOpenType, loading, error, onRetry }: MetricsChartsProps) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }))

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-4 p-4">
        <div className="flex flex-wrap gap-4">
          {(['events over time', 'bytes/sec over time', 'bytes by type'] as const).map((title) => (
            <div key={title} className="min-w-0 flex-1 basis-64" aria-busy="true">
              <div className="mb-2">{title}</div>
              <Skeleton className="h-60 w-full" aria-label="loading chart" />
            </div>
          ))}
        </div>
        <div className="min-w-0 w-full" aria-busy="true">
          <div className="mb-2">event types over time</div>
          <Skeleton className="h-60 w-full" aria-label="loading chart" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex w-full flex-col gap-4 p-4">
        <Alert variant="error" role="alert" className="flex items-center justify-between">
          <span>Chart data unavailable: {error}</span>
          {onRetry && (
            <Button size="xs" variant="outline" className="ml-2" onClick={onRetry}>
              retry
            </Button>
          )}
        </Alert>
      </div>
    )
  }

  if (series.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>no event activity to chart</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  const topTypes = byType.slice(0, TOP_TYPES)

  // Every event type present in the file, ordered by total bytes, used as the
  // stack order + legend for the wide chart.
  const allTypes = byType.map((t) => t.type_name)
  const stacked = series.map((b) => {
    const row: Record<string, number> = { t: b.t }
    for (const ty of allTypes) row[ty] = b.by_type?.[ty] ?? 0
    return row
  })

  // Accessible hidden summary table describing chart series for screen readers / colorblind users.
  const writeTotal = byType.filter((b) => b.type_name.startsWith('WRITE_ROWS')).reduce((n, b) => n + b.bytes, 0)
  const deleteTotal = byType.filter((b) => b.type_name.startsWith('DELETE_ROWS')).reduce((n, b) => n + b.bytes, 0)

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      {/* Visually hidden accessible summary for colorblind users - describes the WRITE/DELETE color coding */}
      <table className="sr-only" aria-label="Chart data summary: WRITE_ROWS series (green) vs DELETE_ROWS series (red)">
        <caption>Event bytes by write vs delete operations</caption>
        <thead>
          <tr>
            <th>Series</th>
            <th>Color</th>
            <th>Total bytes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>WRITE_ROWS (inserts)</td>
            <td>green</td>
            <td>{fmtBytes(writeTotal)}</td>
          </tr>
          <tr>
            <td>DELETE_ROWS (deletes)</td>
            <td>red</td>
            <td>{fmtBytes(deleteTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex flex-wrap gap-4">
        <Panel title="events over time" summary={`Event count across ${series.length} time buckets`}>
          <BarChart data={series} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="t" tickFormatter={fmtTime} minTickGap={32} {...AXIS}>
              <Label value="time" offset={-4} position="insideBottom" fill={MUTED} />
            </XAxis>
            <YAxis width="auto" padding={{ top: 12 }} {...AXIS} />
            <Tooltip content={<ChartTooltip time />} />
            <Bar dataKey="count" fill="var(--primary)" />
          </BarChart>
        </Panel>

        <Panel title="bytes/sec over time" summary="Byte throughput over time">
          <BarChart data={series} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="t" tickFormatter={fmtTime} minTickGap={32} {...AXIS}>
              <Label value="time" offset={-4} position="insideBottom" fill={MUTED} />
            </XAxis>
            <YAxis tickFormatter={(v) => fmtBytes(Number(v))} width="auto" padding={{ top: 12 }} {...AXIS} />
            <Tooltip content={<ChartTooltip time bytes />} />
            <Bar dataKey="bytes" fill="var(--primary)" />
          </BarChart>
        </Panel>

        <Panel title="bytes by type" summary="Total bytes per event type">
          <BarChart data={topTypes} layout="vertical" margin={{ top: 4, right: 12, bottom: 20, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" tickFormatter={(v) => fmtBytes(Number(v))} {...AXIS}>
              <Label value="bytes" offset={-4} position="insideBottom" fill={MUTED} />
            </XAxis>
            <YAxis
              type="category"
              dataKey="type_name"
              width={200}
              tick={<TypeTick onSelect={onOpenType} />}
              interval={0}
            />
            <Tooltip content={<ChartTooltip bytes />} />
            <Bar
              dataKey="bytes"
              cursor="pointer"
              onClick={(_, index) => {
                const t = topTypes[index]
                if (t) onOpenType(t.type_name)
              }}
            >
              {topTypes.map((entry) => (
                <Cell key={entry.type_name} fill={colorFor(entry.type_name)} stroke={colorFor(entry.type_name)} />
              ))}
            </Bar>
          </BarChart>
        </Panel>
      </div>

      <Panel
        title="event types over time"
        summary="Counts of every event type stacked over time. WRITE_ROWS shown in green, DELETE_ROWS in red."
        wide
      >
        <BarChart data={stacked} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          {/* Legend at top so it doesn't collide with the bottom "time" axis label. */}
          <Legend verticalAlign="top" onClick={(o) => toggle(String(o.dataKey))} />
          <XAxis dataKey="t" tickFormatter={fmtTime} minTickGap={48} {...AXIS}>
            <Label value="time" offset={-2} position="insideBottom" fill={MUTED} />
          </XAxis>
          <YAxis width="auto" padding={{ top: 12 }} {...AXIS} />
          <Tooltip content={<ChartTooltip time positiveOnly />} />
          {/* Stack order: put DELETE (red) at bottom, WRITE (green) above it so they are not directly adjacent */}
          {allTypes
            .slice()
            .sort((a, b) => {
              const rank = (t: string) => (t.startsWith('DELETE_ROWS') ? 0 : t.startsWith('WRITE_ROWS') ? 2 : 1)
              return rank(a) - rank(b)
            })
            .map((ty) => (
              <Bar key={ty} dataKey={ty} name={ty} stackId="a" fill={colorFor(ty)} hide={hidden[ty]} />
            ))}
        </BarChart>
      </Panel>
    </div>
  )
}
