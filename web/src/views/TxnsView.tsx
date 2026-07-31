import { useEffect, useMemo, useState } from 'react'
import '../components/table-utils.module.css'
import { api } from '../lib/api'
import { clickable, clickableRow } from '../lib/a11y'
import type { Severity, Txn } from '../lib/types'
import { Warning } from '../components/icons'
import { IconChevronRight } from '@tabler/icons-react'
import { Alert, Badge, Button, Center, Stack, Table, Text, Tooltip } from '@mantine/core'

type SortKey = 'start_pos' | 'event_count' | 'rows' | 'duration'

export default function TxnsView(props: {
  fileId: number
  onOpenTxn: (id: number) => void
  txnSeverity: Map<number, Severity>
}) {
  const [txns, setTxns] = useState<Txn[]>([])
  const [sort, setSort] = useState<SortKey>('start_pos')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const [fetchKey, setFetchKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr('')
    setTxns([])
    api
      .txns(props.fileId)
      .then((t) => {
        if (cancelled) return
        setTxns(t)
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
  }, [props.fileId, fetchKey])

  const sorted = useMemo(() => {
    const s = [...txns]
    const rows = (t: Txn) => t.rows_inserted + t.rows_updated + t.rows_deleted
    const dur = (t: Txn) => (t.commit_ts && t.start_ts ? t.commit_ts - t.start_ts : 0)
    s.sort((a, b) => {
      switch (sort) {
        case 'event_count':
          return b.event_count - a.event_count
        case 'rows':
          return rows(b) - rows(a)
        case 'duration':
          return dur(b) - dur(a)
        default:
          return a.start_pos - b.start_pos
      }
    })
    return s
  }, [txns, sort])

  // Per-file transaction ordinal (1-based, by start-pos rank) — the SAME scheme
  // the grouped Events view uses for its "txn N" headers, so the two views agree
  // regardless of GTID/anonymous. Keyed by txn id so it's stable across re-sorts.
  const ordinalById = useMemo(() => {
    const m = new Map<number, number>()
    ;[...txns].sort((a, b) => a.start_pos - b.start_pos).forEach((t, i) => m.set(t.id, i + 1))
    return m
  }, [txns])

  const sortIndicator = (key: SortKey) =>
    sort === key ? (
      <IconChevronRight
        size={12}
        className="sort-caret"
        style={{ transform: 'rotate(90deg)', transition: 'transform 0.15s ease' }}
      />
    ) : null

  const sortableProps = (key: SortKey) => ({
    'data-sortable': true,
    'aria-sort': sort === key ? ('descending' as const) : ('none' as const),
    ...clickable(() => setSort(key)),
  })

  const sevColor = (s: Severity) =>
    s === 'critical' || s === 'high'
      ? 'var(--sev-critical-text)'
      : s === 'medium'
        ? 'var(--sev-medium-text)'
        : 'var(--sev-low-text)'

  return (
    <Stack gap={0} style={{ height: '100%', overflow: 'hidden' }}>
      {err && (
        <Alert color="red" role="alert" radius={0} mb={0}>
          {err}
          <Button size="xs" variant="outline" color="blue" ml="xs" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && txns.length === 0 && (
        <Text c="dimmed" p="md">
          loading transactions…
        </Text>
      )}
      {!loading && txns.length === 0 && !err && (
        <Center py="xl">
          <Text c="dimmed" role="status">
            No transactions in this file.
          </Text>
        </Center>
      )}
      {!loading && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Table stickyHeader fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w="1.5rem"></Table.Th>
                <Table.Th {...sortableProps('start_pos')} style={{ cursor: 'pointer' }}>
                  txn / gtid{sortIndicator('start_pos')}
                </Table.Th>
                <Table.Th>start</Table.Th>
                <Table.Th {...sortableProps('duration')} style={{ cursor: 'pointer' }}>
                  duration{sortIndicator('duration')}
                </Table.Th>
                <Table.Th {...sortableProps('event_count')} style={{ cursor: 'pointer' }}>
                  events{sortIndicator('event_count')}
                </Table.Th>
                <Table.Th {...sortableProps('rows')} style={{ cursor: 'pointer' }}>
                  I / U / D{sortIndicator('rows')}
                </Table.Th>
                <Table.Th>status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map((t) => (
                <Table.Tr key={t.id} {...clickableRow(() => props.onOpenTxn(t.id))} style={{ cursor: 'pointer' }}>
                  <Table.Td ta="center" w="1.5rem">
                    {props.txnSeverity.has(t.id) && (
                      <Tooltip label={`anomaly: ${props.txnSeverity.get(t.id)}`} openDelay={150} withinPortal>
                        <span
                          style={{ color: sevColor(props.txnSeverity.get(t.id)!) }}
                          aria-label={`anomaly: ${props.txnSeverity.get(t.id)}`}
                        >
                          <Warning size={12} />
                        </span>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td ff="monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <Text span fw={600}>
                      txn {ordinalById.get(t.id)}
                    </Text>
                    <Text span c="dimmed" size="xs" ml={6}>
                      {t.gtid && t.gtid !== 'ANONYMOUS' ? t.gtid : `@ ${t.start_pos}`}
                    </Text>
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {t.start_ts ? new Date(t.start_ts * 1000).toISOString().slice(0, 19).replace('T', ' ') : ''}
                  </Table.Td>
                  <Table.Td ff="monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {t.commit_ts && t.start_ts ? `${t.commit_ts - t.start_ts}s` : ''}
                  </Table.Td>
                  <Table.Td ff="monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {t.event_count}
                  </Table.Td>
                  <Table.Td ff="monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {t.rows_inserted} / {t.rows_updated} / {t.rows_deleted}
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={t.status === 'committed' ? 'green' : t.status === 'incomplete' ? 'red' : 'gray'}
                      variant="light"
                      size="sm"
                      ff="monospace"
                      style={{ cursor: 'inherit' }}
                    >
                      {t.status}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </Stack>
  )
}
