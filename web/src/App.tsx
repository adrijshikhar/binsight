import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogPopup, DialogTitle, DialogHeader, DialogPanel } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconAlertTriangle, IconArrowLeft, IconBinary, IconDatabase, IconSettings } from '@tabler/icons-react'
import { api } from './lib/api'
import type { Anomaly, BinlogFile, EventRow, Severity, StreamStatus } from './lib/types'
import Sidebar from './components/Sidebar'
import { readUrlState, writeUrlState, pushUrlState } from './lib/url'
import { SSEContext, type IndexEvent } from './lib/sse'
import {
  loadPrefs,
  savePrefs,
  clampWidth,
  loadDrawerWidth,
  saveDrawerWidth,
  clampDrawerWidth,
} from './lib/sidebarPrefs'
import EventsView from './views/EventsView'
import OverviewView from './views/OverviewView'
import TxnsView from './views/TxnsView'
import TablesView from './views/TablesView'
import AnomaliesView from './views/AnomaliesView'
import SchemaView from './views/SchemaView'
import SettingsView from './views/SettingsView'
import ArchitectureView from './views/ArchitectureView'
import Drawer from './components/Drawer'
import { Agentation } from 'agentation'

export type MainTab =
  'overview' | 'events' | 'txns' | 'tables' | 'anomalies' | 'schema' | 'settings' | 'architecture' | 'how-it-works'

const VALID_TABS = new Set<MainTab>([
  'overview',
  'events',
  'txns',
  'tables',
  'anomalies',
  'schema',
  'settings',
  'architecture',
  'how-it-works',
])

// tab strip (file views) vs full-page views shown without the strip
const FULL_PAGE_TABS = new Set<MainTab>()

function isValidTab(s: string | undefined): s is MainTab {
  return VALID_TABS.has(s as MainTab)
}

function normalizeTab(s: string | undefined): MainTab {
  if (isValidTab(s) && s !== 'settings' && s !== 'architecture' && s !== 'how-it-works') return s
  return 'overview'
}

