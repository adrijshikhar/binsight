import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickableRow } from '../lib/a11y'
import type { EventRow } from '../lib/types'
import { Alert, Badge, Center, Stack, Table, Text } from '@mantine/core'
import TruncCell from '../components/TruncCell'

const DDL_PREFIXES = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE']

function ddlKind(sql: string): string | null {
  const u = sql.trim().toUpperCase()
  return DDL_PREFIXES.find((p) => u.startsWith(p)) ?? null
}

function ddlBadgeColor(kind: string | null): string {
  switch (kind) {
    case 'CREATE':
      return 'teal'
    case 'ALTER':
      return 'accent'
    case 'DROP':
      return 'red'
    case 'TRUNCATE':
      return 'orange'
    default:
      return 'grape'
  }
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
    <Table.Tr {...clickableRow(() => onOpen(e.pos))} style={{ cursor: 'pointer' }}>
      <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }} ff="monospace">
        {e.pos}
      </Table.Td>
      <Table.Td ff="monospace" style={{ whiteSpace: 'nowrap', width: '1%' }}>
        {(() => {
          const [date, clock] = fmtTimeParts(e.ts)
          return (
            <>
              <div>{date}</div>
              <Text size="xs" c="dimmed">
                {clock}
              </Text>
            </>
          )
        })()}
      </Table.Td>
      <Table.Td style={{ width: '1%', whiteSpace: 'nowrap' }}>
        <Badge color={ddlBadgeColor(kind)} variant="light" size="sm" ff="monospace" styles={{ label: { overflow: 'visible' } }}>
          {kind}
        </Badge>
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
    <Stack gap={0} style={{ height: '100%', overflow: 'hidden' }}>
      {err && (
        <Alert color="red" role="alert" radius={0} mb={0}>
          {err}
        </Alert>
      )}
      {loading && events.length === 0 ? (
        <Text c="dimmed" p="md">
          loading schema timeline…
        </Text>
      ) : events.length === 0 ? (
        <Center py="xl">
          <Text c="dimmed" role="status">
            No DDL statements in this file.
          </Text>
        </Center>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Table stickyHeader fz="sm">
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
    </Stack>
  )
}
