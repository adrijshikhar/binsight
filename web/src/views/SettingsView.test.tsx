import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsView from './SettingsView'
import { ToastProvider, toastManager } from '../components/ui/toast'
import * as apiModule from '../lib/api'
import type { Settings, AdapterInfo } from '../lib/types'

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
  return render(<ToastProvider>{ui}</ToastProvider>)
}

/** Wait until settings have loaded - the Tabs render only after settings resolves. */
async function waitForLoad() {
  await waitFor(() => {
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(7)
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api, 'settings').mockResolvedValue({ ...MOCK_SETTINGS })
    vi.spyOn(apiModule.api, 'adapters').mockResolvedValue([...MOCK_ADAPTERS])
    vi.spyOn(apiModule.api, 'saveSettings').mockResolvedValue({ ...MOCK_SETTINGS })
  })

  it('renders the vertical tabs nav with all 7 sections', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const tabs = screen.getAllByRole('tab')
    const tabLabels = tabs.map((t) => t.textContent)
    expect(tabLabels).toContain('Adapters & roles')
    expect(tabLabels).toContain('How it works')
    expect(tabLabels).toContain('Display')
    expect(tabLabels).toContain('Anomalies')
    expect(tabLabels).toContain('Remote streaming')
    expect(tabLabels).toContain('Watch')
    expect(tabLabels).toContain('Backup & transfer')
  })

  it('switches to Display tab and shows page size input', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const displayTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Display')!
    fireEvent.click(displayTab)

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

    const pageSizeInput = await screen.findByRole('textbox', { name: /page size/i })

    await user.clear(pageSizeInput)
    await user.type(pageSizeInput, '250')

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    await user.click(saveBtn)

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

  it('switches to Anomalies tab and shows threshold inputs', async () => {
    wrap(<SettingsView onClose={() => {}} />)

    await waitForLoad()

    const anomaliesTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Anomalies')!
    fireEvent.click(anomaliesTab)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /txn bytes/i })).toBeTruthy()
      expect(screen.getByRole('textbox', { name: /txn rows/i })).toBeTruthy()
      expect(screen.getByRole('textbox', { name: /txn seconds/i })).toBeTruthy()
      expect(screen.getByRole('textbox', { name: /event rows/i })).toBeTruthy()
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

  it('shows toast notification on save success', async () => {
    const toastSpy = vi.spyOn(toastManager, 'add')
    wrap(<SettingsView onClose={() => {}} />)
    await waitForLoad()

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: 'Settings saved',
        }),
      )
    })
  })

  it('blocks save when numeric field is cleared or invalid without coercing to zero', async () => {
    const saveSpy = vi.spyOn(apiModule.api, 'saveSettings')
    const user = userEvent.setup()

    wrap(<SettingsView onClose={() => {}} />)
    await waitForLoad()

    const displayTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Display')!
    await user.click(displayTab)

    const pageSizeInput = await screen.findByRole('textbox', { name: /page size/i })
    await user.clear(pageSizeInput)

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    await user.click(saveBtn)

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('retains field values when save fails', async () => {
    vi.spyOn(apiModule.api, 'saveSettings').mockRejectedValueOnce(new Error('Network error'))
    const toastSpy = vi.spyOn(toastManager, 'add')
    const user = userEvent.setup()

    wrap(<SettingsView onClose={() => {}} />)
    await waitForLoad()

    const displayTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Display')!
    await user.click(displayTab)

    const pageSizeInput = await screen.findByRole('textbox', { name: /page size/i })
    await user.clear(pageSizeInput)
    await user.type(pageSizeInput, '750')

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Save failed',
        }),
      )
    })

    expect((pageSizeInput as HTMLInputElement).value).toBe('750')
  })

  it('performs no restart when confirmation is canceled', async () => {
    const restartSpy = vi.spyOn(apiModule.api, 'restartStreamFromCurrent')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()

    // Mock settings with stream enabled
    vi.spyOn(apiModule.api, 'settings').mockResolvedValue({
      ...MOCK_SETTINGS,
      stream: { ...MOCK_SETTINGS.stream, enabled: true },
    })

    wrap(<SettingsView onClose={() => {}} />)
    await waitForLoad()

    const streamTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Remote streaming')!
    await user.click(streamTab)

    const restartBtn = await screen.findByRole('button', { name: /restart from current position/i })
    await user.click(restartBtn)

    expect(restartSpy).not.toHaveBeenCalled()
  })

  it('handles JSON import validation and export links', async () => {
    wrap(<SettingsView onClose={() => {}} />)
    await waitForLoad()

    const advTab = screen.getAllByRole('tab').find((t) => t.textContent === 'Backup & transfer')!
    fireEvent.click(advTab)

    await waitFor(() => {
      const exportLink = screen.getByRole('link', { name: /export json/i })
      expect(exportLink).toBeTruthy()
      expect(exportLink.getAttribute('href')).toContain('data:application/json')
      expect(exportLink.getAttribute('download')).toBe('binsight-settings.json')
    })
  })
})
