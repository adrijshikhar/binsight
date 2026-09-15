import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickable } from '../lib/a11y'
import type { TableStat } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardPanel } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

export default function TablesView(props: { fileId: number; onOpenTable: (db: string, table: string) => void }) {
  const [tables, setTables] = useState<TableStat[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const [fetchKey, setFetchKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr('')
    setTables([])
    api
      .tables(props.fileId)
      .then((t) => {
        if (cancelled) return
        setTables(t)
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

  const totalBytes = tables.reduce((n, t) => n + t.bytes_total, 0) || 1
  const totalRows = tables.reduce((n, t) => n + t.rows_total, 0)
  const totalIns = tables.reduce((n, t) => n + t.inserts, 0)
  const totalUpd = tables.reduce((n, t) => n + t.updates, 0)
  const totalDel = tables.reduce((n, t) => n + t.deletes, 0)

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto overflow-auto">
      {err && (
        <Alert variant="error" role="alert" className="flex items-center justify-between">
          <span>{err}</span>
          <Button size="xs" variant="outline" className="ml-2" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && tables.length === 0 && <p className="py-2">loading tables...</p>}
      {!loading && !err && tables.length === 0 && (
        <Empty role="status">
          <EmptyHeader>
            <EmptyTitle>No tables in this file.</EmptyTitle>
            <EmptyDescription>
              Tables appear once TABLE_MAP events are indexed. Try re-indexing the file if you expect data.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {tables.length > 0 && (
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span>
              {tables.length} {tables.length === 1 ? 'Table' : 'Tables'} Indexed
            </span>
            <span>·</span>
            <span>{totalRows.toLocaleString()} mutations</span>
            <span>·</span>
            <span>{(totalBytes / 1024).toFixed(1)} KB payload</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" size="sm" data-kind="WRITE">
              +{totalIns} ins
            </Badge>
            <Badge variant="warning" size="sm" data-kind="UPDATE">
              ~{totalUpd} upd
            </Badge>
            <Badge variant="error" size="sm" data-kind="DELETE">
              -{totalDel} del
            </Badge>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tables.map((t) => {
          let cols: string[] = []
          try {
            cols = JSON.parse(t.column_types_json)
          } catch {
            /* tolerate bad json */
          }
          return (
            <Card
              key={t.id}
              className="cursor-pointer"
              {...clickable(() => props.onOpenTable(t.db_name, t.table_name))}
            >
              <CardHeader>
                <CardTitle className="wrap-anywhere">
                  {t.db_name}.{t.table_name}
                </CardTitle>
                <CardDescription>{cols.length > 0 ? cols.join(', ') : 'no TABLE_MAP seen'}</CardDescription>
              </CardHeader>
              <CardPanel>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="success" size="sm" data-kind="WRITE">
                    {t.inserts} ins
                  </Badge>
                  <Badge variant="warning" size="sm" data-kind="UPDATE">
                    {t.updates} upd
                  </Badge>
                  <Badge variant="error" size="sm" data-kind="DELETE">
                    {t.deletes} del
                  </Badge>
                </div>
                <CardDescription>
                  {t.rows_total} rows · {(t.bytes_total / 1024).toFixed(1)}K ·{' '}
                  {((t.bytes_total / totalBytes) * 100).toFixed(1)}% of table bytes
                </CardDescription>
              </CardPanel>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
