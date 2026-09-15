import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickableRow } from '../lib/a11y'
import type { EventRow } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import TruncCell from '../components/TruncCell'
import KindBadge from '../components/KindBadge'

const DDL_PREFIXES = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE']

function ddlKind(sql: string): string | null {
  const u = sql.trim().toUpperCase()
  return DDL_PREFIXES.find((p) => u.startsWith(p)) ?? null
}

// Split a unix-seconds timestamp into [date, clock] so the time column can
// render two clean lines (date over clock) instead of wrapping mid-token.
function fmtTimeParts(ts: number): [string, string] {
  if (!ts) return ['', '']
  const iso = new Date(ts * 1000).toISOString()
  return [iso.slice(0, 10), iso.slice(11, 19)]
}

// One DDL row. The statement column uses the shared TruncCell, which shows the
// COMPLETE decoded statement in its tooltip (lazily fetched via fileId+pos) since
// the list only carries a truncated `summary` preview.
function DdlRow({ fileId, e, onOpen }: { fileId: number; e: EventRow; onOpen: (pos: number) => void }) {
  const kind = ddlKind(e.summary)
  return (
    <TableRow {...clickableRow(() => onOpen(e.pos))} className="cursor-pointer">
      <TableCell className="tabular-nums">{e.pos}</TableCell>
      <TableCell className="w-fit">
        {(() => {
          const [date, clock] = fmtTimeParts(e.ts)
          return (
            <>
              <div>{date}</div>
              <span>{clock}</span>
            </>
          )
        })()}
      </TableCell>
      <TableCell className="w-fit">
        <KindBadge typeName={kind ?? 'DDL'} size="sm" />
      </TableCell>
      <TruncCell label={e.summary} className="truncate" fileId={fileId} pos={e.pos} mono />
    </TableRow>
  )
}

interface SchemaViewProps {
  fileId: number
  onOpenEvent: (pos: number) => void
}

export default function SchemaView({ fileId, onOpenEvent }: SchemaViewProps) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // QUERY events only; DDL filtering happens client-side.
    api
      .events({ file: fileId, type: 'QUERY', limit: 1000 })
      .then((page) => {
        if (cancelled) return
        setEvents(page.events.filter((e) => ddlKind(e.summary)))
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
  }, [fileId])

  return (
    <div className="flex flex-col gap-0 h-full overflow-hidden">
      {err && (
        <Alert variant="error" role="alert" className="mb-0">
          {err}
        </Alert>
      )}
      {loading && events.length === 0 ? (
        <p className="p-4">loading schema timeline...</p>
      ) : events.length === 0 ? (
        <Empty role="status">
          <EmptyHeader>
            <EmptyTitle>No DDL statements in this file.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>pos</TableHead>
                <TableHead>time</TableHead>
                <TableHead>kind</TableHead>
                <TableHead>statement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <DdlRow key={e.pos} fileId={fileId} e={e} onOpen={onOpenEvent} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
