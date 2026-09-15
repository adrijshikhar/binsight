import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickable } from '../lib/a11y'
import type { Anomaly, Severity } from '../lib/types'
import { Alert } from '@/components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from '@/components/ui/select'

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
    <div className="flex flex-col h-full overflow-hidden min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 p-3">
        <span>severity</span>
        <Select value={sev} onValueChange={(value) => setSev((value ?? '') as Severity | '')}>
          <SelectTrigger aria-label="Severity" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="">all</SelectItem>
            <SelectItem value="critical">critical</SelectItem>
            <SelectItem value="high">high</SelectItem>
            <SelectItem value="medium">medium</SelectItem>
            <SelectItem value="low">low</SelectItem>
          </SelectPopup>
        </Select>
        <Button size="xs" variant="outline" onClick={rerunDetection} disabled={detecting}>
          {detecting ? 'detecting...' : 're-run detection'}
        </Button>
      </div>
      {err && (
        <Alert variant="error" role="alert" className="flex items-center justify-between mb-0">
          <span>{err}</span>
          <Button size="xs" variant="outline" className="ml-2" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && anomalies.length === 0 ? (
        <p className="p-4">loading anomalies...</p>
      ) : anomalies.length === 0 ? (
        <Empty role="status">
          <EmptyHeader>
            <EmptyTitle>No anomalies detected for this file.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>severity</TableHead>
                <TableHead>detector</TableHead>
                <TableHead>db.table</TableHead>
                <TableHead className="text-right">metric / threshold</TableHead>
                <TableHead>message</TableHead>
                <TableHead>link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalies.map((a) => (
                <TableRow key={a.id} data-severity={a.severity}>
                  <TableCell>
                    <Badge variant={severityToBadgeVariant(a.severity)} size="sm" data-severity={a.severity}>
                      {a.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.detector}</TableCell>
                  <TableCell>{[a.db_name, a.table_name].filter(Boolean).join('.')}</TableCell>
                  <TableCell className="tabular-nums text-right">
                    {a.threshold > 0 ? `${a.metric.toLocaleString()} / ${a.threshold.toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell className="max-w-72 truncate">{a.message || '-'}</TableCell>
                  <TableCell>
                    {a.txn_id ? (
                      <button type="button" {...clickable(() => onOpenTxn(a.txn_id!))}>
                        txn #{a.txn_id}
                      </button>
                    ) : a.event_pos ? (
                      <button type="button" {...clickable(() => onOpenEvent(a.event_pos!))}>
                        @ {a.event_pos}
                      </button>
                    ) : (
                      '-'
                    )}
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
