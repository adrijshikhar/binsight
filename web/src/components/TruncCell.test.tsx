import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import TruncCell from './TruncCell'

// jsdom doesn't implement matchMedia
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

vi.mock('../lib/api', () => ({
  api: {
    detail: vi.fn(),
  },
}))

import { api } from '../lib/api'

function wrap(ui: React.ReactNode) {
  return render(<div data-theme="dark">{ui}</div>)
}

function renderInTable(ui: React.ReactNode) {
  return wrap(
    <table>
      <tbody>
        <tr>{ui}</tr>
      </tbody>
    </table>,
  )
}

describe('TruncCell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders label text', () => {
    renderInTable(<TruncCell label="SELECT 1" className="tbl" />)
    expect(screen.getByText('SELECT 1')).toBeTruthy()
  })

  it('tooltip is disabled when not truncated (scrollWidth <= clientWidth)', () => {
    renderInTable(<TruncCell label="short" className="tbl" />)
    const td = screen.getByText('short')
    // jsdom: scrollWidth == clientWidth == 0 → not truncated
    fireEvent.mouseEnter(td)
    // With truncated=false, the Tooltip is disabled - no tooltip role in DOM
    expect(screen.queryByRole('tooltip')).toBeFalsy()
  })

  it('tooltip is enabled when truncated (scrollWidth > clientWidth + 1)', () => {
    renderInTable(<TruncCell label="a very long text that is clipped" className="tbl" />)
    const td = screen.getByText('a very long text that is clipped')

    // Simulate a truncated cell
    Object.defineProperty(td, 'scrollWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(td, 'clientWidth', { configurable: true, get: () => 100 })

    fireEvent.mouseEnter(td)
    // After hover with truncated=true, aria-label should be set
    expect(td.getAttribute('aria-label')).toBe('a very long text that is clipped')
  })

  it('applies monospace font family when mono prop is true', () => {
    renderInTable(<TruncCell label="SELECT 1" className="tbl" mono />)
    const td = screen.getByText('SELECT 1')
    expect(td.tagName).toBe('CODE')
  })

  it('does not apply monospace font family when mono is not set', () => {
    renderInTable(<TruncCell label="SELECT 1" className="tbl" />)
    const td = screen.getByText('SELECT 1')
    const style = td.getAttribute('style') ?? ''
    expect(style).not.toContain('monospace')
  })

  it('fetches api.detail on truncated hover when fileId and pos are provided', async () => {
    const mockDetail = vi.mocked(api.detail)
    mockDetail.mockResolvedValue({
      decoded: { sql: 'SELECT * FROM users WHERE id = 42' },
    } as Awaited<ReturnType<typeof api.detail>>)

    renderInTable(<TruncCell label="SELECT * FROM users…" className="tbl" fileId={1} pos={100} />)
    const td = screen.getByText('SELECT * FROM users…')

    Object.defineProperty(td, 'scrollWidth', { configurable: true, get: () => 300 })
    Object.defineProperty(td, 'clientWidth', { configurable: true, get: () => 100 })

    fireEvent.mouseEnter(td)

    await waitFor(() => {
      expect(mockDetail).toHaveBeenCalledWith(1, 100)
    })
  })

  it('does not fetch api.detail when not truncated', () => {
    const mockDetail = vi.mocked(api.detail)

    renderInTable(<TruncCell label="short" className="tbl" fileId={1} pos={100} />)
    const td = screen.getByText('short')
    // scrollWidth <= clientWidth (jsdom default)
    fireEvent.mouseEnter(td)

    expect(mockDetail).not.toHaveBeenCalled()
  })

  it('does not fetch api.detail when fileId or pos is missing', () => {
    const mockDetail = vi.mocked(api.detail)

    renderInTable(<TruncCell label="long text clipped" className="tbl" fileId={1} />)
    const td = screen.getByText('long text clipped')

    Object.defineProperty(td, 'scrollWidth', { configurable: true, get: () => 300 })
    Object.defineProperty(td, 'clientWidth', { configurable: true, get: () => 100 })

    fireEvent.mouseEnter(td)

    expect(mockDetail).not.toHaveBeenCalled()
  })
})
