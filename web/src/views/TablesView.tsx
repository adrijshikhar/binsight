import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickable } from '../lib/a11y'
import type { TableStat } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import styles from './TablesView.module.css'

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
    <div className={`flex flex-col gap-4 p-4 h-full overflow-y-auto ${styles.container}`}>
      {err && (
        <Alert variant="error" role="alert" className="flex items-center justify-between">
          <span>{err}</span>
          <Button size="xs" variant="outline" className="ml-2" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && tables.length === 0 && (
        <p className="text-muted-foreground py-2 text-sm">
          loading tables...
        </p>
      )}
      {!loading && !err && tables.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2" role="status">
            <p className="text-muted-foreground">No tables in this file.</p>
            <p className="text-muted-foreground text-xs">
              Tables appear once TABLE_MAP events are indexed. Try re-indexing the file if you expect data.
            </p>
          </div>
        </div>
      )}
      {tables.length > 0 && (
        <div className={`flex items-center justify-between gap-4 pb-2 border-b border-border ${styles.summaryHeader}`}>
          <div className="flex items-center gap-3">
            <span className={`text-xs text-muted-foreground font-mono uppercase tracking-wider ${styles.eyebrow}`}>
              {tables.length} {tables.length === 1 ? 'Table' : 'Tables'} Indexed
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground font-mono">
              {totalRows.toLocaleString()} mutations
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground font-mono">
              {(totalBytes / 1024).toFixed(1)} KB payload
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="insert" size="sm" className="font-mono">
              +{totalIns} ins
            </Badge>
            <Badge variant="update" size="sm" className="font-mono">
              ~{totalUpd} upd
            </Badge>
            <Badge variant="delete" size="sm" className="font-mono">
              -{totalDel} del
            </Badge>
          </div>
        </div>
      )}
      <div className={styles.grid}>
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
              className={`p-4 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-primary ${styles.tableCard}`}
              {...clickable(() => props.onOpenTable(t.db_name, t.table_name))}
            >
              <h4 className={`font-mono text-sm font-semibold mb-2 break-all ${styles.tableTitle}`}>
                {t.db_name}.{t.table_name}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {cols.length > 0 ? cols.join(', ') : 'no TABLE_MAP seen'}
              </p>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="insert" size="sm" className="font-mono">
                  {t.inserts} ins
                </Badge>
                <Badge variant="update" size="sm" className="font-mono">
                  {t.updates} upd
                </Badge>
                <Badge variant="delete" size="sm" className="font-mono">
                  {t.deletes} del
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.rows_total} rows · {(t.bytes_total / 1024).toFixed(1)}K ·{' '}
                {((t.bytes_total / totalBytes) * 100).toFixed(1)}% of table bytes
              </p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
