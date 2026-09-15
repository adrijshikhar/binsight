import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Drawer from './Drawer'
import { api } from '../lib/api'
import type { EventRow } from '../lib/types'

// jsdom doesn't implement matchMedia.
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

// jsdom doesn't implement ResizeObserver.
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock the api module - Drawer fetches detail/diff/hex but we don't test network here.
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
    <div data-theme="dark">
      {ui}
    </div>,
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

describe('Drawer (stock Coss UI)', () => {
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
    // Only the active panel is mounted.
    const hexPanel = screen.getByRole('tabpanel', { name: 'Hex' })
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

  it('renders only one active tabpanel at a time', async () => {
    wrap(<Drawer {...makeProps()} />)
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())
    const panels = screen.getAllByRole('tabpanel')
    expect(panels).toHaveLength(1)

    // Switch to Raw JSON
    fireEvent.click(screen.getByRole('tab', { name: /raw json/i }))
    await waitFor(() => {
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    })
  })

  it('lazy-fetches diff only when Diff tab is activated', async () => {
    wrap(<Drawer {...makeProps()} />)
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())
    expect(vi.mocked(api.diff)).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: /diff/i }))
    await waitFor(() => {
      expect(vi.mocked(api.diff)).toHaveBeenCalledWith(1, 100)
    })
  })

  it('retains active tab when event prop changes', async () => {
    const { rerender } = wrap(<Drawer {...makeProps()} />)
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())

    // Switch to Hex tab
    fireEvent.click(screen.getByRole('tab', { name: /hex/i }))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /hex/i }).getAttribute('aria-selected')).toBe('true')
    })

    // Rerender with a new event
    const newEvent: EventRow = { ...BASE_EVENT, pos: 300, end_pos: 400 }
    rerender(
      <div data-theme="dark">
        <Drawer {...makeProps({ event: newEvent })} />
      </div>,
    )

    // Tab should still be Hex
    expect(screen.getByRole('tab', { name: /hex/i }).getAttribute('aria-selected')).toBe('true')
    // And detail should be refetched for new event
    await waitFor(() => {
      expect(vi.mocked(api.detail)).toHaveBeenCalledWith(1, 300)
    })
  })

  it('shows error banner and retries detail on details tab', async () => {
    vi.mocked(api.detail).mockRejectedValueOnce(new Error('Failed to fetch detail'))
    wrap(<Drawer {...makeProps()} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Failed to fetch detail')

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => {
      expect(vi.mocked(api.detail)).toHaveBeenCalledTimes(2)
    })
  })

  it('shows error banner and retries diff on diff tab', async () => {
    vi.mocked(api.diff).mockRejectedValueOnce(new Error('Diff network error'))
    wrap(<Drawer {...makeProps()} />)
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('tab', { name: /diff/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Diff network error')

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => {
      expect(vi.mocked(api.diff)).toHaveBeenCalledTimes(2)
    })
  })

  it('adjusts width on ArrowLeft and ArrowRight keyboard events on resize handle with clamping', () => {
    const onWidthChange = vi.fn()
    wrap(<Drawer {...makeProps({ width: 520, onWidthChange })} />)

    const handle = screen.getByRole('separator', { name: /resize details panel/i })

    // ArrowLeft widens by 20
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenCalledWith(540)

    // ArrowRight narrows by 20
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenCalledWith(500)
  })

  it('clamps width to max (1000) on ArrowLeft and min (360) on ArrowRight', () => {
    const onWidthChange = vi.fn()
    const { rerender } = wrap(<Drawer {...makeProps({ width: 990, onWidthChange })} />)
    const handle = screen.getByRole('separator', { name: /resize details panel/i })

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenCalledWith(1000)

    rerender(
      <div data-theme="dark">
        <Drawer {...makeProps({ width: 370, onWidthChange })} />
      </div>,
    )
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenCalledWith(360)
  })

  it('supports keyboard navigation between tabs using Arrow keys', async () => {
    wrap(<Drawer {...makeProps()} />)
    await waitFor(() => expect(vi.mocked(api.detail)).toHaveBeenCalled())

    const detailsTab = screen.getByRole('tab', { name: /details/i })
    detailsTab.focus()
    fireEvent.keyDown(detailsTab, { key: 'ArrowRight' })

    const diffTab = screen.getByRole('tab', { name: /diff/i })
    await waitFor(() => {
      expect(document.activeElement).toBe(diffTab)
    })
  })

  it('does not trap focus away from desktop document', () => {
    const { container } = wrap(
      <div>
        <button type="button" data-testid="external-btn">
          External
        </button>
        <Drawer {...makeProps()} />
      </div>,
    )
    const extBtn = screen.getByTestId('external-btn')
    extBtn.focus()
    expect(document.activeElement).toBe(extBtn)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
