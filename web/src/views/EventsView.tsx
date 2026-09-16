import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import {
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type SortingState,
} from '@tanstack/react-table'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle, EmptyContent } from '@/components/ui/empty'
import { Table, TableHeader, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import { IconChevronRight, IconChevronUp, IconChevronDown } from '@tabler/icons-react'
import { api } from '../lib/api'
import { useIndexEvent } from '../lib/sse'
import { clickableRow } from '../lib/a11y'
import { fmtBytes } from '../lib/format'
import { readUrlState, writeUrlState } from '../lib/url'
import type { EventRow, Severity } from '../lib/types'
import EventsTable, { type VisualRow } from '../components/EventsTable'
import FilterBar, { type Filters, emptyFilters } from '../components/FilterBar'
import TruncCell from '../components/TruncCell'
import KindBadge from '../components/KindBadge'
import { Warning, WrapArrow } from '../components/icons'

/** Group type used inside the VisualRow union */
// ordinal: a per-file, 1-based transaction number assigned in stream order at
// grouping time. Readable and contiguous for ANY binlog - GTID or not (a
// GTID-less file has no seqno; GTID seqnos can also be huge/non-contiguous on
// replicas). The exact GTID stays visible in each row for precise reference.
type TxnGroup = { txnId: number; ordinal: number; rowId: string; events: EventRow[] }
type EventTreeRow = { id: string; event?: EventRow; group?: TxnGroup; subRows?: EventTreeRow[] }

function kindToDataAttr(typeName: string): string {
  if (typeName.startsWith('WRITE_ROWS_')) return typeName
  if (typeName.startsWith('UPDATE_ROWS_')) return typeName
  if (typeName.startsWith('DELETE_ROWS_')) return typeName
  if (typeName === 'QUERY' || typeName === 'XID' || typeName === 'TABLE_MAP') return typeName
  return 'default'
}

/** Number of body columns (kept in sync with the <colgroup> / colSpan usage). */
const COL_COUNT = 9

function fmtTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

/** Split a comma-separated URL param into a non-empty list. */
function csv(s: string | undefined): string[] {
  return s
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : []
}

/** Derive initial filters from URL params (restored on mount). */
function initialFilters(): Filters {
  const u = readUrlState()
  return {
    ...emptyFilters,
    types: csv(u.type),
    dbs: csv(u.db),
    tables: csv(u.table),
    q: u.q ?? '',
  }
}

export interface EventsViewProps {
  fileId: number
  txnIds: number[]
  dbFilter: string
  tableFilter: string
  typeFilter: string
  selectedPos: number
  onSelect: (e: EventRow) => void
  posSeverity: Map<number, Severity>
  onConsumeFilters: () => void
  onRemoveTxn: (id: number) => void
  live: boolean
  onToggleLive: (live: boolean) => void
}

export default function EventsView(props: EventsViewProps) {
  const { live, onToggleLive } = props
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [events, setEvents] = useState<EventRow[]>([])
  const [nextCursor, setNextCursor] = useState(0)
  const [total, setTotal] = useState(0)
  const [grouped, setGrouped] = useState(true)
  const [expanded, setExpanded] = useState<ExpandedState>(true)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  // refs forwarded into EventsTable so the parent can drive virtualizer + scroll
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const indexEvent = useIndexEvent()
  const lastHandledSeqRef = useRef(0)
  // db / table option lists for the multi-select dropdowns
  const [dbOptions, setDbOptions] = useState<string[]>([])
  const [tableOptions, setTableOptions] = useState<string[]>([])
  // ref to the search-summary input for the `/` shortcut
  const searchRef = useRef<HTMLInputElement>(null)
  // Generation counter: incremented each time a non-append load fires
  const loadGenRef = useRef(0)
  const seenGroupIdsRef = useRef(new Set<string>())

  // Client-side column sort
  const [sorting, setSorting] = useState<SortingState>([])

  useEffect(() => {
    let mounted = true
    api
      .tables(props.fileId)
      .then((stats) => {
        if (!mounted) return
        setDbOptions([...new Set(stats.map((t) => t.db_name).filter(Boolean))].sort())
        setTableOptions([...new Set(stats.map((t) => t.table_name).filter(Boolean))].sort())
      })
      .catch(() => {
        if (mounted) {
          setDbOptions([])
          setTableOptions([])
        }
      })
    return () => {
      mounted = false
    }
  }, [props.fileId])

  // Apply incoming navigation filters once, then tell the parent to clear them
  useEffect(() => {
    if (props.dbFilter || props.tableFilter || props.typeFilter) {
      setFilters((f) => ({
        ...f,
        dbs: props.dbFilter && !f.dbs.includes(props.dbFilter) ? [...f.dbs, props.dbFilter] : f.dbs,
        tables:
          props.tableFilter && !f.tables.includes(props.tableFilter) ? [...f.tables, props.tableFilter] : f.tables,
        types: props.typeFilter && !f.types.includes(props.typeFilter) ? [...f.types, props.typeFilter] : f.types,
      }))
      props.onConsumeFilters()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.dbFilter, props.tableFilter, props.typeFilter])

  // Reset collapsed groups on file switch
  useEffect(() => {
    setExpanded(true)
    seenGroupIdsRef.current.clear()
  }, [props.fileId])

  // Sync filter state to URL
  useEffect(() => {
    writeUrlState({
      file: props.fileId,
      type: filters.types.length ? filters.types.join(',') : undefined,
      db: filters.dbs.length ? filters.dbs.join(',') : undefined,
      table: filters.tables.length ? filters.tables.join(',') : undefined,
      q: filters.q || undefined,
    })
  }, [props.fileId, filters])

  const load = useCallback(
    (fromCursor: number, append: boolean) => {
      if (!append) setLoading(true)
      if (!append) loadGenRef.current += 1
      const gen = loadGenRef.current
      api
        .events({
          file: props.fileId,
          type: filters.types.length ? filters.types.join(',') : undefined,
          db: filters.dbs.length ? filters.dbs.join(',') : undefined,
          table: filters.tables.length ? filters.tables.join(',') : undefined,
          q: filters.q || undefined,
          txn: props.txnIds.length ? props.txnIds.join(',') : undefined,
          from_pos: filters.from_pos || undefined,
          to_pos: filters.to_pos || undefined,
          cursor: live ? undefined : fromCursor || undefined,
          limit: 500,
          tail: live ? 500 : undefined,
        })
        .then((page) => {
          if (loadGenRef.current !== gen) return
          setEvents((prev) => (append ? [...prev, ...page.events] : page.events))
          setNextCursor(page.next_cursor)
          setTotal(page.total)
          setErr('')
        })
        .catch((e: unknown) => {
          if (loadGenRef.current !== gen) return
          setErr(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (!append && loadGenRef.current === gen) setLoading(false)
        })
    },
    [props.fileId, props.txnIds, filters, live],
  )

  useEffect(() => {
    load(0, false)
  }, [load])

  // Live tail: refetch on index_done for the active file only
  useEffect(() => {
    if (!live || !indexEvent) return
    if (indexEvent.type !== 'index_done' || indexEvent.file_id !== props.fileId) return
    if (indexEvent.seq === lastHandledSeqRef.current) return
    lastHandledSeqRef.current = indexEvent.seq
    load(0, false)
  }, [indexEvent, live, props.fileId, load])

  const treeRows = useMemo<EventTreeRow[]>(() => {
    if (!grouped) return events.map((event) => ({ id: `event:${event.pos}`, event }))
    const out: EventTreeRow[] = []
    let ord = 0
    for (const e of events) {
      const tid = e.txn_id ?? 0
      const last = out[out.length - 1]?.group
      if (tid !== 0 && last?.txnId === tid) {
        last.events.push(e)
        out[out.length - 1].subRows!.push({ id: `event:${e.pos}`, event: e })
      } else if (tid === 0) {
        out.push({ id: `event:${e.pos}`, event: e })
      } else {
        const group = { txnId: tid, ordinal: ++ord, rowId: `txn:${tid}:${e.pos}`, events: [e] }
        out.push({ id: group.rowId, group, subRows: [{ id: `event:${e.pos}`, event: e }] })
      }
    }
    return out
  }, [events, grouped])

  const columns = useMemo<ColumnDef<EventTreeRow>[]>(
    () => [
      { id: 'pos', accessorFn: (row) => row.event?.pos ?? row.group?.events[0]?.pos ?? 0 },
      { id: 'ts', accessorFn: (row) => row.event?.ts ?? row.group?.events[0]?.ts ?? 0 },
      { id: 'size', accessorFn: (row) => row.event?.size ?? row.group?.events.reduce((n, e) => n + e.size, 0) ?? 0 },
      {
        id: 'rows',
        accessorFn: (row) => row.event?.rows_count ?? row.group?.events.reduce((n, e) => n + e.rows_count, 0) ?? 0,
      },
    ],
    [],
  )
  const table = useReactTable({
    data: treeRows,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    enableSortingRemoval: false,
    enableMultiSort: false,
    sortDescFirst: false,
  })

  useEffect(() => {
    const groupIds = treeRows.flatMap((row) => (row.group ? [row.id] : []))
    const newGroupIds = groupIds.filter((id) => !seenGroupIdsRef.current.has(id))
    newGroupIds.forEach((id) => seenGroupIdsRef.current.add(id))
    if (newGroupIds.length === 0) return
    setExpanded((current) => {
      if (current === true) return current
      return { ...current, ...Object.fromEntries(newGroupIds.map((id) => [id, true])) }
    })
  }, [treeRows])

  // Flat ordered list of visible event rows (for j/k navigation)
  const flatEvents = useMemo<EventRow[]>(() => {
    return table.getRowModel().rows.flatMap((row) => (row.original.event ? [row.original.event] : []))
  }, [table, sorting, expanded, treeRows])

  // Flatten into one linear list for the virtualizer
  const visualRows = useMemo<VisualRow<TxnGroup, EventRow>[]>(() => {
    const out: VisualRow<TxnGroup, EventRow>[] = []
    for (const row of table.getRowModel().rows) {
      if (row.original.group) out.push({ kind: 'group', g: row.original.group })
      else if (row.original.event) out.push({ kind: 'event', e: row.original.event })
    }
    return out
  }, [table, sorting, expanded, treeRows])

  // pos -> visualRows index, for scrolling a j/k-selected event into view
  const posToVisualIndex = useMemo(() => {
    const m = new Map<number, number>()
    visualRows.forEach((r, i) => {
      if (r.kind === 'event') m.set(r.e.pos, i)
    })
    return m
  }, [visualRows])

  // Auto-scroll to newest row while live
  useEffect(() => {
    if (!live) return
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (nearBottom && visualRows.length > 0) {
      virtualizerRef.current?.scrollToIndex(visualRows.length - 1)
    }
  }, [events, live, visualRows.length])

  const sortIndicator = (key: string) => {
    const sorted = table.getColumn(key)?.getIsSorted()
    return sorted === 'asc' ? <IconChevronUp size={12} /> : sorted === 'desc' ? <IconChevronDown size={12} /> : null
  }
  const ariaSort = (key: string) => {
    const sorted = table.getColumn(key)?.getIsSorted()
    return sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
  }

  // Global keyboard shortcuts: j/k navigation, t toggle, / focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return

      if (e.key === 'j' || e.key === 'k') {
        if (flatEvents.length === 0) return
        const currentIdx = flatEvents.findIndex((ev) => ev.pos === props.selectedPos)
        let nextIdx: number
        if (e.key === 'j') {
          nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, flatEvents.length - 1)
        } else {
          nextIdx = currentIdx <= 0 ? 0 : currentIdx - 1
        }
        const next = flatEvents[nextIdx]
        props.onSelect(next)
        const vIdx = posToVisualIndex.get(next.pos)
        if (vIdx !== undefined) virtualizerRef.current?.scrollToIndex(vIdx, { align: 'auto' })
      } else if (e.key === 't') {
        setGrouped((g) => !g)
      } else if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flatEvents, props.selectedPos, props.onSelect, posToVisualIndex])

  // ── Row renderers ──────────────────────────────────────────────────────────

  const renderGroupRow = (g: TxnGroup, index: number, measureRef: (el: Element | null) => void) => {
    const groupRow = table.getRow(g.rowId)
    const isCollapsed = !groupRow.getIsExpanded()
    const rows = g.events.reduce((n, e) => n + e.rows_count, 0)
    const label = `txn ${g.ordinal}`
    return (
      <TableRow
        key={g.rowId}
        data-index={index}
        ref={measureRef}

        {...clickableRow(groupRow.getToggleExpandedHandler())}
      >
        <TableCell colSpan={COL_COUNT}>
          <span className="inline-flex items-center gap-2">
            <IconChevronRight size={12} className={!isCollapsed ? 'shrink-0 rotate-90' : 'shrink-0'} />
            <span>
              <span className="gtid">{label}</span> · {g.events.length} events · {rows} rows
            </span>
          </span>
        </TableCell>
      </TableRow>
    )
  }

  const renderEventRow = (e: EventRow, index: number, measureRef: (el: Element | null) => void) => {
    const UINT32 = 4294967296
    const wrapped = e.end_pos > e.pos && Math.floor(e.pos / UINT32) !== Math.floor((e.end_pos - 1) / UINT32)
    const wrapTitle =
      'This event straddles a 4 GiB boundary: its on-disk uint32 end_log_pos wraps here ' +
      `(server records it as ${e.end_pos % UINT32}). The viewer shows the TRUE byte offset instead.`
    const tblLabel = [e.db_name, e.table_name].filter(Boolean).join('.')
    return (
      <TableRow
        key={e.pos}
        data-index={index}
        ref={measureRef}
        data-state={e.pos === props.selectedPos ? 'selected' : undefined}
        {...clickableRow(() => props.onSelect(e))}
      >
        <TableCell className="text-center">
          {wrapped ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="text-warning-foreground pos-wrap-marker" aria-label={wrapTitle}>
                    <WrapArrow size={12} />
                  </span>
                }
              />
              <TooltipPopup side="top" align="center">
                {wrapTitle}
              </TooltipPopup>
            </Tooltip>
          ) : (
            props.posSeverity.has(e.pos) && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="text-warning-foreground" aria-label={`anomaly: ${props.posSeverity.get(e.pos)}`}>
                      <Warning size={12} />
                    </span>
                  }
                />
                <TooltipPopup side="top" align="center">
                  {`anomaly: ${props.posSeverity.get(e.pos)}`}
                </TooltipPopup>
              </Tooltip>
            )
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{e.pos}</TableCell>
        <TableCell className="data-text">{fmtTime(e.ts)}</TableCell>
        <TableCell>
          <KindBadge typeName={e.type_name} size="sm" />
        </TableCell>
        <TruncCell label={tblLabel} className="truncate" />
        <TruncCell label={e.summary} className="truncate" fileId={props.fileId} pos={e.pos} />
        <TableCell className="text-right tabular-nums">{e.rows_count > 0 ? e.rows_count : ''}</TableCell>
        <TableCell className="text-right tabular-nums">{fmtBytes(e.size)}</TableCell>
        {wrapped ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <TableCell className="text-right tabular-nums" aria-label={wrapTitle}>
                  {e.end_pos} <WrapArrow size={12} />
                </TableCell>
              }
            />
            <TooltipPopup side="top" align="center">
              {wrapTitle}
            </TooltipPopup>
          </Tooltip>
        ) : (
          <TableCell className="text-right tabular-nums">{e.end_pos}</TableCell>
        )}
      </TableRow>
    )
  }

  // ── Colgroup + thead ───────────────────────────────────────────────────────

  const colgroup = (
    <colgroup>
      <col className="w-7" />
      <col className="w-36" />
      <col className="w-36" />
      <col className="w-44" />
      <col className="w-32" />
      <col />
      <col className="w-24" />
      <col className="w-24" />
      <col className="w-24" />
    </colgroup>
  )

  const thead = (
    <TableHeader>
      <TableRow>
        <TableHead scope="col"></TableHead>
        <TableHead scope="col" aria-sort={ariaSort('pos')}>
          <Button variant="ghost" onClick={table.getColumn('pos')?.getToggleSortingHandler()}>
            start pos{sortIndicator('pos')}
          </Button>
        </TableHead>
        <TableHead scope="col" aria-sort={ariaSort('ts')}>
          <Button variant="ghost" onClick={table.getColumn('ts')?.getToggleSortingHandler()}>
            time{sortIndicator('ts')}
          </Button>
        </TableHead>
        <TableHead scope="col">type</TableHead>
        <TableHead scope="col">db.table</TableHead>
        <TableHead scope="col">summary</TableHead>
        <TableHead scope="col" aria-sort={ariaSort('rows')}>
          <Button variant="ghost" onClick={table.getColumn('rows')?.getToggleSortingHandler()}>
            rows{sortIndicator('rows')}
          </Button>
        </TableHead>
        <TableHead scope="col" aria-sort={ariaSort('size')}>
          <Button variant="ghost" onClick={table.getColumn('size')?.getToggleSortingHandler()}>
            size{sortIndicator('size')}
          </Button>
        </TableHead>
        <TableHead scope="col" className="text-right tabular-nums">
          end pos
        </TableHead>
      </TableRow>
    </TableHeader>
  )

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No events match these filters.</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          onClick={() => {
            setFilters(emptyFilters)
            props.txnIds.forEach(props.onRemoveTxn)
          }}
        >
          clear filters
        </Button>
      </EmptyContent>
    </Empty>
  )

  return (
    <>
      <FilterBar
        filters={filters}
        grouped={grouped}
        txnIds={props.txnIds}
        dbOptions={dbOptions}
        tableOptions={tableOptions}
        onChange={setFilters}
        onRemoveTxn={props.onRemoveTxn}
        onToggleGrouped={() => setGrouped((g) => !g)}
        onJump={(pos) => setFilters((f) => ({ ...f, from_pos: pos, to_pos: 0 }))}
        searchRef={searchRef}
        live={props.live}
        onToggleLive={props.onToggleLive}
      />
      {err && (
        <Alert variant="error" className="flex items-center justify-between">
          <span>{err}</span>
          <Button variant="outline" onClick={() => load(0, false)}>
            retry
          </Button>
        </Alert>
      )}
      <EventsTable<TxnGroup, EventRow>
        visualRows={visualRows}
        renderEventRow={renderEventRow}
        renderGroupRow={renderGroupRow}
        colgroup={colgroup}
        thead={thead}
        colCount={COL_COUNT}
        emptyState={emptyState}
        loading={loading}
        virtualizerRef={virtualizerRef}
        scrollRef={scrollRef}
        getItemKey={(i, r) => (r.kind === 'group' ? r.g.rowId : `e${r.e.pos}`)}
      />
      {!loading && !live && nextCursor > 0 && (
        <Button
          className="mx-auto my-3"
          variant="ghost"
          onClick={() => load(nextCursor, true)}
          aria-label={`load more (${events.length} / ${total})`}
        >
          load more ({events.length} / {total})
        </Button>
      )}
      <div className="flex shrink-0 flex-wrap gap-4 border-t p-3">
        <span>
          {live ? `${events.length} events (live)` : `${total} events`}
          {props.txnIds.length ? ` · ${props.txnIds.length} txn filter${props.txnIds.length > 1 ? 's' : ''}` : ''}
        </span>
      </div>
    </>
  )
}
