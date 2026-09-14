import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickable } from '../lib/a11y'
import type { Anomaly, Severity } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table } from '@/components/ui/table'
import styles from './AnomaliesView.module.css'

interface AnomaliesViewProps {
  fileId: number
  onOpenTxn: (id: number) => void
  onOpenEvent: (pos: number) => void
}

const severityToBadgeVariant = (sev: Severity): 'destructive' | 'warning' | 'secondary' => {
  if (sev === 'critical' || sev === 'high') return 'destructive'
  if (sev === 'medium') return 'warning'
  return 'secondary'
}

export default function AnomaliesView({ fileId, onOpenTxn, onOpenEvent }: AnomaliesViewProps) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [sev, setSev] = useState<Severity | ''>('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [fetchKey, setFetchKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setAnomalies([])
    api
      .anomalies(fileId, sev)
      .then((a) => {
        if (cancelled) return
        setAnomalies(a)
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
  }, [fileId, sev, reloadKey, fetchKey])

  const rerunDetection = () => {
    if (detecting) return
    setDetecting(true)
    api
      .detect(fileId)
      .then(() => setReloadKey((k) => k + 1))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setDetecting(false))
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${styles.container}`}>
      <div className={`flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 ${styles.filterBar}`}>
        <span className="text-xs text-muted-foreground">
          severity
        </span>
        <select
          className="h-7 text-xs rounded-md border border-input bg-background px-2 text-foreground"
          value={sev}
          onChange={(e) => setSev(e.target.value as Severity | '')}
        >
          <option value="">all</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <Button size="xs" variant="outline" onClick={rerunDetection} disabled={detecting}>
          {detecting ? 'detecting...' : 're-run detection'}
        </Button>
      </div>
      {err && (
        <Alert variant="error" role="alert" className="flex items-center justify-between rounded-none mb-0">
          <span>{err}</span>
          <Button size="xs" variant="outline" className="ml-2" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && anomalies.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          loading anomalies...
        </p>
      ) : anomalies.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground text-sm" role="status">
            No anomalies detected for this file.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <Table stickyHeader className="text-sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>severity</Table.Th>
                <Table.Th>detector</Table.Th>
                <Table.Th>db.table</Table.Th>
                <Table.Th className="text-right">metric / threshold</Table.Th>
                <Table.Th>message</Table.Th>
                <Table.Th>link</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {anomalies.map((a) => (
                <Table.Tr
                  key={a.id}
                  className={a.severity === 'critical' || a.severity === 'high' ? styles.criticalRow : undefined}
                >
                  <Table.Td>
                    <Badge
                      variant={severityToBadgeVariant(a.severity)}
                      size="sm"
                      data-severity={a.severity}
                    >
                      {a.severity}
                    </Badge>
                  </Table.Td>
                  <Table.Td className="font-mono">{a.detector}</Table.Td>
                  <Table.Td>{[a.db_name, a.table_name].filter(Boolean).join('.')}</Table.Td>
                  <Table.Td className="tabular-nums text-right">
                    {a.threshold > 0 ? `${a.metric.toLocaleString()} / ${a.threshold.toLocaleString()}` : '-'}
                  </Table.Td>
                  <Table.Td className={styles.messageCell}>
                    {a.message || '-'}
                  </Table.Td>
                  <Table.Td>
                    {a.txn_id ? (
                      <button
                        type="button"
                        className={styles.jumpLink}
                        {...clickable(() => onOpenTxn(a.txn_id!))}
                      >
                        txn #{a.txn_id}
                      </button>
                    ) : a.event_pos ? (
                      <button
                        type="button"
                        className={styles.jumpLink}
                        {...clickable(() => onOpenEvent(a.event_pos!))}
                      >
                        @ {a.event_pos}
                      </button>
                    ) : (
                      '-'
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </div>
  )
}
