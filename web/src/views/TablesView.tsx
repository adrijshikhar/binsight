import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clickable } from '../lib/a11y'
import type { TableStat } from '../lib/types'
import { Alert, Badge, Button, Center, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'

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
    <Stack p="md" gap="md" style={{ height: '100%', overflowY: 'auto' }}>
      {err && (
        <Alert color="red" role="alert">
          {err}
          <Button size="xs" variant="outline" color="blue" ml="xs" onClick={() => setFetchKey((k) => k + 1)}>
            retry
          </Button>
        </Alert>
      )}
      {loading && tables.length === 0 && (
        <Text c="dimmed" py="xs">
          loading tables…
        </Text>
      )}
      {!loading && !err && tables.length === 0 && (
        <Center py="xl">
          <Stack align="center" gap="xs" role="status">
            <Text c="dimmed">No tables in this file.</Text>
            <Text c="dimmed" size="xs">
              Tables appear once TABLE_MAP events are indexed. Try re-indexing the file if you expect data.
            </Text>
          </Stack>
        </Center>
      )}
      {tables.length > 0 && (
        <Group
          justify="space-between"
          align="center"
          pb="xs"
          style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}
        >
          <Group gap="md">
            <Text size="xs" c="dimmed" ff="monospace" style={{ textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {tables.length} {tables.length === 1 ? 'Table' : 'Tables'} Indexed
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {totalRows.toLocaleString()} mutations
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {(totalBytes / 1024).toFixed(1)} KB payload
            </Text>
          </Group>
          <Group gap="xs">
            <Badge color="green" variant="light" size="sm" ff="monospace">
              +{totalIns} ins
            </Badge>
            <Badge color="orange" variant="light" size="sm" ff="monospace">
              ~{totalUpd} upd
            </Badge>
            <Badge color="red" variant="light" size="sm" ff="monospace">
              -{totalDel} del
            </Badge>
          </Group>
        </Group>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '12px',
        }}
      >
        {tables.map((t) => {
          let cols: string[] = []
          try {
            cols = JSON.parse(t.column_types_json)
          } catch {
            /* tolerate bad json */
          }
          return (
            <Paper
              key={t.id}
              withBorder
              p="md"
              style={{
                cursor: 'pointer',
                background: 'var(--panel)',
                borderColor: 'var(--border)',
                borderRadius: '6px',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--accentSoft)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              {...clickable(() => props.onOpenTable(t.db_name, t.table_name))}
            >
              <Title order={4} ff="monospace" mb="xs" style={{ overflowWrap: 'anywhere' }}>
                {t.db_name}.{t.table_name}
              </Title>
              <Text c="dimmed" size="xs" mb="xs">
                {cols.length > 0 ? cols.join(', ') : 'no TABLE_MAP seen'}
              </Text>
              <Group gap="xs" mb="xs">
                <Badge color="green" variant="light" size="sm">
                  {t.inserts} ins
                </Badge>
                <Badge color="orange" variant="light" size="sm">
                  {t.updates} upd
                </Badge>
                <Badge color="red" variant="light" size="sm">
                  {t.deletes} del
                </Badge>
              </Group>
              <Text c="dimmed" size="xs">
                {t.rows_total} rows · {(t.bytes_total / 1024).toFixed(1)}K ·{' '}
                {((t.bytes_total / totalBytes) * 100).toFixed(1)}% of table bytes
              </Text>
            </Paper>
          )
        })}
      </div>
    </Stack>
  )
}
