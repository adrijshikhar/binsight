import { useEffect, useState } from 'react'
import {
  Tabs,
  Card,
  Select,
  NumberInput,
  PasswordInput,
  Checkbox,
  Switch,
  TextInput,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Alert,
  Anchor,
  ActionIcon,
  Table,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { api } from '../lib/api'
import type { AdapterInfo, Settings } from '../lib/types'
import { Close } from '../components/icons'

const GIB = 1073741824

// Form fields read better narrow — a full-width number/text input across the
// whole modal is hard to scan. Cards cap the column; inputs cap tighter.
const CONTENT_MAW = 760
const PAIR_MAW = 620 // two-column field rows (host/port, user/password, …)

/** What each adapter capability means — surfaced as a tooltip on the badge so
 *  the opaque UPPERCASE labels (FULLSCAN, SEEKDECODE, …) are self-explaining. */
const CAP_DESC: Record<string, string> = {
  FullScan: 'Can index an entire binlog file in one decode pass — eligible to be the indexer.',
  SeekDecode: 'Can decode a single event at a byte offset — powers the detail drawer / jump-to-position.',
  ResumeDecode: 'Can resume decoding from the last committed offset — used for the incremental live tail.',
  RemoteStream: 'Can connect to a MySQL/MariaDB server as a replica and stream its binlogs.',
  RowImages: 'Surfaces before/after row images — needed for the Rows and Diff views.',
}

/** Humanize a byte count into a GiB/MiB/KiB hint for the txn-bytes threshold. */
function humanizeBytes(n: number): string {
  if (!n || n <= 0) return ''
  if (n >= GIB) return `= ${(n / GIB).toFixed(2)} GiB`
  if (n >= 1048576) return `= ${(n / 1048576).toFixed(2)} MiB`
  if (n >= 1024) return `= ${(n / 1024).toFixed(2)} KiB`
  return `= ${n} B`
}

/** Section ids — kept identical to the original so external callers don't break. */
const SECTIONS = [
  { id: 'decoding', label: 'Adapters & roles' },
  { id: 'display', label: 'Display' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'streaming', label: 'Remote streaming' },
  { id: 'watch', label: 'Watch' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export default function SettingsView(props: { onClose: () => void; onOpenArchitecture?: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [loadError, setLoadError] = useState<string>('')
  const [importError, setImportError] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<SectionId>('decoding')

  // Number fields as numbers (not raw strings — NumberInput handles coercion).
  // We keep them in local state rather than @mantine/form because the Settings
  // shape has two layers of nesting (stream.*, anomaly.*) that @mantine/form
  // handles awkwardly with getInputProps path strings; direct state is cleaner
  // and preserves the exact same payload shape the backend expects.
  const [pageSize, setPageSize] = useState<number>(500)
  const [port, setPort] = useState<number>(3306)
  const [serverId, setServerId] = useState<number>(1)
  const [maxSpoolGib, setMaxSpoolGib] = useState<number>(0)
  const [txnBytes, setTxnBytes] = useState<number>(0)
  const [txnRows, setTxnRows] = useState<number>(0)
  const [txnSeconds, setTxnSeconds] = useState<number>(0)
  const [eventRows, setEventRows] = useState<number>(0)

  useEffect(() => {
    let live = true
    api
      .settings()
      .then((s) => {
        if (!live) return
        setSettings(s)
        setPageSize(s.page_size)
        setPort(s.stream.port)
        setServerId(s.stream.server_id)
        setMaxSpoolGib(parseFloat((s.stream.max_spool_bytes / GIB).toFixed(2)))
        setTxnBytes(s.anomaly.txn_bytes)
        setTxnRows(s.anomaly.txn_rows)
        setTxnSeconds(s.anomaly.txn_seconds)
        setEventRows(s.anomaly.event_rows)
      })
      .catch((e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : String(e))
      })
    api
      .adapters()
      .then((a) => {
        if (live) setAdapters(a)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!settings)
    return (
      <div style={{ padding: 24, overflowY: 'auto' }}>
        {loadError ? (
          <Alert color="red" role="alert">
            {loadError}
          </Alert>
        ) : (
          'loading…'
        )}
      </div>
    )

  const indexerOptions = adapters.filter((a) => a.capabilities.FullScan).map((a) => ({ value: a.name, label: a.name }))
  const detailOptions = adapters
    .filter((a) => a.capabilities.FullScan || a.capabilities.SeekDecode)
    .map((a) => ({ value: a.name, label: a.name }))

  /** Build payload with all numeric state coerced (fallback to safe defaults). */
  const buildPayload = (): Settings => ({
    ...settings,
    page_size: pageSize || 500,
    anomaly: {
      txn_bytes: txnBytes || 0,
      txn_rows: txnRows || 0,
      txn_seconds: txnSeconds || 0,
      event_rows: eventRows || 0,
    },
    stream: {
      ...settings.stream,
      port: port || 3306,
      server_id: serverId || settings.stream.server_id,
      max_spool_bytes: Math.round((maxSpoolGib || 0) * GIB),
    },
  })

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v })

  const save = () => {
    setBusy(true)
    const payload = buildPayload()
    api
      .saveSettings(payload)
      .then((s) => {
        setSettings(s)
        notifications.show({ color: 'green', message: 'Settings saved ✓', autoClose: 3000 })
      })
      .catch((e: unknown) => {
        notifications.show({
          color: 'red',
          title: 'Save failed',
          message: e instanceof Error ? e.message : String(e),
          autoClose: false,
        })
      })
      .finally(() => setBusy(false))
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('')
    const file = e.target.files?.[0]
    if (!file) return
    file
      .text()
      .then((txt) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(txt)
        } catch {
          setImportError('invalid settings JSON')
          return
        }
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('port' in parsed) ||
          !('roles' in parsed) ||
          !('anomaly' in parsed) ||
          !('timezone' in parsed) ||
          !('page_size' in parsed) ||
          !('stream' in parsed)
        ) {
          setImportError('malformed settings: missing required fields')
          return
        }
        const s = parsed as Settings
        setSettings(s)
        setPageSize(s.page_size)
        setPort(s.stream.port)
        setServerId(s.stream.server_id)
        setMaxSpoolGib(parseFloat((s.stream.max_spool_bytes / GIB).toFixed(2)))
        setTxnBytes(s.anomaly.txn_bytes)
        setTxnRows(s.anomaly.txn_rows)
        setTxnSeconds(s.anomaly.txn_seconds)
        setEventRows(s.anomaly.event_rows)
        notifications.show({ color: 'blue', message: 'Imported — review and Save to apply', autoClose: 4000 })
      })
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'failed to read file')
      })
  }

  const txnBytesHint = humanizeBytes(txnBytes)

  return (
    // Flex column: fixed header, scrolling body, pinned footer. The parent
    // tabpanel gives us height:100%, so the footer sits at the viewport bottom
    // regardless of which tab is active (no more "save bar floats with content").
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header: title + icon-only close */}
      <Group justify="space-between" px={24} pt={20} pb={12} style={{ flexShrink: 0 }}>
        <Text fw={600} size="lg">
          Settings
        </Text>
        <ActionIcon variant="subtle" aria-label="Close settings" onClick={props.onClose}>
          <Close aria-hidden="true" />
        </ActionIcon>
      </Group>

      {/* Scrolling body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 24px' }}>
        <Tabs
          orientation="vertical"
          value={active}
          onChange={(v) => setActive((v as SectionId) ?? 'decoding')}
          styles={{
            root: { display: 'flex', gap: 'var(--mantine-spacing-lg)', alignItems: 'flex-start' },
            list: { flexShrink: 0, width: 180 },
            panel: { flex: 1, maxWidth: CONTENT_MAW },
          }}
        >
          <Tabs.List>
            {SECTIONS.map((s) => (
              <Tabs.Tab key={s.id} value={s.id}>
                {s.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {/* ── Adapters & roles ────────────────────────────────────────────── */}
          <Tabs.Panel value="decoding">
            <Stack gap="md">
              <Card withBorder>
                <Text fw={600} mb={8}>
                  Adapters
                </Text>
                <Text size="sm" c="dimmed" mb={12}>
                  Decoders available to the viewer and what each can do. Hover a capability for a one-line definition
                  {props.onOpenArchitecture ? (
                    <>
                      , or{' '}
                      <Anchor component="button" type="button" size="sm" onClick={props.onOpenArchitecture}>
                        learn more
                      </Anchor>{' '}
                      in the architecture overview
                    </>
                  ) : null}
                  .
                </Text>
                <Table verticalSpacing="xs" horizontalSpacing={0} layout="auto">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>name</Table.Th>
                      <Table.Th style={{ textAlign: 'left' }}>capabilities</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {adapters.map((a) => (
                      <Table.Tr key={a.name}>
                        <Table.Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap', paddingRight: 24 }}>
                          {a.name}
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="wrap">
                            {Object.entries(a.capabilities)
                              .filter(([, v]) => v)
                              .map(([k]) => (
                                <Tooltip key={k} label={CAP_DESC[k] ?? k} withArrow>
                                  <Badge
                                    variant="outline"
                                    color="gray"
                                    size="sm"
                                    style={{ fontFamily: 'var(--mono)', cursor: 'help' }}
                                  >
                                    {k}
                                  </Badge>
                                </Tooltip>
                              ))}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card>

              <Card withBorder>
                <Text fw={600} mb={8}>
                  Roles
                </Text>
                <Text size="sm" c="dimmed" mb={12}>
                  Which adapter handles indexing, the detail drawer, and the diff oracle.
                </Text>
                <Stack gap="sm" maw={PAIR_MAW}>
                  <Group grow align="flex-start" wrap="wrap" gap="sm">
                    <Select
                      label="indexer"
                      data={indexerOptions}
                      value={settings.roles.indexer}
                      onChange={(v) => v && set('roles', { ...settings.roles, indexer: v })}
                    />
                    <Select
                      label="detail"
                      data={detailOptions}
                      value={settings.roles.detail}
                      onChange={(v) => v && set('roles', { ...settings.roles, detail: v })}
                    />
                  </Group>
                  <Checkbox.Group
                    label="diff set"
                    value={settings.roles.diff}
                    onChange={(v) => set('roles', { ...settings.roles, diff: v })}
                  >
                    <Group mt={6} gap="sm">
                      {adapters.map((a) => (
                        <Checkbox key={a.name} value={a.name} label={a.name} />
                      ))}
                    </Group>
                  </Checkbox.Group>
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>

          {/* ── Display ─────────────────────────────────────────────────────── */}
          <Tabs.Panel value="display">
            <Card withBorder>
              <Text fw={600} mb={8}>
                Display
              </Text>
              <Text size="sm" c="dimmed" mb={12}>
                Pagination and timestamp display.
              </Text>
              <Group grow align="flex-start" wrap="wrap" gap="sm" maw={PAIR_MAW}>
                <NumberInput
                  label="page size"
                  min={1}
                  step={1}
                  value={pageSize}
                  onChange={(v) => setPageSize(typeof v === 'number' ? v : 500)}
                />
                <Select
                  label="timezone"
                  data={[
                    { value: 'utc', label: 'UTC' },
                    { value: 'local', label: 'local' },
                  ]}
                  value={settings.timezone}
                  onChange={(v) => v && set('timezone', v as Settings['timezone'])}
                />
              </Group>
            </Card>
          </Tabs.Panel>

          {/* ── Anomalies ───────────────────────────────────────────────────── */}
          <Tabs.Panel value="anomalies">
            <Card withBorder>
              <Text fw={600} mb={8}>
                Anomaly thresholds
              </Text>
              <Text size="sm" c="dimmed" mb={12}>
                Limits that flag oversized/long transactions. Saving re-runs anomaly detection on all indexed files.
              </Text>
              <Stack gap="sm" maw={PAIR_MAW}>
                <Group grow align="flex-start" wrap="wrap" gap="sm">
                  <NumberInput
                    label={
                      <>
                        txn bytes
                        {txnBytesHint && (
                          <Text span c="dimmed" size="xs" ml={6}>
                            {txnBytesHint}
                          </Text>
                        )}
                      </>
                    }
                    min={0}
                    step={1}
                    value={txnBytes}
                    onChange={(v) => setTxnBytes(typeof v === 'number' ? v : 0)}
                  />
                  <NumberInput
                    label="txn rows"
                    min={0}
                    step={1}
                    value={txnRows}
                    onChange={(v) => setTxnRows(typeof v === 'number' ? v : 0)}
                  />
                </Group>
                <Group grow align="flex-start" wrap="wrap" gap="sm">
                  <NumberInput
                    label="txn seconds"
                    min={0}
                    step={1}
                    value={txnSeconds}
                    onChange={(v) => setTxnSeconds(typeof v === 'number' ? v : 0)}
                  />
                  <NumberInput
                    label="event rows"
                    min={0}
                    step={1}
                    value={eventRows}
                    onChange={(v) => setEventRows(typeof v === 'number' ? v : 0)}
                  />
                </Group>
              </Stack>
            </Card>
          </Tabs.Panel>

          {/* ── Remote streaming ────────────────────────────────────────────── */}
          <Tabs.Panel value="streaming">
            <Card withBorder>
              <Text fw={600} mb={8}>
                Remote streaming
              </Text>
              <Text size="sm" c="dimmed" mb={12}>
                Stream events directly from a MySQL/MariaDB server via the binlog protocol.
              </Text>
              {/* Wider 2-col grid: related connection fields pair up rather
                  than stacking one narrow field per row. Group grow wraps to a
                  single column on narrow widths. */}
              <Stack gap="sm" maw={PAIR_MAW}>
                <Switch
                  label="enabled"
                  checked={settings.stream.enabled}
                  onChange={(e) => set('stream', { ...settings.stream, enabled: e.currentTarget.checked })}
                />
                <Group grow align="flex-start" wrap="wrap" gap="sm">
                  <TextInput
                    label="host"
                    autoComplete="off"
                    value={settings.stream.host}
                    onChange={(e) => set('stream', { ...settings.stream, host: e.currentTarget.value })}
                  />
                  <NumberInput
                    label="port"
                    min={1}
                    step={1}
                    value={port}
                    onChange={(v) => setPort(typeof v === 'number' ? v : 3306)}
                  />
                </Group>
                <Group grow align="flex-start" wrap="wrap" gap="sm">
                  <TextInput
                    label="user"
                    autoComplete="username"
                    value={settings.stream.user}
                    onChange={(e) => set('stream', { ...settings.stream, user: e.currentTarget.value })}
                  />
                  {/* The server never returns the stored password, so an empty
                      field means "unchanged" rather than "none". */}
                  <PasswordInput
                    label="password"
                    autoComplete="current-password"
                    placeholder={settings.stream_password_set ? 'stored — type to replace' : ''}
                    description={settings.stream_password_set ? undefined : 'not set'}
                    value={settings.stream.password}
                    onChange={(e) => set('stream', { ...settings.stream, password: e.currentTarget.value })}
                  />
                </Group>
                <Group grow align="flex-start" wrap="wrap" gap="sm">
                  <Select
                    label="flavor"
                    data={[
                      { value: 'mysql', label: 'mysql' },
                      { value: 'mariadb', label: 'mariadb' },
                    ]}
                    value={settings.stream.flavor}
                    onChange={(v) => v && set('stream', { ...settings.stream, flavor: v as 'mysql' | 'mariadb' })}
                  />
                  <NumberInput
                    label="server id"
                    min={1}
                    step={1}
                    value={serverId}
                    onChange={(v) => setServerId(typeof v === 'number' ? v : 1)}
                  />
                </Group>
                <Group grow align="flex-start" wrap="wrap" gap="sm">
                  <NumberInput
                    label="max spool (GiB)"
                    min={0}
                    step={0.01}
                    decimalScale={2}
                    value={maxSpoolGib}
                    onChange={(v) => setMaxSpoolGib(typeof v === 'number' ? v : 0)}
                  />
                  {/* spacer keeps max-spool at half width to match the rows above */}
                  <div aria-hidden="true" />
                </Group>
                {settings.stream.enabled && (
                  <Button
                    variant="default"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Restart streaming from the current server position? This will discard the spool.',
                        )
                      )
                        return
                      setBusy(true)
                      api
                        .restartStreamFromCurrent()
                        .then(() =>
                          notifications.show({ color: 'green', message: 'Restart scheduled', autoClose: 3000 }),
                        )
                        .catch((e: unknown) =>
                          notifications.show({
                            color: 'red',
                            title: 'Restart failed',
                            message: e instanceof Error ? e.message : String(e),
                            autoClose: false,
                          }),
                        )
                        .finally(() => setBusy(false))
                    }}
                  >
                    {busy ? 'Restarting…' : 'Restart from current position'}
                  </Button>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>

          {/* ── Watch ───────────────────────────────────────────────────────── */}
          <Tabs.Panel value="watch">
            <Card withBorder>
              <Text fw={600} mb={8}>
                Watch
              </Text>
              <Text size="sm" c="dimmed" mb={12}>
                Local directory scanned for binlog files.
              </Text>
              <Text size="sm" mb={12}>
                watching: <code>{settings.watch_dir}</code>
              </Text>
              <Button
                variant="default"
                disabled={busy}
                onClick={() =>
                  api
                    .rescan()
                    .then(() => notifications.show({ color: 'green', message: 'Rescan scheduled', autoClose: 3000 }))
                    .catch((e: unknown) =>
                      notifications.show({
                        color: 'red',
                        title: 'Rescan failed',
                        message: e instanceof Error ? e.message : String(e),
                        autoClose: false,
                      }),
                    )
                }
              >
                rescan now
              </Button>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </div>

      {/* ── Pinned footer: Save / export / import ──────────────────────── */}
      <Group
        px={24}
        py={12}
        style={{
          flexShrink: 0,
          background: 'var(--mantine-color-body)',
          borderTop: '1px solid var(--mantine-color-default-border)',
        }}
        gap="lg"
        align="center"
        wrap="wrap"
      >
        <Button onClick={save} loading={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
        <Anchor
          href={`data:application/json,${encodeURIComponent(JSON.stringify(buildPayload(), null, 2))}`}
          download="binsight-settings.json"
          size="sm"
        >
          export JSON
        </Anchor>
        <Anchor component="label" htmlFor="import-json" size="sm" style={{ cursor: 'pointer' }}>
          import JSON
          <input
            id="import-json"
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </Anchor>
        {importError && (
          <Alert color="red" role="alert" aria-live="assertive" py={4}>
            {importError}
          </Alert>
        )}
      </Group>
    </div>
  )
}
