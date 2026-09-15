import { useEffect, useState } from 'react'
import type React from 'react'
import { XIcon } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import { api } from '../lib/api'
import { clampDrawerWidth, DRAWER_MIN_WIDTH, DRAWER_MAX_WIDTH } from '../lib/sidebarPrefs'
import { fmtBytes } from '../lib/format'
import { WrapArrow } from './icons'
import KindBadge from './KindBadge'
import type { DiffResult, EventDetail, EventRow } from '../lib/types'
import HexView from './HexView'
import DiffView, { KV, RowImages, RowNav } from './DiffView'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from '@/components/ui/table'

type Tab = 'details' | 'diff' | 'hex' | 'json'

export interface DrawerProps {
  fileId: number
  event: EventRow
  width?: number | string
  onResizeStart?: (e: React.PointerEvent) => void
  onWidthChange?: (w: number) => void
  onClose: () => void
}

/**
 * Drawer - aside pane with four tabs: Details / Diff / Hex / Raw JSON.
 *
 * Retains Binsight resizing and lazy-loaded forensic views.
 */
export default function Drawer({ fileId, event, width, onResizeStart, onWidthChange, onClose }: DrawerProps) {
  const [tab, setTab] = useState<Tab>('details')
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  // Per-tab error state: each tab tracks its own fetch error so the retry
  // button in the banner always targets the active tab's request.
  const [tabErr, setTabErr] = useState<Partial<Record<Tab, string>>>({})

  const setErr = (t: Tab, msg: string) => setTabErr((prev) => ({ ...prev, [t]: msg }))
  const clearErr = (t: Tab) => setTabErr((prev) => ({ ...prev, [t]: '' }))
  const err = tabErr[tab] ?? ''

  const fetchDetail = () => {
    let cancelled = false
    setDetail(null)
    setDiff(null)
    setTabErr({})
    api
      .detail(fileId, event.pos)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr('details', e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }

  const fetchDiff = () => {
    let cancelled = false
    clearErr('diff')
    api
      .diff(fileId, event.pos)
      .then((d) => {
        if (!cancelled) setDiff(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr('diff', e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }

  // Reset panes and re-fetch details whenever the selected event changes.
  // Tab is intentionally NOT reset so navigating keeps the user on Hex/Diff/JSON.
  useEffect(fetchDetail, [fileId, event.pos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-fetch the diff pane the first time it is opened.
  useEffect(() => {
    if (tab === 'diff' && !diff && !tabErr['diff']) {
      return fetchDiff()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fileId, event.pos, diff])

  // Does this event straddle a 4 GiB boundary? See CLAUDE.md "Binlog format gotchas".
  const UINT32 = 4294967296
  const wrapped =
    event.end_pos > event.pos && Math.floor(event.pos / UINT32) !== Math.floor((event.end_pos - 1) / UINT32)
  const boundary = Math.floor((event.end_pos - 1) / UINT32) * UINT32
  const wrappedEndPos = event.end_pos - boundary

  const tabs: Tab[] = ['details', 'diff', 'hex', 'json']
  const tabLabel = (t: Tab) => (t === 'details' ? 'Details' : t === 'diff' ? 'Diff' : t === 'hex' ? 'Hex' : 'Raw JSON')

  return (
    <aside
      className="relative flex h-full min-w-0 flex-col bg-background"
      style={{ width: width ?? '100%' }}
      aria-label="Event inspector"
    >
      {/* Resize handle - drag leftward to widen the panel */}
      {onResizeStart && (
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
                onPointerDown={onResizeStart}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (!onWidthChange || typeof width !== 'number') return
                  const STEP = 20
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    onWidthChange(clampDrawerWidth(width + STEP))
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    onWidthChange(clampDrawerWidth(width - STEP))
                  }
                }}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize details panel"
                aria-valuenow={typeof width === 'number' ? width : undefined}
                aria-valuemin={DRAWER_MIN_WIDTH}
                aria-valuemax={DRAWER_MAX_WIDTH}
                tabIndex={0}
              />
            }
          />
          <TooltipPopup>Drag or use Arrow keys to resize</TooltipPopup>
        </Tooltip>
      )}

      {/* Header */}
      <div className="shrink-0 border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div>
              <KindBadge typeName={event.type_name} size="sm" />
              {wrapped && (
                <span className="ml-2 text-warning-foreground">
                  <WrapArrow size={13} /> 4 GiB wrap
                </span>
              )}
            </div>
            <div className="mt-1 data-text">
              pos {event.pos} &rarr; {event.end_pos} &middot;{' '}
              {[event.db_name, event.table_name].filter(Boolean).join('.')} &middot; {fmtBytes(event.size)}
            </div>
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="Close drawer" onClick={onClose}>
            <XIcon />
          </Button>
        </div>
      </div>

      {/* pos-wrap explainer */}
      {wrapped && (
        <div className="m-4 space-y-2">
          <div className="text-warning-foreground">
            <WrapArrow /> uint32 end_log_pos overflow - this event crosses 4 GiB
          </div>
          <p>
            This event&apos;s byte range spans the {fmtBytes(boundary)} ({boundary.toLocaleString()}) mark. The binlog
            event header stores <code>end_log_pos</code> as a <strong>uint32</strong>, which wraps at 4 GiB, so on disk
            the server records this event&apos;s end position as the small value below - not its real offset.
          </p>
          <KV
            pairs={[
              ['True end offset (shown here)', event.end_pos.toLocaleString()],
              ['On-disk end_log_pos (server, uint32)', wrappedEndPos.toLocaleString()],
              ['4 GiB boundary crossed', boundary.toLocaleString()],
            ]}
          />
          <p>
            The viewer reconstructs the true offset with a running byte accumulator, so positions stay monotonic. Using
            the raw wrapped value (as MySQL&apos;s own <code>mysqlbinlog</code> does) would make every event after this
            one collide with early-file positions and the file would re-index endlessly. Only files &gt; 4 GiB hit this
            - and only a single transaction &gt; 4 GiB can produce such a file (rotation defers until COMMIT).
          </p>
        </div>
      )}

      {/* Per-tab error banner */}
      {err && (
        <Alert variant="error" className="flex items-center justify-between">
          <span>{err}</span>
          <Button variant="outline" onClick={tab === 'diff' ? fetchDiff : fetchDetail}>
            retry
          </Button>
        </Alert>
      )}

      {/* Tab strip + panels */}
      <Tabs value={tab} onValueChange={(v) => v && setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList variant="underline" size="sm" className="shrink-0" aria-label="Event inspector">
          {tabs.map((t) => (
            <TabsTab key={t} value={t}>
              {tabLabel(t)}
            </TabsTab>
          ))}
        </TabsList>

        <TabsPanel value="details" className="min-h-0 flex-1 overflow-auto p-4">
          <DetailsTab detail={detail} />
        </TabsPanel>

        <TabsPanel value="diff" className="min-h-0 flex-1 overflow-auto p-4">
          <DiffView diff={diff} />
        </TabsPanel>

        <TabsPanel value="hex" className="min-h-0 flex-1 overflow-auto p-4">
          <HexView fileId={fileId} pos={event.pos} />
        </TabsPanel>

        <TabsPanel value="json" className="min-h-0 flex-1 overflow-auto p-4">
          {detail ? (
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(detail, null, 2)}</pre>
          ) : (
            <div>loading…</div>
          )}
        </TabsPanel>
      </Tabs>
    </aside>
  )
}

// ── DetailsTab ────────────────────────────────────────────────────────────

/**
 * DetailsTab renders the event's decoded payload appropriately for its type:
 * row images for DML, the table-id↔name mapping for TABLE_MAP, the GTID/XID/SQL
 * for transaction-control and DDL events.
 */
function DetailsTab({ detail }: { detail: EventDetail | null }) {
  if (!detail) return <div>loading&hellip;</div>
  const d = detail.decoded
  const type = detail.header.type_name

  if (d && d.rows && d.rows.length > 0) {
    return <RowImages rows={d.rows} colTypes={d.column_types ?? []} />
  }

  switch (type) {
    case 'TABLE_MAP':
      return <TableMapPanel detail={detail} />
    case 'GTID':
    case 'ANONYMOUS_GTID':
      return <KV pairs={[['GTID', d?.gtid ?? 'ANONYMOUS']]} note="transaction boundary marker" />
    case 'XID':
      return <KV pairs={[['Xid', String(d?.xid ?? '')]]} note="commit marker - closes the transaction" />
    case 'QUERY':
      return d?.sql ? (
        <>
          <RowNav>{d.db ? `database: ${d.db}` : 'statement'}</RowNav>
          <pre className="whitespace-pre-wrap break-all">{d.sql}</pre>
        </>
      ) : (
        <div>empty query event</div>
      )
    case 'FORMAT_DESCRIPTION':
    case 'ROTATE':
    case 'PREVIOUS_GTIDS':
    case 'ROWS_QUERY':
    case 'STOP':
      return d?.sql ? (
        <pre className="whitespace-pre-wrap break-all">{d.sql}</pre>
      ) : (
        <div>no decoded payload - see Hex / Raw JSON</div>
      )
    default:
      return <div>no decoded payload for {type} - see Hex / Raw JSON</div>
  }
}

// ── TableMapPanel ─────────────────────────────────────────────────────────

/**
 * TableMapPanel shows the table_id → db.table mapping plus the numbered
 * column type list declared by this TABLE_MAP event.
 */
function TableMapPanel({ detail }: { detail: EventDetail }) {
  const d = detail.decoded
  const cols = d?.column_types ?? []
  const names = d?.column_names ?? []
  return (
    <>
      <RowNav>table identity mapping (no row data on this event)</RowNav>
      <KV
        pairs={[
          ['table_id', String(d?.table_id ?? '')],
          ['database', d?.db ?? ''],
          ['table', d?.table ?? ''],
          ['columns', String(cols.length)],
        ]}
      />
      {cols.length > 0 && (
        <Table className="my-4">
          <TableCaption>column types</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{names.length > 0 ? 'column' : 'col'}</TableHead>
              <TableHead>type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cols.map((c, i) => (
              <TableRow key={i}>
                <TableCell>{names[i] || `@${i + 1}`}</TableCell>
                <TableCell>{c}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
