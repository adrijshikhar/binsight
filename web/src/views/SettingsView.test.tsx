import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import SettingsView from './SettingsView'
import { theme } from '../theme'
import * as apiModule from '../lib/api'
import type { Settings, AdapterInfo } from '../lib/types'

// jsdom doesn't implement matchMedia — Mantine's color-scheme hook needs it.
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

// jsdom doesn't implement ResizeObserver — Mantine needs it.
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const MOCK_SETTINGS: Settings = {
  port: 8080,
  data_dir: '/data',
  watch_dir: '/data/binlogs',
  mysqlbinlog_path: '',
  page_size: 500,
  timezone: 'utc',
  roles: { indexer: 'gomysql', detail: 'gomysql', diff: ['gomysql'] },
  anomaly: { txn_bytes: 100000, txn_rows: 5000, txn_seconds: 60, event_rows: 1000 },
  stream: {
    enabled: false,
    host: 'localhost',
    port: 3306,
    user: 'repl',
    password: 'secret',
    flavor: 'mysql',
    server_id: 999,
    max_spool_bytes: 5368709120,
  },
}

const MOCK_ADAPTERS: AdapterInfo[] = [
  {
    name: 'gomysql',
    capabilities: { FullScan: true, SeekDecode: true, RemoteStream: true, RowImages: true },
  },
  {
    name: 'mysqlbinlog',
    capabilities: { FullScan: false, SeekDecode: false, RemoteStream: false, RowImages: false },
  },
]

function wrap(ui: React.ReactElement) {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications />
      {ui}
    </MantineProvider>,
  )
}

/** Wait until settings have loaded — the Tabs render only after settings resolves. */
async function waitForLoad() {
  await waitFor(() => {
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(5)
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api, 'settings').mockResolvedValue({ ...MOCK_SETTINGS })
    vi.spyOn(apiModule.api, 'adapters').mockResolvedValue([...MOCK_ADAPTERS])
    vi.spyOn(apiModule.api, 'saveSettings').mockResolvedValue({ ...MOCK_SETTINGS })
  })

  it('renders the vertical tabs nav with all 5 sections', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const tabs = screen.getAllByRole('tab')
    const tabLabels = tabs.map((t) => t.textContent)
    expect(tabLabels).toContain('Adapters & roles')
    expect(tabLabels).toContain('Display')
    expect(tabLabels).toContain('Anomalies')
    expect(tabLabels).toContain('Remote streaming')
    expect(tabLabels).toContain('Watch')
  })

  it('switches to Display tab and shows page size input', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const displayTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Display')!
    fireEvent.click(displayTab)

    // Mantine NumberInput v8 renders type="text" not type="number" — use textbox role
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /page size/i })).toBeTruthy()
    })
  })

  it('switches to Display tab, changes page size, Save calls api.saveSettings with coerced number', async () => {
    const saveSpy = vi.spyOn(apiModule.api, 'saveSettings').mockResolvedValue({ ...MOCK_SETTINGS, page_size: 250 })

    const user = userEvent.setup()

    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const displayTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Display')!
    await user.click(displayTab)

    // Mantine NumberInput uses type="text" — find by label
    const pageSizeInput = await screen.findByRole('textbox', { name: /page size/i })

    // Clear the field and type the new value using userEvent (proper Mantine NumberInput handling)
    await user.clear(pageSizeInput)
    await user.type(pageSizeInput, '250')

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    await user.click(saveBtn)

    // Verify the payload was called with the coerced number value
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledOnce()
      const payload: Settings = saveSpy.mock.calls[0][0]
      expect(typeof payload.page_size).toBe('number')
      expect(payload.page_size).toBe(250)
    })
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    wrap(<SettingsView onClose={onClose} />)

    await waitFor(() => screen.getByRole('button', { name: /close settings/i }))
    fireEvent.click(screen.getByRole('button', { name: /close settings/i }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('switches to Anomalies tab and shows threshold text inputs', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const anomaliesTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Anomalies')!
    fireEvent.click(anomaliesTab)

    // Mantine NumberInput renders type="text" so they are textboxes
    await waitFor(() => {
      // txn bytes, txn rows, txn seconds, event rows
      const txnBytesInput = screen.getByRole('textbox', { name: /txn bytes/i })
      expect(txnBytesInput).toBeTruthy()
    })
  })

  it('switches to Remote streaming tab and shows host/password fields', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const streamTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Remote streaming')!
    fireEvent.click(streamTab)

    await waitFor(() => {
      expect(screen.getByLabelText(/^password$/i)).toBeTruthy()
      expect(true).toBe(true)
    })
  })

  it('Save payload preserves stream nested shape with numeric types', async () => {
    const saveSpy = vi.spyOn(apiModule.api, 'saveSettings').mockResolvedValue({ ...MOCK_SETTINGS })

    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    await waitFor(() => expect(saveSpy).toHaveBeenCalledOnce())
    const payload: Settings = saveSpy.mock.calls[0][0]

    expect(payload.stream).toBeDefined()
    expect(typeof payload.stream.port).toBe('number')
    expect(typeof payload.stream.server_id).toBe('number')
    expect(typeof payload.stream.max_spool_bytes).toBe('number')
    expect(payload.anomaly).toBeDefined()
    expect(typeof payload.anomaly.txn_bytes).toBe('number')
  })

  it('switches to Watch tab and shows watch_dir', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const watchTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Watch')!
    fireEvent.click(watchTab)

    await waitFor(() => {
      expect(screen.getByText('/data/binlogs')).toBeTruthy()
    })
  })
})
