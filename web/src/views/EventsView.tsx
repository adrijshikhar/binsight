import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { Alert, Badge, Button, Table, Tooltip } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import '../components/table-utils.module.css'
import { api } from '../lib/api'
import { useIndexEvent } from '../lib/sse'
import { clickable, clickableRow } from '../lib/a11y'
import { fmtBytes } from '../lib/format'
import { readUrlState, writeUrlState } from '../lib/url'
import type { EventRow, Severity } from '../lib/types'
import EventsTable, { type VisualRow } from '../components/EventsTable'
import FilterBar, { type Filters, emptyFilters } from '../components/FilterBar'
import TruncCell from '../components/TruncCell'
import { Warning, WrapArrow, kindBadgeStyle } from '../components/icons'

/** Columns that can be sorted client-side. Unsorted = stream/load order (default). */
type SortKey = 'pos' | 'ts' | 'size' | 'rows'

/** Group type used inside the VisualRow union */
// ordinal: a per-file, 1-based transaction number assigned in stream order at
// grouping time. Readable and contiguous for ANY binlog — GTID or not (a
// GTID-less file has no seqno; GTID seqnos can also be huge/non-contiguous on
// replicas). The exact GTID stays visible in each row for precise reference.
type TxnGroup = { txnId: number; ordinal: number; events: EventRow[] }

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
}

