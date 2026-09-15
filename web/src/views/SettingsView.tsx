import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { AdapterInfo, Settings } from '../lib/types'
import { useColorScheme, type ThemePreference } from '../lib/colorScheme'
import { Dialog, DialogPopup, DialogTitle, DialogHeader, DialogPanel, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from '@/components/ui/select'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/ui/number-field'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import { toastManager } from '@/components/ui/toast'

const GIB = 1073741824

/** What each adapter capability means - surfaced as a tooltip on the badge so
 *  the opaque UPPERCASE labels (FULLSCAN, SEEKDECODE, etc.) are self-explaining. */
const CAP_DESC: Record<string, string> = {
  FullScan: 'Can index an entire binlog file in one decode pass - eligible to be the indexer.',
  SeekDecode: 'Can decode a single event at a byte offset - powers the detail drawer / jump-to-position.',
  ResumeDecode: 'Can resume decoding from the last committed offset - used for the incremental live tail.',
  RemoteStream: 'Can connect to a MySQL/MariaDB server as a replica and stream its binlogs.',
  RowImages: 'Surfaces before/after row images - needed for the Rows and Diff views.',
}

/** Humanize a byte count into a GiB/MiB/KiB hint for the txn-bytes threshold. */
function humanizeBytes(n: number | null): string {
  if (!n || n <= 0) return ''
  if (n >= GIB) return `= ${(n / GIB).toFixed(2)} GiB`
  if (n >= 1048576) return `= ${(n / 1048576).toFixed(2)} MiB`
  if (n >= 1024) return `= ${(n / 1024).toFixed(2)} KiB`
  return `= ${n} B`
}

/** Section ids - kept identical to the original so external callers don't break. */
const SECTIONS = [
  { id: 'decoding', label: 'Adapters & roles' },
  { id: 'display', label: 'Display' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'streaming', label: 'Remote streaming' },
  { id: 'watch', label: 'Watch' },
  { id: 'advanced', label: 'Backup & transfer' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export interface SettingsViewProps {
  opened?: boolean
  onClose: () => void
  initialSection?: SectionId
  onOpenArchitecture?: () => void
}

export default function SettingsView(props: SettingsViewProps) {
  const { preference, setPreference } = useColorScheme()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [loadError, setLoadError] = useState<string>('')
  const [importError, setImportError] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<SectionId>(props.initialSection ?? 'decoding')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // Number fields as numbers or null when clearing input
  const [pageSize, setPageSize] = useState<number | null>(500)
  const [port, setPort] = useState<number | null>(3306)
  const [serverId, setServerId] = useState<number | null>(1)
  const [maxSpoolGib, setMaxSpoolGib] = useState<number | null>(0)
  const [txnBytes, setTxnBytes] = useState<number | null>(0)
  const [txnRows, setTxnRows] = useState<number | null>(0)
  const [txnSeconds, setTxnSeconds] = useState<number | null>(0)
  const [eventRows, setEventRows] = useState<number | null>(0)

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

  if (props.opened === false) return null

  if (!settings)
    return (
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open) props.onClose()
        }}
      >
        <DialogPopup className="max-w-4xl sm:h-[min(80vh,640px)]" closeProps={{ 'aria-label': 'Close settings' }}>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <DialogPanel className="min-h-0 flex-1">
            {loadError ? (
              <Alert variant="error">
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            ) : (
              'loading...'
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    )

  const indexerOptions = adapters.filter((a) => a.capabilities.FullScan).map((a) => ({ value: a.name, label: a.name }))
  const detailOptions = adapters
    .filter((a) => a.capabilities.FullScan || a.capabilities.SeekDecode)
    .map((a) => ({ value: a.name, label: a.name }))

  const isNumericValid = (n: number | null, min = 0) => n !== null && !Number.isNaN(n) && n >= min

  const canSave =
    isNumericValid(pageSize, 1) &&
    isNumericValid(port, 1) &&
    isNumericValid(serverId, 1) &&
    isNumericValid(maxSpoolGib, 0) &&
    isNumericValid(txnBytes, 0) &&
    isNumericValid(txnRows, 0) &&
    isNumericValid(txnSeconds, 0) &&
    isNumericValid(eventRows, 0)

  /** Build payload with all numeric state coerced (fallback to safe defaults). */
  const buildPayload = (): Settings | null => {
    if (!settings || !canSave) return null
    return {
      ...settings,
      page_size: pageSize!,
      anomaly: {
        txn_bytes: txnBytes!,
        txn_rows: txnRows!,
        txn_seconds: txnSeconds!,
        event_rows: eventRows!,
      },
      stream: {
        ...settings.stream,
        port: port!,
        server_id: serverId!,
        max_spool_bytes: Math.round((maxSpoolGib || 0) * GIB),
      },
    }
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v })

  const save = () => {
    if (!canSave) return
    const payload = buildPayload()
    if (!payload) return
    setBusy(true)
    api
      .saveSettings(payload)
      .then((saved) => {
        setSettings(saved)
        toastManager.add({
          type: 'info',
          title: 'Settings saved',
          description: 'Settings saved successfully',
        })
        props.onClose?.()
      })
      .catch((e: unknown) => {
        toastManager.add({
          type: 'error',
          title: 'Save failed',
          description: e instanceof Error ? e.message : String(e),
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
        toastManager.add({
          type: 'info',
          title: 'Settings imported',
          description: 'Imported - review and Save to apply',
        })
      })
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'failed to read file')
      })
  }

  const txnBytesHint = humanizeBytes(txnBytes)

  return (
    <Dialog
      open={props.opened ?? true}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogPopup className="max-w-4xl sm:h-[min(80vh,640px)]" closeProps={{ 'aria-label': 'Close settings' }}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <DialogPanel className="min-h-0 flex-1">
          <Tabs
            value={active}
            orientation="vertical"
            className="min-h-0 items-start sm:flex-row"
            onValueChange={(v) => setActive((v as SectionId) ?? 'decoding')}
          >
            <TabsList className="w-full h-fit shrink-0 rounded-none bg-transparent p-0 sm:w-48 sm:flex-col sm:items-stretch">
                {SECTIONS.map((s) => (
                  <TabsTab key={s.id} value={s.id} className="rounded-md data-active:bg-surface-3 data-active:text-foreground">
                    {s.label}
                  </TabsTab>
                ))}
            </TabsList>

            {/* Adapters & roles */}
            <TabsPanel value="decoding" className="min-w-0">
              <div className="flex flex-col gap-4">
                <div className="space-y-3">
                  <div className="mb-2">Adapters</div>
                  <p className="mb-3">
                    Decoders available to the viewer and what each can do. Hover a capability for a one-line definition,
                    or{' '}
                    <Button variant="link" onClick={() => props.onOpenArchitecture?.()}>
                      learn more
                    </Button>{' '}
                    in How It Works.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left whitespace-nowrap">name</TableHead>
                        <TableHead className="text-left">capabilities</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adapters.map((a) => (
                        <TableRow key={a.name}>
                          <TableCell className="align-top whitespace-nowrap">{a.name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(a.capabilities)
                                .filter(([, v]) => v)
                                .map(([k]) => (
                                  <Tooltip key={k}>
                                    <TooltipTrigger
                                      render={
                                        <span className="inline-flex">
                                          <Badge variant="outline" size="sm" className="cursor-help">
                                            {k}
                                          </Badge>
                                        </span>
                                      }
                                    />
                                    <TooltipPopup>{CAP_DESC[k] ?? k}</TooltipPopup>
                                  </Tooltip>
                                ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3">
                  <div className="mb-2">Roles</div>
                  <p className="mb-3">Which adapter handles indexing, the detail drawer, and the diff oracle.</p>
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                      <div className="flex flex-col gap-1.5 w-full">
                        <Label htmlFor="select-indexer">indexer</Label>
                        <Select
                          value={settings.roles.indexer}
                          onValueChange={(v) => v && set('roles', { ...settings.roles, indexer: v })}
                        >
                          <SelectTrigger id="select-indexer" aria-label="indexer">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectPopup>
                            {indexerOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5 w-full">
                        <Label htmlFor="select-detail">detail</Label>
                        <Select
                          value={settings.roles.detail}
                          onValueChange={(v) => v && set('roles', { ...settings.roles, detail: v })}
                        >
                          <SelectTrigger id="select-detail" aria-label="detail">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectPopup>
                            {detailOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>diff set</Label>
                      <div className="flex flex-wrap items-center gap-4 mt-1.5">
                        {adapters.map((a) => {
                          const isChecked = settings.roles.diff.includes(a.name)
                          return (
                            <label key={a.name} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const next = checked
                                    ? [...settings.roles.diff, a.name]
                                    : settings.roles.diff.filter((d) => d !== a.name)
                                  set('roles', { ...settings.roles, diff: next })
                                }}
                              />
                              <span>{a.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsPanel>

            {/* Display */}
            <TabsPanel value="display" className="min-w-0">
              <div className="flex flex-col gap-4">
                <div className="space-y-3">
                  <div className="mb-2">Theme & Appearance</div>
                  <p className="mb-3">Choose interface appearance or sync with system preferences.</p>
                  <Tabs
                    value={preference}
                    onValueChange={(val) => setPreference(val as ThemePreference)}
                    className="max-w-[300px]"
                  >
                    <TabsList className="w-full">
                      <TabsTab value="dark" className="flex-1">
                        Dark
                      </TabsTab>
                      <TabsTab value="light" className="flex-1">
                        Light
                      </TabsTab>
                      <TabsTab value="auto" className="flex-1">
                        System
                      </TabsTab>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-3">
                  <div className="mb-2">Display</div>
                  <p className="mb-3">Pagination and timestamp display.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-page-size">page size</Label>
                      <NumberField
                        value={pageSize}
                        onValueChange={(v) => setPageSize(v)}
                        min={1}
                        step={1}
                        className="w-full"
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease page size" />
                          <NumberFieldInput id="field-page-size" aria-label="page size" />
                          <NumberFieldIncrement aria-label="Increase page size" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-timezone">timezone</Label>
                      <Select
                        value={settings.timezone}
                        onValueChange={(v) => v && set('timezone', v as Settings['timezone'])}
                      >
                        <SelectTrigger id="field-timezone" aria-label="timezone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="utc">UTC</SelectItem>
                          <SelectItem value="local">local</SelectItem>
                        </SelectPopup>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </TabsPanel>

            {/* Anomalies */}
            <TabsPanel value="anomalies" className="min-w-0">
              <div className="space-y-3">
                <div className="mb-2">Anomaly thresholds</div>
                <p className="mb-3">
                  Limits that flag oversized/long transactions. Saving re-runs anomaly detection on all indexed files.
                </p>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="flex flex-col gap-1.5 w-full">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="field-txn-bytes">txn bytes</Label>
                        {txnBytesHint && <span>{txnBytesHint}</span>}
                      </div>
                      <NumberField
                        value={txnBytes}
                        onValueChange={(v) => setTxnBytes(v)}
                        min={0}
                        step={1}
                        className="w-full"
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease txn bytes" />
                          <NumberFieldInput id="field-txn-bytes" aria-label="txn bytes" />
                          <NumberFieldIncrement aria-label="Increase txn bytes" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-txn-rows">txn rows</Label>
                      <NumberField
                        value={txnRows}
                        onValueChange={(v) => setTxnRows(v)}
                        min={0}
                        step={1}
                        className="w-full"
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease txn rows" />
                          <NumberFieldInput id="field-txn-rows" aria-label="txn rows" />
                          <NumberFieldIncrement aria-label="Increase txn rows" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-txn-seconds">txn seconds</Label>
                      <NumberField
                        value={txnSeconds}
                        onValueChange={(v) => setTxnSeconds(v)}
                        min={0}
                        step={1}
                        className="w-full"
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease txn seconds" />
                          <NumberFieldInput id="field-txn-seconds" aria-label="txn seconds" />
                          <NumberFieldIncrement aria-label="Increase txn seconds" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-event-rows">event rows</Label>
                      <NumberField
                        value={eventRows}
                        onValueChange={(v) => setEventRows(v)}
                        min={0}
                        step={1}
                        className="w-full"
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease event rows" />
                          <NumberFieldInput id="field-event-rows" aria-label="event rows" />
                          <NumberFieldIncrement aria-label="Increase event rows" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                  </div>
                </div>
              </div>
            </TabsPanel>

            {/* Remote streaming */}
            <TabsPanel value="streaming" className="min-w-0">
              <div className="space-y-3">
                <div className="mb-2">Remote streaming</div>
                <p className="mb-3">Stream events directly from a MySQL/MariaDB server via the binlog protocol.</p>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={settings.stream.enabled}
                      onCheckedChange={(checked) => set('stream', { ...settings.stream, enabled: checked })}
                      aria-label="enabled"
                    />
                    <span>enabled</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="stream-host">host</Label>
                      <Input
                        id="stream-host"
                        aria-label="host"
                        autoComplete="off"
                        value={settings.stream.host}
                        onChange={(e) => set('stream', { ...settings.stream, host: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-port">port</Label>
                      <NumberField value={port} onValueChange={(v) => setPort(v)} min={1} step={1} className="w-full">
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease port" />
                          <NumberFieldInput id="field-port" aria-label="port" />
                          <NumberFieldIncrement aria-label="Increase port" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="stream-user">user</Label>
                      <Input
                        id="stream-user"
                        aria-label="user"
                        autoComplete="username"
                        value={settings.stream.user}
                        onChange={(e) => set('stream', { ...settings.stream, user: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="stream-password">password</Label>
                      <Input
                        id="stream-password"
                        aria-label="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder={settings.stream_password_set ? 'stored - type to replace' : ''}
                        value={settings.stream.password}
                        onChange={(e) => set('stream', { ...settings.stream, password: e.target.value })}
                      />
                      {!settings.stream_password_set && <span>not set</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="stream-flavor">flavor</Label>
                      <Select
                        value={settings.stream.flavor}
                        onValueChange={(v) =>
                          v && set('stream', { ...settings.stream, flavor: v as 'mysql' | 'mariadb' })
                        }
                      >
                        <SelectTrigger id="stream-flavor" aria-label="flavor">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="mysql">mysql</SelectItem>
                          <SelectItem value="mariadb">mariadb</SelectItem>
                        </SelectPopup>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-server-id">server id</Label>
                      <NumberField
                        value={serverId}
                        onValueChange={(v) => setServerId(v)}
                        min={1}
                        step={1}
                        className="w-full"
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease server id" />
                          <NumberFieldInput id="field-server-id" aria-label="server id" />
                          <NumberFieldIncrement aria-label="Increase server id" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div className="flex flex-col gap-1.5 w-full">
                      <Label htmlFor="field-max-spool">max spool (GiB)</Label>
                      <NumberField
                        value={maxSpoolGib}
                        onValueChange={(v) => setMaxSpoolGib(v)}
                        min={0}
                        step={0.01}
                        className="w-full"
                      >
                        <NumberFieldGroup>
                          <NumberFieldDecrement aria-label="Decrease max spool" />
                          <NumberFieldInput id="field-max-spool" aria-label="max spool (GiB)" />
                          <NumberFieldIncrement aria-label="Increase max spool" />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                    <div aria-hidden="true" />
                  </div>

                  {settings.stream.enabled && (
                    <Button
                      variant="outline"
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
                            toastManager.add({
                              type: 'info',
                              title: 'Restart scheduled',
                              description: 'Streaming restart scheduled',
                            }),
                          )
                          .catch((e: unknown) =>
                            toastManager.add({
                              type: 'error',
                              title: 'Restart failed',
                              description: e instanceof Error ? e.message : String(e),
                            }),
                          )
                          .finally(() => setBusy(false))
                      }}
                    >
                      {busy ? 'Restarting...' : 'Restart from current position'}
                    </Button>
                  )}
                </div>
              </div>
            </TabsPanel>

            {/* Watch */}
            <TabsPanel value="watch" className="min-w-0">
              <div className="space-y-3">
                <div className="mb-2">Watch</div>
                <p className="mb-3">Local directory scanned for binlog files.</p>
                <p className="mb-3">
                  watching: <code>{settings.watch_dir}</code>
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    api
                      .rescan()
                      .then(() =>
                        toastManager.add({
                          type: 'info',
                          title: 'Rescan scheduled',
                          description: 'Directory rescan scheduled',
                        }),
                      )
                      .catch((e: unknown) =>
                        toastManager.add({
                          type: 'error',
                          title: 'Rescan failed',
                          description: e instanceof Error ? e.message : String(e),
                        }),
                      )
                  }
                >
                  rescan now
                </Button>
              </div>
            </TabsPanel>

            {/* Backup & transfer */}
            <TabsPanel value="advanced" className="min-w-0">
              <div className="flex flex-col gap-4">
                <div className="space-y-3">
                  <div className="mb-2">Backup & Configuration Transfer</div>
                  <p className="mb-3.5">
                    Export your active settings as a JSON file or restore configuration from a previously saved JSON
                    file.
                  </p>
                  <div className="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      render={
                        <a
                          href={`data:application/json,${encodeURIComponent(JSON.stringify(buildPayload() ?? settings, null, 2))}`}
                          download="binsight-settings.json"
                        />
                      }
                    >
                      Export JSON
                    </Button>
                    <Button variant="outline" onClick={() => importInputRef.current?.click()}>
                      Import JSON
                    </Button>
                    <input
                      ref={importInputRef}
                      id="import-json"
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={handleImport}
                    />
                  </div>
                  {importError && (
                    <Alert variant="error" role="alert" aria-live="assertive" className="mt-3">
                      <AlertDescription>{importError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </TabsPanel>
          </Tabs>
        </DialogPanel>

        {/* Modal footer: Cancel / Save */}
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !canSave} aria-label="Save settings">
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
