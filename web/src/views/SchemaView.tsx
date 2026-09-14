import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickableRow } from '../lib/a11y'
import type { EventRow } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Table } from '@/components/ui/table'
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
    <Table.Tr {...clickableRow(() => onOpen(e.pos))} className="cursor-pointer">
      <Table.Td className="tabular-nums font-mono">
        {e.pos}
      </Table.Td>
      <Table.Td className="font-mono w-fit">
        {(() => {
          const [date, clock] = fmtTimeParts(e.ts)
          return (
            <>
              <div>{date}</div>
              <span className="text-xs text-muted-foreground">
                {clock}
              </span>
            </>
          )
        })()}
      </Table.Td>
      <Table.Td className="w-fit">
        <KindBadge typeName={kind ?? 'DDL'} size="xs" />
      </Table.Td>
      <TruncCell label={e.summary} className="summary" fileId={fileId} pos={e.pos} mono />
    </Table.Tr>
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
        <Alert variant="error" role="alert" className="rounded-none mb-0">
          {err}
        </Alert>
      )}
      {loading && events.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          loading schema timeline...
        </p>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground text-sm" role="status">
            No DDL statements in this file.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <Table stickyHeader className="text-sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>pos</Table.Th>
                <Table.Th>time</Table.Th>
                <Table.Th>kind</Table.Th>
                <Table.Th>statement</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {events.map((e) => (
                <DdlRow key={e.pos} fileId={fileId} e={e} onOpen={onOpenEvent} />
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </div>
  )
}
