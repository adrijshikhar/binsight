import { useRef, useEffect } from 'react'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table'

// The two kinds of visual rows EventsView produces
export type VisualRow<G, E> = { kind: 'group'; g: G } | { kind: 'event'; e: E }

export interface EventsTableProps<G, E> {
  /** Flat array of visual rows (group headers + event rows) */
  visualRows: VisualRow<G, E>[]
  /** Estimated row height in px for the virtualizer */
  estimateSize?: number
  /** Render an event row - receives the event, its absolute index, and the measureRef callback */
  renderEventRow: (e: E, index: number, measureRef: (el: Element | null) => void) => React.ReactNode
  /** Render a group header row - receives the group, its absolute index, and the measureRef callback */
  renderGroupRow: (g: G, index: number, measureRef: (el: Element | null) => void) => React.ReactNode
  /** The table's <colgroup> content (caller provides column defs) */
  colgroup?: React.ReactNode
  /** The table's <thead> content */
  thead?: React.ReactNode
  /** Number of columns (for colSpan on spacer rows). Default: 9 */
  colCount?: number
  /** Content to show when no rows and not loading (empty state node) */
  emptyState?: React.ReactNode
  /** Loading state - show skeleton rows */
  loading?: boolean
  /** Expose the virtualizer so parent can call scrollToIndex etc */
  virtualizerRef?: React.RefObject<Virtualizer<HTMLDivElement, Element> | null>
  /** Expose the scroll container ref so parent can read scrollTop etc */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  /** Optional stable key function for the virtualizer */
  getItemKey?: (index: number, row: VisualRow<G, E>) => string | number
}

const SKELETON_COUNT = 8

export default function EventsTable<G, E>({
  visualRows,
  estimateSize = 32,
  renderEventRow,
  renderGroupRow,
  colgroup,
  thead,
  colCount = 9,
  emptyState,
  loading = false,
  virtualizerRef,
  scrollRef,
  getItemKey,
}: EventsTableProps<G, E>) {
  const internalScrollRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: loading ? 0 : visualRows.length,
    getScrollElement: () => internalScrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 12,
    getItemKey: getItemKey ? (i) => getItemKey(i, visualRows[i]) : undefined,
  })

  // Expose scroll container ref to parent. Runs unconditionally every render so
  // the forwarded ref is always current - internalScrollRef.current is set once
  // (on mount) and never changes, but the parent ref prop itself may be a new
  // object reference after each render, so we cannot list it as a dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (scrollRef) {
      ;(scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = internalScrollRef.current
    }
  })

  // Expose virtualizer to parent. Runs every render because rowVirtualizer is a
  // new object on each render (react-virtual rebuilds it); listing it would cause
  // an infinite loop. The parent relies on always reading the latest instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (virtualizerRef) {
      ;(virtualizerRef as React.MutableRefObject<Virtualizer<HTMLDivElement, Element> | null>).current = rowVirtualizer
    }
  })

  const measureRef = rowVirtualizer.measureElement

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length ? virtualItems[0].start : 0
  const lastItem = virtualItems[virtualItems.length - 1]
  const paddingBottom = lastItem ? totalSize - (lastItem.start + lastItem.size) : 0

  return (
    <div className="min-h-0 flex-1 overflow-auto" ref={internalScrollRef}>
      <Table
        className="min-w-[960px] table-fixed [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:whitespace-nowrap"
        data-density="compact"
        render={<div className="contents" />}
      >
        {colgroup}
        {thead}
        <TableBody>
          {loading ? (
            Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={colCount}>
                  <span>loading events…</span>
                </TableCell>
              </TableRow>
            ))
          ) : visualRows.length === 0 ? (
            emptyState ? (
              <TableRow>
                <TableCell colSpan={colCount}>{emptyState}</TableCell>
              </TableRow>
            ) : null
          ) : (
            <>
              {paddingTop > 0 && (
                <tr className="[&>td]:border-0 [&>td]:p-0" style={{ height: paddingTop }}>
                  <td colSpan={colCount} />
                </tr>
              )}
              {virtualItems.map((vi) => {
                const r = visualRows[vi.index]
                if (r.kind === 'group') {
                  return renderGroupRow(r.g, vi.index, measureRef)
                }
                return renderEventRow(r.e, vi.index, measureRef)
              })}
              {paddingBottom > 0 && (
                <tr className="[&>td]:border-0 [&>td]:p-0" style={{ height: paddingBottom }}>
                  <td colSpan={colCount} />
                </tr>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
