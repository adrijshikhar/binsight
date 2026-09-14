import { Fragment, useEffect, useState } from 'react'
import type React from 'react'
import { IconX } from '@tabler/icons-react'
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
import DiffView, { BaGrid, BaWrap, KV, RowImages, RowLabel, RowNav } from './DiffView'
import styles from './Drawer.module.css'

type Tab = 'details' | 'diff' | 'hex' | 'json'

export interface DrawerProps {
  fileId: number
  event: EventRow
  width: number
  onResizeStart: (e: React.PointerEvent) => void
  onWidthChange: (w: number) => void
  onClose: () => void
}

/**
 * Drawer - aside pane with four tabs: Details / Diff / Hex / Raw JSON.
 *
 * Prop interface is identical to the oracle Drawer so it can be dropped in
 * as a direct replacement. The resize handle, header, pos-wrap panel, and
 * all tab bodies are ported from the oracle; styles live in co-located CSS
 * Modules (Drawer.module.css, HexView.module.css, DiffView.module.css).
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
    <aside className={styles.drawer} style={{ width }} aria-label="Event inspector">
      {/* Resize handle - drag leftward to widen the panel */}
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={styles.drawerResize}
              onPointerDown={onResizeStart}
              onKeyDown={(e: React.KeyboardEvent) => {
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
              aria-valuenow={width}
              aria-valuemin={DRAWER_MIN_WIDTH}
              aria-valuemax={DRAWER_MAX_WIDTH}
              tabIndex={0}
            />
          }
        />
        <TooltipPopup>Drag or use Arrow keys to resize</TooltipPopup>
      </Tooltip>

      {/* Header */}
      <div className={styles.drawerHdr}>
        <div className={styles.drawerHdrRow}>
          <div className={styles.drawerHdrCol}>
            <div className={styles.drawerHdrType}>
              <KindBadge typeName={event.type_name} size="sm" />
              {wrapped && (
                <span className={styles.wrapTag}>
                  <WrapArrow size={13} /> 4 GiB wrap
                </span>
              )}
            </div>
            <div className={styles.drawerHdrSub}>
              pos {event.pos} &rarr; {event.end_pos} &middot; {[event.db_name, event.table_name].filter(Boolean).join('.')}{' '}
              &middot; {fmtBytes(event.size)}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close drawer"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <IconX className="size-4" />
          </Button>
        </div>
      </div>

      {/* pos-wrap explainer */}
      {wrapped && (
        <div className={styles.wrapPanel}>
          <div className={styles.wrapPanelTitle}>
            <WrapArrow /> uint32 end_log_pos overflow - this event crosses 4 GiB
          </div>
          <p>
            This event&apos;s byte range spans the {fmtBytes(boundary)} ({boundary.toLocaleString()}) mark. The binlog
            event header stores <code>end_log_pos</code> as a <strong>uint32</strong>, which wraps at 4 GiB, so on disk
            the server records this event&apos;s end position as the small value below - not its real offset.
          </p>
          <table className={styles.wrapKv}>
            <tbody>
              <tr>
                <td>True end offset (shown here)</td>
                <td className={styles.num}>{event.end_pos.toLocaleString()}</td>
              </tr>
              <tr className={styles.bad}>
                <td>On-disk end_log_pos (server, uint32)</td>
                <td className={styles.num}>{wrappedEndPos.toLocaleString()}</td>
              </tr>
              <tr>
                <td>4 GiB boundary crossed</td>
                <td className={styles.num}>{boundary.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.wrapNote}>
            The viewer reconstructs the true offset with a running byte accumulator, so positions stay monotonic. Using
            the raw wrapped value (as MySQL&apos;s own <code>mysqlbinlog</code> does) would make every event after this
            one collide with early-file positions and the file would re-index endlessly. Only files &gt; 4 GiB hit this
            - and only a single transaction &gt; 4 GiB can produce such a file (rotation defers until COMMIT).
          </p>
        </div>
      )}

      {/* Per-tab error banner */}
      {err && (
        <Alert variant="error" className="rounded-none border-x-0 border-t-0 flex items-center justify-between py-2 px-4">
          <span className="text-xs font-mono">{err}</span>
          <Button
            size="xs"
            variant="outline"
            onClick={tab === 'diff' ? fetchDiff : fetchDetail}
          >
            retry
          </Button>
        </Alert>
      )}

      {/* Tab strip + panels */}
      <Tabs
        value={tab}
        onValueChange={(v) => v && setTab(v as Tab)}
        className={styles.drawerTabsRoot}
      >
        <TabsList
          variant="underline"
          size="sm"
          className={styles.drawerTabsList}
          aria-label="Event inspector"
        >
          {tabs.map((t) => (
            <TabsTab key={t} value={t} className="font-mono text-xs">
              {tabLabel(t)}
            </TabsTab>
          ))}
        </TabsList>

        <TabsPanel value="details" className={styles.drawerBody}>
          <DetailsTab detail={detail} />
        </TabsPanel>

        <TabsPanel value="diff" className={styles.drawerBody}>
          <DiffView diff={diff} />
        </TabsPanel>

        <TabsPanel value="hex" className={styles.drawerBody}>
          <HexView fileId={fileId} pos={event.pos} />
        </TabsPanel>

        <TabsPanel value="json" className={styles.drawerBody}>
          {detail ? (
            <pre className={styles.jsonPane}>{JSON.stringify(detail, null, 2)}</pre>
          ) : (
            <div className={styles.muted}>loading…</div>
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
  if (!detail) return <div className="text-muted">loading&hellip;</div>
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
          <pre className={styles.monoBlock}>{d.sql}</pre>
        </>
      ) : (
        <div className="text-muted">empty query event</div>
      )
    case 'FORMAT_DESCRIPTION':
    case 'ROTATE':
    case 'PREVIOUS_GTIDS':
    case 'ROWS_QUERY':
    case 'STOP':
      return d?.sql ? (
        <pre className={styles.monoBlock}>{d.sql}</pre>
      ) : (
        <div className="text-muted">no decoded payload - see Hex / Raw JSON</div>
      )
    default:
      return <div className="text-muted">no decoded payload for {type} - see Hex / Raw JSON</div>
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
        <BaWrap>
          <RowLabel>column types</RowLabel>
          <BaGrid columns="1fr 1fr">
            <div className={styles.cellHead}>{names.length > 0 ? 'column' : 'col'}</div>
            <div className={styles.cellHead}>type</div>
            {cols.map((c, i) => (
              <Fragment key={i}>
                <div className={styles.cell}>{names[i] || `@${i + 1}`}</div>
                <div className={styles.cellVal}>{c}</div>
              </Fragment>
            ))}
          </BaGrid>
        </BaWrap>
      )}
    </>
  )
}
