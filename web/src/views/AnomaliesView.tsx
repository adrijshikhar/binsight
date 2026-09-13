import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickable } from '../lib/a11y'
import type { Anomaly, Severity } from '../lib/types'
import { severityColor } from '../components/icons'
import { Alert, Anchor, Badge, Button, Center, Group, NativeSelect, Stack, Table, Text } from '@mantine/core'

interface AnomaliesViewProps {
  fileId: number
  onOpenTxn: (id: number) => void
  onOpenEvent: (pos: number) => void
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
    <Stack gap={0} style={{ height: '100%', overflow: 'hidden' }}>
      <Group px="md" py="xs" gap="sm" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Text size="sm" c="dimmed">
          severity
        </Text>
        <NativeSelect
          size="xs"
          value={sev}
          onChange={(e) => setSev(e.target.value as Severity | '')}
          data={[
            { value: '', label: 'all' },
            { value: 'critical', label: 'critical' },
            { value: 'high', label: 'high' },
            { value: 'medium', label: 'medium' },
            { value: 'low', label: 'low' },
          ]}
        />
        <Button size="xs" variant="default" onClick={rerunDetection} disabled={detecting}>
          {detecting ? 'detecting…' : 're-run detection'}
        </Button>
      </Group>
      {err && (
        <Alert color="red" role="alert" radius={0} mb={0}>
          {err}
          <Button size="xs" variant="outline" color="accent" ml="xs" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && anomalies.length === 0 ? (
        <Text c="dimmed" p="md">
          loading anomalies…
        </Text>
      ) : anomalies.length === 0 ? (
        <Center py="xl">
          <Text c="dimmed" role="status">
            No anomalies detected for this file.
          </Text>
        </Center>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Table stickyHeader fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>severity</Table.Th>
                <Table.Th>detector</Table.Th>
                <Table.Th>db.table</Table.Th>
                <Table.Th>metric / threshold</Table.Th>
                <Table.Th>message</Table.Th>
                <Table.Th>link</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {anomalies.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Badge color={severityColor(a.severity)} variant="light" size="sm">
                      {a.severity}
                    </Badge>
                  </Table.Td>
                  <Table.Td ff="monospace">{a.detector}</Table.Td>
                  <Table.Td>{[a.db_name, a.table_name].filter(Boolean).join('.')}</Table.Td>
                  <Table.Td style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {a.threshold > 0 ? `${a.metric.toLocaleString()} / ${a.threshold.toLocaleString()}` : '-'}
                  </Table.Td>
                  <Table.Td
                    style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {a.message || '-'}
                  </Table.Td>
                  <Table.Td>
                    {a.txn_id ? (
                      <Anchor
                        size="xs"
                        ff="monospace"
                        style={{
                          display: 'inline-block',
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: 'var(--panel2)',
                          border: '1px solid var(--border)',
                          color: 'var(--accent)',
                          textDecoration: 'none',
                          fontWeight: 500,
                          transition: 'border-color 150ms ease, background 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent)'
                          e.currentTarget.style.background = 'var(--surface-active)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.background = 'var(--panel2)'
                        }}
                        {...clickable(() => onOpenTxn(a.txn_id!))}
                      >
                        txn #{a.txn_id}
                      </Anchor>
                    ) : a.event_pos ? (
                      <Anchor
                        size="xs"
                        ff="monospace"
                        style={{
                          display: 'inline-block',
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: 'var(--panel2)',
                          border: '1px solid var(--border)',
                          color: 'var(--accent)',
                          textDecoration: 'none',
                          fontWeight: 500,
                          transition: 'border-color 150ms ease, background 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent)'
                          e.currentTarget.style.background = 'var(--surface-active)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.background = 'var(--panel2)'
                        }}
                        {...clickable(() => onOpenEvent(a.event_pos!))}
                      >
                        @ {a.event_pos}
                      </Anchor>
                    ) : (
                      '—'
                    )}
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
