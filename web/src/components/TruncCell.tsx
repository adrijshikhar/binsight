import { useRef, useState } from 'react'
import { Table, Tooltip } from '@mantine/core'
import { api } from '../lib/api'

interface TruncCellProps {
  /** Preview text rendered in the cell (may be a server-truncated summary). */
  label: string
  className: string
  /**
   * When both are set, the tooltip lazily fetches the event detail on first
   * hover and shows the COMPLETE decoded statement (decoded.sql) instead of the
   * truncated preview — used for QUERY/DDL summary columns whose cell text ends
   * in `…`. Omit for columns whose text is already complete (e.g. db.table).
   */
  fileId?: number
  pos?: number
  /** Render the cell text in the monospace font (for SQL / code columns). */
  mono?: boolean
}

/**
 * A truncating table cell with a STATIC (anchored, not cursor-following) tooltip
 * shown ONLY when the text is actually clipped (scrollWidth > clientWidth),
 * measured on hover so it stays correct as the column resizes. Shared by every
 * truncating column so tooltip behavior is consistent app-wide; width/wrap come
 * from the global Tooltip theme config. With fileId+pos it upgrades the tooltip
 * to the full decoded statement (see above).
 */
export default function TruncCell({ label, className, fileId, pos, mono }: TruncCellProps) {
  const ref = useRef<HTMLTableCellElement>(null)
  const [truncated, setTruncated] = useState(false)
  const [full, setFull] = useState<string | null>(null)

  const onEnter = () => {
    const el = ref.current
    const isTrunc = el ? el.scrollWidth > el.clientWidth + 1 : false
    setTruncated(isTrunc)
    // Only fetch the full statement for a clipped cell that opted in (fileId+pos).
    if (isTrunc && fileId != null && pos != null && full === null) {
      setFull('') // mark in-flight so we don't refetch on every re-hover
      api
        .detail(fileId, pos)
        .then((d) => setFull(d.decoded?.sql || label))
        .catch(() => setFull(label))
    }
  }

  const tip = full ? full : label
  return (
    <Tooltip label={tip} disabled={!label || !truncated} position="top-start" openDelay={200} withinPortal>
      <Table.Td
        ref={ref}
        className={className}
        ff={mono ? 'monospace' : undefined}
        aria-label={label || undefined}
        onMouseEnter={onEnter}
      >
        {label}
      </Table.Td>
    </Tooltip>
  )
}