export default function App() {
  // Restore file/tab from URL on first mount
  const [initialUrl] = useState(readUrlState)
  const [files, setFiles] = useState<BinlogFile[]>([])
  const [fileId, setFileId] = useState<number>(initialUrl.file ?? 0)
  const [tab, setTab] = useState<MainTab>(normalizeTab(initialUrl.tab))
  const [settingsOpen, setSettingsOpen] = useState(
    initialUrl.tab === 'settings' || initialUrl.tab === 'architecture' || initialUrl.tab === 'how-it-works',
  )
  const [architectureOpen, setArchitectureOpen] = useState(
    initialUrl.tab === 'architecture' || initialUrl.tab === 'how-it-works',
  )
  const [settingsSection, setSettingsSection] = useState<
    'decoding' | 'how-it-works' | 'display' | 'anomalies' | 'streaming' | 'watch'
  >(() => {
    return initialUrl.tab === 'how-it-works' || initialUrl.tab === 'architecture' ? 'how-it-works' : 'decoding'
  })
  const [lastInspectorTab, setLastInspectorTab] = useState<MainTab>(() => {
    const t = normalizeTab(initialUrl.tab)
    return t
  })

  // Remember the last active inspector tab so closing Settings/Architecture returns to it
  useEffect(() => {
    setLastInspectorTab(tab)
  }, [tab])

  const activePanelRef = useRef<HTMLDivElement | null>(null)

  const [selected, setSelected] = useState<EventRow | null>(null)
  const [txnIds, setTxnIds] = useState<number[]>(() => {
    const t = readUrlState().txn
    return t
      ? t
          .split(',')
          .map(Number)
          .filter((n) => n > 0)
      : []
  })
  const [dbFilter, setDbFilter] = useState<string>('')
  const [tableFilter, setTableFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [filesErr, setFilesErr] = useState<string>('')
  const [lastIndexEvent, setLastIndexEvent] = useState<IndexEvent | null>(null)
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null)
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [live, setLive] = useState(false)
  // Monotonic SSE sequence; starts at 1 on first event (0 = "no event yet" sentinel).
  const sseSeqRef = useRef(0)

  // Live follow mode is per-file: reset when active file changes
  useEffect(() => {
    setLive(false)
  }, [fileId])

  // Sidebar layout: collapsed (icon rail) + expanded width, persisted to
  // localStorage so the layout survives reloads.
  const [sidebar, setSidebar] = useState(loadPrefs)
  useEffect(() => {
    savePrefs(sidebar)
  }, [sidebar])
  const toggleSidebar = () => setSidebar((s) => ({ ...s, collapsed: !s.collapsed }))

  // Drag the right edge to resize the expanded sidebar. Tracks the pointer on
  // window so the drag continues even when the cursor leaves the thin handle.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebar.width
    const onMove = (ev: PointerEvent) =>
      setSidebar((s) => ({ ...s, width: clampWidth(startW + (ev.clientX - startX)) }))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Drawer (right panel) width: drag its LEFT edge - moving left widens it.
  const [drawerWidth, setDrawerWidth] = useState(loadDrawerWidth)
  useEffect(() => {
    saveDrawerWidth(drawerWidth)
  }, [drawerWidth])
  const startDrawerResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = drawerWidth
    const onMove = (ev: PointerEvent) => setDrawerWidth(clampDrawerWidth(startW + (startX - ev.clientX)))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Load anomalies whenever the active file changes (or after SSE triggers a
  // file-list refresh that may update anomaly_count).
  useEffect(() => {
    if (!fileId) return
    api
      .anomalies(fileId)
      .then(setAnomalies)
      .catch(() => setAnomalies([]))
  }, [fileId])

  // Ref to the current fileId so refreshFiles stays referentially stable - the
  // SSE connection + poll interval are then set up once, not torn down and
  // recreated on every file switch.
  const fileIdRef = useRef(fileId)
  fileIdRef.current = fileId

  const refreshFiles = useCallback(() => {
    api
      .files()
      .then((fs) => {
        setFiles(fs)
        setFilesErr('')
        const fid = fileIdRef.current
        if (!fid && fs.length > 0) setFileId(fs[0].id)
        // If the selected file was deleted/staled out of the list, reset selection.
        // Guard on a non-empty list so a transient empty poll response doesn't
        // blank the current selection.
        if (fid && fs.length > 0 && !fs.some((f) => f.id === fid)) setFileId(fs[0].id)
      })
      .catch((e: unknown) => setFilesErr(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    refreshFiles()
    const es = new EventSource('/api/stream')
    // Trailing-edge debounce: refresh 750ms after the last SSE message,
    // coalescing bursts to avoid a refresh storm during active indexing.
    let sseTimer: ReturnType<typeof setTimeout> | undefined
    es.onmessage = (e) => {
      clearTimeout(sseTimer)
      sseTimer = setTimeout(refreshFiles, 750)
      try {
        const m: unknown = JSON.parse(e.data)
        if (typeof m === 'object' && m !== null && 'type' in m) {
          const rec = m as Record<string, unknown>
          if (
            rec.type === 'stream_status' &&
            typeof rec.status === 'object' &&
            rec.status !== null &&
            typeof (rec.status as Record<string, unknown>).state === 'string'
          ) {
            setStreamStatus(rec.status as StreamStatus)
          } else if ('file_id' in rec && typeof rec.file_id === 'number' && typeof rec.type === 'string') {
            setLastIndexEvent({ type: rec.type, file_id: rec.file_id, seq: ++sseSeqRef.current })
          }
        }
      } catch (ex) {
        // SyntaxError = non-JSON keep-alive/comment line (expected). Anything
        // else is an unexpected payload worth surfacing.
        if (!(ex instanceof SyntaxError)) console.warn('sse: unexpected payload', ex)
      }
    }
    // Steady-state poll every 5s.
    const t = setInterval(refreshFiles, 5000)
    // Poll stream status every 10s as fallback when SSE stream_status messages are absent.
    const streamPoll = setInterval(() => {
      api
        .streamStatus()
        .then(setStreamStatus)
        .catch(() => {})
    }, 10000)
    return () => {
      es.close()
      clearInterval(t)
      clearInterval(streamPoll)
      clearTimeout(sseTimer)
    }
  }, [refreshFiles])

  // Open a deep-linked event (?event=<pos>) once files are available.
  // Fires at most once (ref guard): initialUrl is a mount snapshot, so without
  // this the effect would re-run on every close (selected→null) and reopen the
  // drawer from the stale URL pos.
  const deepLinked = useRef(false)
  useEffect(() => {
    if (deepLinked.current || !initialUrl.event || !fileId) return
    deepLinked.current = true
    api
      .events({ file: fileId, from_pos: initialUrl.event, to_pos: initialUrl.event, limit: 1 })
      .then((page) => {
        if (page.events[0]) setSelected(page.events[0])
      })
      .catch(() => {
        /* deep-linked event not found - ignore */
      })
  }, [fileId, initialUrl.event])

  // Sync file / tab / selected event to URL. The first sync (mount) and any
  // sync triggered by a Back/Forward (popstate) only REPLACE - they must not
  // add history. Every other navigation PUSHES a history entry so the browser
  // Back button returns to the previous in-app view instead of leaving the site.
  const firstSync = useRef(true)
  const fromPop = useRef(false)
  const [navKey, setNavKey] = useState(0)
  useEffect(() => {
    const isGlobal = FULL_PAGE_TABS.has(tab)
    const s = isGlobal
      ? {
          tab,
          file: undefined,
          event: undefined,
          txn: undefined,
          type: undefined,
          db: undefined,
          table: undefined,
          q: undefined,
        }
      : {
          file: fileId || undefined,
          tab: tab !== 'overview' ? tab : undefined,
          event: selected?.pos || undefined,
          txn: txnIds.length ? txnIds.join(',') : undefined,
        }
    if (firstSync.current) {
      firstSync.current = false
      writeUrlState(s)
      return
    }
    if (fromPop.current) {
      fromPop.current = false
      return
    } // URL already restored by the browser
    pushUrlState(s)
  }, [fileId, tab, selected, txnIds])

  // Back/Forward: restore view state from the URL and remount EventsView so its
  // filters re-derive from the restored query string.
  useEffect(() => {
    const onPop = () => {
      const u = readUrlState()
      fromPop.current = true
      setFileId(u.file ?? 0)
      setTab(normalizeTab(u.tab))
      setDbFilter('')
      setTableFilter('')
      setTypeFilter('')
      setTxnIds(
        u.txn
          ? u.txn
              .split(',')
              .map(Number)
              .filter((n) => n > 0)
          : [],
      )
      setNavKey((k) => k + 1)
      if (u.event) {
        api
          .events({ file: u.file ?? 0, from_pos: u.event, to_pos: u.event, limit: 1 })
          .then((page) => setSelected(page.events[0] ?? null))
          .catch(() => setSelected(null))
      } else {
        setSelected(null)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const file = files.find((f) => f.id === fileId)

  const { txnSeverity, posSeverity } = useMemo(() => {
    const txn = new Map<number, Severity>()
    const pos = new Map<number, Severity>()
    for (const a of anomalies) {
      if (a.txn_id) txn.set(a.txn_id, a.severity)
      if (a.event_pos) pos.set(a.event_pos, a.severity)
    }
    return { txnSeverity: txn, posSeverity: pos }
  }, [anomalies])

  // Open a single event by pos: switch to Events tab and open the drawer.
  const openEvent = (pos: number) => {
    setTab('events')
    api
      .events({ file: fileId, from_pos: pos, to_pos: pos, limit: 1 })
      .then((page) => {
        if (page.events[0]) setSelected(page.events[0])
      })
      .catch(() => {
        /* event not found - ignore */
      })
  }

  // Add a txn to the multi-select filter and switch to Events tab.
  const openTxn = (id: number) => {
    setTxnIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setTab('events')
  }

  const tabs: MainTab[] = ['overview', 'events', 'txns', 'tables', 'anomalies', 'schema']
  const tabLabel = (t: MainTab) =>
    t === 'overview'
      ? 'Overview'
      : t === 'events'
        ? 'Events'
        : t === 'txns'
          ? 'Transactions'
          : t === 'tables'
            ? 'Tables'
            : t === 'anomalies'
              ? 'Anomalies'
              : t === 'schema'
                ? 'Schema/DDL'
                : t

  return (
    <SSEContext.Provider value={lastIndexEvent}>
      <div className="app-prose flex h-dvh w-full flex-col overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          {/* Left side: Brand + Active File breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="app-brand shrink-0">
              <span className="app-brand-icon">
                <svg className="app-brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" />
                </svg>
              </span>
              <span>binsight</span>
            </span>

            {file && (
              <div className="flex items-center gap-1 min-w-0">
                <span />
                <span className="truncate">
                  {file.path.split('/').slice(0, -1).join('/') || '/'}
                  <span className="mx-1">/</span>
                  <span>{file.path.split('/').pop()}</span>
                </span>
              </div>
            )}
          </div>

          {/* Right side: Settings button */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setArchitectureOpen(true)} aria-label="Architecture">
              Architecture
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSettingsSection('decoding')
                setSettingsOpen(true)
              }}
              aria-label="Settings"
            >
              <IconSettings size={14} />
              Settings
            </Button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {!FULL_PAGE_TABS.has(tab) && (
            <nav
              className="relative h-full shrink-0 overflow-hidden border-r"
              style={{ width: sidebar.collapsed ? 48 : sidebar.width }}
              aria-label="Binlog files"
            >
              <Sidebar
                files={files}
                activeId={fileId}
                collapsed={sidebar.collapsed}
                onToggle={toggleSidebar}
                onSelect={(id) => {
                  setFileId(id)
                  setTab('overview')
                }}
                onSettings={() => {
                  setSettingsSection('decoding')
                  setSettingsOpen(true)
                }}
                onArchitecture={() => {
                  setArchitectureOpen(true)
                }}
                streamStatus={streamStatus ?? undefined}
              />
              {!sidebar.collapsed && (
                <div
                  onPointerDown={startResize}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    const STEP = 20
                    if (e.key === 'ArrowRight') {
                      e.preventDefault()
                      setSidebar((s) => ({ ...s, width: clampWidth(s.width + STEP) }))
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault()
                      setSidebar((s) => ({ ...s, width: clampWidth(s.width - STEP) }))
                    }
                  }}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize sidebar"
                  aria-valuenow={sidebar.width}
                  aria-valuemin={150}
                  aria-valuemax={480}
                  tabIndex={0}
                  title="Drag or use Arrow keys to resize"
                  className="absolute inset-y-0 right-0 w-1 cursor-col-resize"
                />
              )}
            </nav>
          )}

          <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            {filesErr && !FULL_PAGE_TABS.has(tab) && (
              <Alert variant="error">
                <IconAlertTriangle size={16} />
                <AlertDescription className="flex items-center justify-between">
                  <span>file list unavailable: {filesErr}</span>
                  <Button variant="outline" onClick={refreshFiles}>
                    retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {!FULL_PAGE_TABS.has(tab) && (
                <Tabs
                  value={tab}
                  onValueChange={(value) => {
                    if (value !== 'events') setSelected(null)
                    setTab(value as MainTab)
                  }}
                  className="shrink-0 overflow-x-auto"
                >
                  <TabsList aria-label="Views">
                    {tabs.map((t) => (
                      <TabsTab key={t} value={t} id={`tab-${t}`} aria-controls={`tabpanel-${t}`}>
                        {tabLabel(t)}
                      </TabsTab>
                    ))}
                  </TabsList>
                </Tabs>
              )}
              {files.length === 0 && !filesErr && !FULL_PAGE_TABS.has(tab) && (
                <div role="status" className="p-6">
                  No binlog files found.
                </div>
              )}

              {/* Tab content - animated on tab switch */}
              <div ref={activePanelRef} className="flex min-h-0 flex-1 flex-col overflow-auto">
                {tab === 'overview' && (
                  <div
                    id="tabpanel-overview"
                    role="tabpanel"
                    aria-labelledby="tab-overview"
                    tabIndex={0}
                    className="flex min-h-0 flex-1 flex-col overflow-auto"
                  >
                    {file ? (
                      <OverviewView
                        file={file}
                        onOpenType={(type) => {
                          setTypeFilter(type)
                          setTab('events')
                        }}
                        onOpenEvent={(pos) => {
                          setTab('events')
                          api
                            .events({ file: fileId, from_pos: pos, to_pos: pos, limit: 1 })
                            .then((page) => {
                              if (page.events[0]) setSelected(page.events[0])
                            })
                            .catch(() => {})
                        }}
                        onOpenTxn={(id) => {
                          setTxnIds([id])
                          setTab('events')
                        }}
                        anomalies={anomalies}
                        onShowAnomalies={() => setTab('anomalies')}
                      />
                    ) : (
                      <div className="p-6">no file selected</div>
                    )}
                  </div>
                )}
                {tab === 'events' && (
                  <div
                    id="tabpanel-events"
                    role="tabpanel"
                    aria-labelledby="tab-events"
                    tabIndex={0}
                    className="flex min-h-0 flex-1 flex-col overflow-auto"
                  >
                    <EventsView
                      key={navKey}
                      fileId={fileId}
                      txnIds={txnIds}
                      dbFilter={dbFilter}
                      tableFilter={tableFilter}
                      typeFilter={typeFilter}
                      selectedPos={selected?.pos ?? -1}
                      onSelect={(e) => setSelected(e)}
                      posSeverity={posSeverity}
                      onConsumeFilters={() => {
                        setDbFilter('')
                        setTableFilter('')
                        setTypeFilter('')
                      }}
                      onRemoveTxn={(id) => setTxnIds((ids) => ids.filter((i) => i !== id))}
                      live={live}
                      onToggleLive={setLive}
                    />
                  </div>
                )}
                {tab === 'txns' && (
                  <div
                    id="tabpanel-txns"
                    role="tabpanel"
                    aria-labelledby="tab-txns"
                    tabIndex={0}
                    className="flex min-h-0 flex-1 flex-col overflow-auto"
                  >
                    {fileId > 0 && <TxnsView fileId={fileId} onOpenTxn={openTxn} txnSeverity={txnSeverity} />}
                  </div>
                )}
                {tab === 'tables' && (
                  <div
                    id="tabpanel-tables"
                    role="tabpanel"
                    aria-labelledby="tab-tables"
                    tabIndex={0}
                    className="flex min-h-0 flex-1 flex-col overflow-auto"
                  >
                    {fileId > 0 && (
                      <TablesView
                        fileId={fileId}
                        onOpenTable={(db, table) => {
                          setDbFilter(db)
                          setTableFilter(table)
                          setTab('events')
                        }}
                      />
                    )}
                  </div>
                )}
                {tab === 'anomalies' && (
                  <div
                    id="tabpanel-anomalies"
                    role="tabpanel"
                    aria-labelledby="tab-anomalies"
                    tabIndex={0}
                    className="flex min-h-0 flex-1 flex-col overflow-auto"
                  >
                    {fileId > 0 && <AnomaliesView fileId={fileId} onOpenTxn={openTxn} onOpenEvent={openEvent} />}
                  </div>
                )}
                {tab === 'schema' && (
                  <div
                    id="tabpanel-schema"
                    role="tabpanel"
                    aria-labelledby="tab-schema"
                    tabIndex={0}
                    className="flex min-h-0 flex-1 flex-col overflow-auto"
                  >
                    {fileId > 0 && <SchemaView fileId={fileId} onOpenEvent={openEvent} />}
                  </div>
                )}
              </div>
            </div>
          </main>

          {selected && tab === 'events' && (
            <div className="h-full shrink-0 overflow-hidden border-l" style={{ width: drawerWidth }}>
              <Drawer
                fileId={fileId}
                event={selected}
                width={drawerWidth}
                onResizeStart={startDrawerResize}
                onWidthChange={setDrawerWidth}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      </div>
      <SettingsView opened={settingsOpen} onClose={() => setSettingsOpen(false)} initialSection={settingsSection} />
      <Dialog open={architectureOpen} onOpenChange={setArchitectureOpen}>
        <DialogPopup className="max-w-5xl" closeProps={{ 'aria-label': 'Close architecture' }}>
          <DialogHeader>
            <DialogTitle className="sr-only">Architecture</DialogTitle>
          </DialogHeader>
          <DialogPanel className="min-h-0 overflow-auto">
            <ArchitectureView />
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      {showAgentation && <Agentation endpoint="http://localhost:4747" />}
    </SSEContext.Provider>
  )
}

const showAgentation =
  typeof window !== 'undefined' &&
  import.meta.env.MODE !== 'test' &&
  (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
