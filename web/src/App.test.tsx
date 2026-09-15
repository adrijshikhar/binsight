import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import App from './App'
import { ColorSchemeProvider } from './lib/colorScheme'
import { api } from './lib/api'

// jsdom doesn't implement matchMedia - Mantine's color-scheme hook needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom doesn't implement ResizeObserver - Mantine's SegmentedControl needs it.
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Stub EventSource - not available in jsdom
class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  close() {}
}
vi.stubGlobal('EventSource', MockEventSource)

// Mock the api module so EventsView (wired in the events tab) doesn't fire real fetches.
vi.mock('./lib/api', () => ({
  api: {
    files: vi.fn(() => Promise.resolve([])),
    events: vi.fn(() => Promise.resolve({ events: [], next_cursor: 0, total: 0 })),
    tables: vi.fn(() => Promise.resolve([])),
    anomalies: vi.fn(() => Promise.resolve([])),
    streamStatus: vi.fn(() =>
      Promise.resolve({ state: 'disabled', file: '', pos: 0, last_event_ts: 0, skipped_events: 0 }),
    ),
    settings: vi.fn(() =>
      Promise.resolve({
        port: 8080,
        data_dir: '/data',
        watch_dir: '/data/binlogs',
        mysqlbinlog_path: '',
        page_size: 500,
        timezone: 'utc',
        roles: { indexer: 'gomysql', detail: 'gomysql', diff: ['gomysql'] },
        anomaly: { txn_bytes: 0, txn_rows: 0, txn_seconds: 0, event_rows: 0 },
        stream: {
          enabled: false,
          host: 'localhost',
          port: 3306,
          user: '',
          password: '',
          flavor: 'mysql',
          server_id: 1,
          max_spool_bytes: 0,
        },
      }),
    ),
    adapters: vi.fn(() => Promise.resolve([])),
  },
}))

// Stub fetch - fallback for any remaining non-api.ts fetch calls
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }),
  )
})

async function renderApp() {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <ColorSchemeProvider>
        <App />
      </ColorSchemeProvider>,
    )
  })
  // Let any post-render state updates (fetch mock resolutions) settle.
  await waitFor(() => {})
  return result
}

describe('App - AppShell + tab routing', () => {
  afterEach(() => {
    // Reset URL so tests don't pollute each other via readUrlState().
    window.history.replaceState(null, '', '/')
  })

  it('renders the 6 data tabs', async () => {
    await renderApp()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(6)
    const labels = tabs.map((t) => t.textContent)
    expect(labels).toContain('Overview')
    expect(labels).toContain('Events')
    expect(labels).toContain('Transactions')
    expect(labels).toContain('Tables')
    expect(labels).toContain('Anomalies')
    expect(labels).toContain('Schema/DDL')
  })

  it('does not reinterpret later event URL updates as startup deep links', async () => {
    window.history.replaceState(null, '', '/?file=1&tab=events')
    await renderApp()
    vi.mocked(api.events).mockClear()
    window.history.replaceState(null, '', '/?file=1&tab=events&event=4')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    })
    expect(api.events).not.toHaveBeenCalledWith(expect.objectContaining({ from_pos: 4, to_pos: 4 }))
  })

  it('overview tab is selected by default', async () => {
    await renderApp()
    const tabs = screen.getAllByRole('tab')
    const overview = tabs.find((t) => t.textContent === 'Overview')
    expect(overview).toBeDefined()
    expect(overview?.getAttribute('aria-selected')).toBe('true')
  })

  it('clicking a tab sets aria-selected on that tab', async () => {
    await renderApp()
    const tabs = screen.getAllByRole('tab')
    const eventsTab = tabs.find((t) => t.textContent === 'Events')!
    fireEvent.click(eventsTab)
    expect(eventsTab.getAttribute('aria-selected')).toBe('true')
    // Overview should now be deselected
    const overviewTab = tabs.find((t) => t.textContent === 'Overview')!
    expect(overviewTab.getAttribute('aria-selected')).toBe('false')
  })

  it('clicking each tab updates aria-selected correctly', async () => {
    await renderApp()
    const tabs = screen.getAllByRole('tab')
    for (const tab of tabs) {
      fireEvent.click(tab)
      expect(tab.getAttribute('aria-selected')).toBe('true')
      // All others should be false
      for (const other of tabs) {
        if (other !== tab) {
          expect(other.getAttribute('aria-selected')).toBe('false')
        }
      }
    }
  })

  it('renders the brand text in the header', async () => {
    await renderApp()
    expect(screen.getByText('binsight')).toBeTruthy()
  })

  it('opens the Settings modal when URL has ?tab=settings', async () => {
    window.history.replaceState(null, '', '/?tab=settings')
    await renderApp()
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    })
  })

  it('renders Live switch on FilterBar only when Events tab is active', async () => {
    await renderApp()
    // Overview tab is active by default; Live switch must not be present
    expect(screen.queryByRole('switch', { name: /follow new events as they are indexed/i })).toBeNull()

    // Switch to Events tab
    const eventsTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Events')!
    fireEvent.click(eventsTab)

    // Live switch should now appear in the FilterBar
    const switchEl = screen.getByRole('switch', { name: /follow new events as they are indexed/i })
    expect(switchEl).toBeTruthy()
    expect(switchEl.getAttribute('aria-checked')).toBe('false')

    // Toggling the switch updates its state
    fireEvent.click(switchEl)
    expect(switchEl.getAttribute('aria-checked')).toBe('true')
  })

  it('renders Settings button on the right side of the header', async () => {
    await renderApp()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  it('switches to Settings view, accesses How It Works tab, and returns to Inspector', async () => {
    await renderApp()

    // Switch to Events tab first
    const eventsTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Events')!
    fireEvent.click(eventsTab)
    expect(eventsTab.getAttribute('aria-selected')).toBe('true')

    const settingsBtn = screen.getByRole('button', { name: 'Settings' })

    // Click Settings button
    fireEvent.click(settingsBtn)

    // Modal dialog is displayed
    const modal = await screen.findByRole('dialog', { name: 'Settings' })
    expect(modal).toBeTruthy()

    // Inside Settings, click the "How it works" tab
    const howTab = screen.getAllByRole('tab').find((t) => t.textContent === 'How it works')!
    fireEvent.click(howTab)
    expect(screen.getByText(/- Pluggable Decoder Architecture/)).toBeTruthy()

    // Click Cancel to close modal
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      const restoredEventsTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Events')
      expect(restoredEventsTab?.getAttribute('aria-selected')).toBe('true')
    })
  })
})
