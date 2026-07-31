import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { theme } from '../theme'
import Drawer from './Drawer'
import { api } from '../lib/api'
import type { EventRow } from '../lib/types'

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

// jsdom doesn't implement ResizeObserver — Mantine's Tabs/FloatingIndicator needs it.
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock the api module — Drawer fetches detail/diff/hex but we don't test network here.
vi.mock('../lib/api', () => ({
  api: {
    detail: vi.fn().mockResolvedValue({
      header: { type_name: 'QUERY', pos: 100, end_pos: 200, size: 100, server_id: 1, flags: 0 },
      decoded: { sql: 'SELECT 1', db: 'testdb' },
    }),
    diff: vi.fn().mockResolvedValue({
      adapters: [],
      fields: [],
      errors: {},
      timing_ms: {},
      disagreement_count: 0,
    }),
    hex: vi.fn().mockResolvedValue({
      bytes: btoa('hello'),
      win_start: 0,
      total: 5,
      annotations: [],
      crc_checked: false,
      crc_valid: false,
    }),
  },
}))

const BASE_EVENT: EventRow = {
  id: 1,
  file_id: 1,
  pos: 100,
  end_pos: 200,
  size: 100,
  ts: 0,
  type_code: 2,
  type_name: 'QUERY',
  server_id: 1,
  flags: 0,
  db_name: 'testdb',
  table_name: '',
  rows_count: 0,
  summary: '',
  decode_confidence: 'full',
}

function wrap(ui: React.ReactElement) {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {ui}
    </MantineProvider>,
  )
}

function makeProps(overrides: Partial<Parameters<typeof Drawer>[0]> = {}) {
  return {
    fileId: 1,
    event: BASE_EVENT,
    width: 520,
    onResizeStart: vi.fn(),
    onWidthChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('Drawer tabs (Mantine Tabs)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all four tab labels', async () => {
    wrap(<Drawer {...makeProps()} />)
    expect(screen.getByRole('tab', { name: /details/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /diff/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /hex/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /raw json/i })).toBeTruthy()
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())
  })

  it('Details tab is selected by default', async () => {
    wrap(<Drawer {...makeProps()} />)
    const detailsTab = screen.getByRole('tab', { name: /details/i })
    expect(detailsTab.getAttribute('aria-selected')).toBe('true')
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())
  })

  it('switching to Diff tab makes it selected', async () => {
    wrap(<Drawer {...makeProps()} />)
    const diffTab = screen.getByRole('tab', { name: /diff/i })
    fireEvent.click(diffTab)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /diff/i }).getAttribute('aria-selected')).toBe('true')
    })
  })

  it('switching to Hex tab shows the hex tabpanel', async () => {
    wrap(<Drawer {...makeProps()} />)
    const hexTab = screen.getByRole('tab', { name: /hex/i })
    fireEvent.click(hexTab)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /hex/i }).getAttribute('aria-selected')).toBe('true')
    })
    // Hex panel should be visible (Mantine Tabs.Panel is rendered; inactive panels are unmounted with keepMounted={false})
    const hexPanel = screen.getByRole('tabpanel')
    expect(hexPanel).toBeTruthy()
  })

  it('switching to Raw JSON tab shows the json tabpanel', async () => {
    wrap(<Drawer {...makeProps()} />)
    const jsonTab = screen.getByRole('tab', { name: /raw json/i })
    fireEvent.click(jsonTab)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /raw json/i }).getAttribute('aria-selected')).toBe('true')
    })
  })

  it('calls onClose when close button is activated', async () => {
    const onClose = vi.fn()
    wrap(<Drawer {...makeProps({ onClose })} />)
    const closeBtn = screen.getByRole('button', { name: /close drawer/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())
  })
})
