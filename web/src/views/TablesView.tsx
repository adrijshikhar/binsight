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
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
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
              p="sm"
              style={{ cursor: 'pointer' }}
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
      </SimpleGrid>
    </Stack>
  )
}
