import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { clickable, clickableRow } from '../lib/a11y'
import type { Severity, Txn } from '../lib/types'
import { Warning } from '../components/icons'
import { IconChevronRight } from '@tabler/icons-react'
import { Alert } from '@/components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'

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

  // Per-file transaction ordinal (1-based, by start-pos rank) - the SAME scheme
  // the grouped Events view uses for its "txn N" headers, so the two views agree
  // regardless of GTID/anonymous. Keyed by txn id so it's stable across re-sorts.
  const ordinalById = useMemo(() => {
    const m = new Map<number, number>()
    ;[...txns].sort((a, b) => a.start_pos - b.start_pos).forEach((t, i) => m.set(t.id, i + 1))
    return m
  }, [txns])

  const sortIndicator = (key: SortKey) =>
    sort === key ? <IconChevronRight size={12} className="sort-caret-active" /> : null

  const sortableProps = (key: SortKey) => ({
    'data-sortable': true,
    'aria-sort': sort === key ? ('descending' as const) : ('none' as const),
    ...clickable(() => setSort(key)),
  })

  return (
    <div className="flex flex-col gap-0 h-full min-h-0 overflow-hidden">
      {err && (
        <Alert variant="error" role="alert" className="flex items-center justify-between mb-0">
          <span>{err}</span>
          <Button variant="outline" className="ml-2" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && txns.length === 0 && <p className="p-4">loading transactions...</p>}
      {!loading && txns.length === 0 && !err && (
        <Empty role="status">
          <EmptyHeader>
            <EmptyTitle>No transactions in this file.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {!loading && (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead {...sortableProps('start_pos')}>txn / gtid{sortIndicator('start_pos')}</TableHead>
                <TableHead>start</TableHead>
                <TableHead {...sortableProps('duration')}>duration{sortIndicator('duration')}</TableHead>
                <TableHead {...sortableProps('event_count')}>events{sortIndicator('event_count')}</TableHead>
                <TableHead {...sortableProps('rows')}>I / U / D{sortIndicator('rows')}</TableHead>
                <TableHead>status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((t) => (
                <TableRow key={t.id} {...clickableRow(() => props.onOpenTxn(t.id))} className="cursor-pointer">
                  <TableCell className="text-center w-6">
                    {props.txnSeverity.has(t.id) && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className="inline-flex items-center justify-center"
                              aria-label={`anomaly: ${props.txnSeverity.get(t.id)}`}
                            >
                              <Warning size={12} />
                            </span>
                          }
                        />
                        <TooltipPopup side="top" align="center">
                          {`anomaly: ${props.txnSeverity.get(t.id)}`}
                        </TooltipPopup>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <span>txn {ordinalById.get(t.id)}</span>
                    <span className="ml-1.5">{t.gtid && t.gtid !== 'ANONYMOUS' ? t.gtid : `@ ${t.start_pos}`}</span>
                  </TableCell>
                  <TableCell>
                    {t.start_ts ? new Date(t.start_ts * 1000).toISOString().slice(0, 19).replace('T', ' ') : ''}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {t.commit_ts && t.start_ts ? `${t.commit_ts - t.start_ts}s` : ''}
                  </TableCell>
                  <TableCell className="tabular-nums">{t.event_count}</TableCell>
                  <TableCell className="tabular-nums">
                    {t.rows_inserted} / {t.rows_updated} / {t.rows_deleted}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        t.status === 'committed' ? 'secondary' : t.status === 'incomplete' ? 'destructive' : 'secondary'
                      }
                      size="sm"
                      className="cursor-inherit"
                      data-status={t.status}
                    >
                      {t.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