export default function EventsView(props: EventsViewProps) {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [events, setEvents] = useState<EventRow[]>([])
  const [nextCursor, setNextCursor] = useState(0)
  const [total, setTotal] = useState(0)
  const [grouped, setGrouped] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
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

  // Client-side column sort
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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
    setCollapsed(new Set())
  }, [props.fileId])

  // Live/follow is per-file: switching files must reset it
  useEffect(() => {
    setLive(false)
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

  // Sorted copy of events for display
  const sortedEvents = useMemo<EventRow[]>(() => {
    if (!sortKey) return events
    const s = [...events]
    s.sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case 'pos':
          diff = a.pos - b.pos
          break
        case 'ts':
          diff = a.ts - b.ts
          break
        case 'size':
          diff = a.size - b.size
          break
        case 'rows':
          diff = a.rows_count - b.rows_count
          break
      }
      return sortDir === 'asc' ? diff : -diff
    })
    return s
  }, [events, sortKey, sortDir])

  const groups = useMemo(() => {
    if (!grouped) return null
    const out: TxnGroup[] = []
    let ord = 0
    for (const e of sortedEvents) {
      const tid = e.txn_id ?? 0
      const last = out[out.length - 1]
      if (last && last.txnId === tid) last.events.push(e)
      else out.push({ txnId: tid, ordinal: tid !== 0 ? ++ord : 0, events: [e] })
    }
    return out
  }, [sortedEvents, grouped])

  // Flat ordered list of visible event rows (for j/k navigation)
  const flatEvents = useMemo<EventRow[]>(() => {
    if (!grouped || !groups) return sortedEvents
    const out: EventRow[] = []
    for (const g of groups) {
      if (g.txnId === 0 || !collapsed.has(g.txnId)) {
        for (const e of g.events) out.push(e)
      }
    }
    return out
  }, [sortedEvents, grouped, groups, collapsed])

  // Flatten into one linear list for the virtualizer
  const visualRows = useMemo<VisualRow<TxnGroup, EventRow>[]>(() => {
    const out: VisualRow<TxnGroup, EventRow>[] = []
    if (grouped && groups) {
      for (const g of groups) {
        if (g.txnId !== 0) out.push({ kind: 'group', g })
        if (g.txnId === 0 || !collapsed.has(g.txnId)) {
          for (const e of g.events) out.push({ kind: 'event', e })
        }
      }
    } else {
      for (const e of sortedEvents) out.push({ kind: 'event', e })
    }
    return out
  }, [grouped, groups, collapsed, sortedEvents])

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

  /** Toggle sort: same key → flip direction; different key → asc. */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  /** Render a caret for the active sort column. */
  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (
      <IconChevronRight
        size={12}
        className="sort-caret"
        style={{ transform: sortDir === 'asc' ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s ease' }}
      />
    ) : null

  /** Props to spread onto a sortable <th>. */
  const sortableProps = (key: SortKey) => ({
    'data-sortable': true,
    'aria-sort':
      sortKey === key ? (sortDir === 'asc' ? ('ascending' as const) : ('descending' as const)) : ('none' as const),
    ...clickable(() => handleSort(key)),
  })

  const toggleCollapsed = (txnId: number) =>
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(txnId)) n.delete(txnId)
      else n.add(txnId)
      return n
    })

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
    const isCollapsed = collapsed.has(g.txnId)
    const rows = g.events.reduce((n, e) => n + e.rows_count, 0)
    const label = `txn ${g.ordinal}`
    return (
      <Table.Tr
        key={`g${g.txnId}`}
        data-index={index}
        ref={measureRef}
        className="txn-hdr"
        {...clickableRow(() => toggleCollapsed(g.txnId))}
      >
        <Table.Td colSpan={COL_COUNT}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconChevronRight
              size={12}
              className="caret"
              style={{
                transform: !isCollapsed ? 'rotate(90deg)' : undefined,
                transition: 'transform 0.15s ease',
                flexShrink: 0,
              }}
            />
            <span>
              <span className="gtid">{label}</span> · {g.events.length} events · {rows} rows
            </span>
          </span>
        </Table.Td>
      </Table.Tr>
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
      <Table.Tr
        key={e.pos}
        data-index={index}
        ref={measureRef}
        className={`${index % 2 ? 'zebra-odd' : ''}${e.pos === props.selectedPos ? ' selected' : ''}${wrapped ? ' pos-wrap-row' : ''}`}
        {...clickableRow(() => props.onSelect(e))}
      >
        <Table.Td className="anom-marker">
          {wrapped ? (
            <Tooltip label={wrapTitle} openDelay={150} withinPortal>
              <span className="warn pos-wrap-marker" aria-label={wrapTitle}>
                <WrapArrow size={12} />
              </span>
            </Tooltip>
          ) : (
            props.posSeverity.has(e.pos) && (
              <Tooltip label={`anomaly: ${props.posSeverity.get(e.pos)}`} openDelay={150} withinPortal>
                <span
                  className={`warn sev-${props.posSeverity.get(e.pos)}`}
                  aria-label={`anomaly: ${props.posSeverity.get(e.pos)}`}
                >
                  <Warning size={12} />
                </span>
              </Tooltip>
            )
          )}
        </Table.Td>
        <Table.Td className="pos num">{e.pos}</Table.Td>
        <Table.Td>{fmtTime(e.ts)}</Table.Td>
        <Table.Td>
          <Badge variant="light" size="sm" style={{ ...kindBadgeStyle(e.type_name), cursor: 'inherit' }}>
            {e.type_name}
          </Badge>
        </Table.Td>
        <TruncCell label={tblLabel} className="tbl" />
        <TruncCell label={e.summary} className="summary" fileId={props.fileId} pos={e.pos} />
        <Table.Td className="num">{e.rows_count > 0 ? e.rows_count : ''}</Table.Td>
        <Table.Td className="num">{fmtBytes(e.size)}</Table.Td>
        <Tooltip label={wrapped ? wrapTitle : undefined} openDelay={150} withinPortal disabled={!wrapped}>
          <Table.Td className="pos num" aria-label={wrapped ? wrapTitle : undefined}>
            {e.end_pos}
            {wrapped && (
              <>
                {' '}
                <WrapArrow size={12} />
              </>
            )}
          </Table.Td>
        </Tooltip>
      </Table.Tr>
    )
  }

  // ── Colgroup + thead ───────────────────────────────────────────────────────

  const colgroup = (
    <colgroup>
      <col style={{ width: 26 }} />
      <col style={{ width: 100 }} />
      <col style={{ width: 140 }} />
      <col style={{ width: 120 }} />
      <col style={{ width: 130 }} />
      <col />
      <col style={{ width: 55 }} />
      <col style={{ width: 75 }} />
      <col style={{ width: 100 }} />
    </colgroup>
  )

  const thead = (
    <Table.Thead>
      <Table.Tr>
        <Table.Th scope="col"></Table.Th>
        <Table.Th scope="col" className="num" {...sortableProps('pos')}>
          start pos{sortIndicator('pos')}
        </Table.Th>
        <Table.Th scope="col" {...sortableProps('ts')}>
          time{sortIndicator('ts')}
        </Table.Th>
        <Table.Th scope="col">type</Table.Th>
        <Table.Th scope="col">db.table</Table.Th>
        <Table.Th scope="col">summary</Table.Th>
        <Table.Th scope="col" className="num" {...sortableProps('rows')}>
          rows{sortIndicator('rows')}
        </Table.Th>
        <Table.Th scope="col" className="num" {...sortableProps('size')}>
          size{sortIndicator('size')}
        </Table.Th>
        <Table.Th scope="col" className="num">
          end pos
        </Table.Th>
      </Table.Tr>
    </Table.Thead>
  )

  const emptyState = (
    <div className="empty-state">
      <span>No events match these filters.</span>
      <button
        onClick={() => {
          setFilters(emptyFilters)
          props.txnIds.forEach(props.onRemoveTxn)
        }}
      >
        clear filters
      </button>
    </div>
  )

  return (
    <>
      <FilterBar
        live={live}
        onToggleLive={setLive}
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
      />
      {err && (
        <Alert color="red" role="alert" mb={0} radius={0} style={{ borderBottom: '1px solid var(--border)' }}>
          {err}
          <Button size="xs" variant="outline" color="blue" ml="xs" onClick={() => load(0, false)}>
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
        getItemKey={(i, r) => (r.kind === 'group' ? `g${r.g.txnId}` : `e${r.e.pos}`)}
      />
      {!loading && !live && nextCursor > 0 && (
        <Button
          className="load-more"
          variant="subtle"
          size="xs"
          onClick={() => load(nextCursor, true)}
          aria-label={`load more (${events.length} / ${total})`}
        >
          load more ({events.length} / {total})
        </Button>
      )}
      <div className="statusbar">
        <span>
          {live ? `${events.length} events (live)` : `${total} events`}
          {props.txnIds.length ? ` · ${props.txnIds.length} txn filter${props.txnIds.length > 1 ? 's' : ''}` : ''}
        </span>
      </div>
    </>
  )
}
