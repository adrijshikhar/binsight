import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import SchemaView from './SchemaView'
import { theme } from '../theme'
import * as apiModule from '../lib/api'
import type { EventPage, EventRow } from '../lib/types'

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

function wrap(ui: React.ReactElement) {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {ui}
    </MantineProvider>,
  )
}

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 1,
    file_id: 1,
    pos: 100,
    end_pos: 200,
    size: 100,
    ts: 1700000000,
    type_code: 2,
    type_name: 'QUERY',
    server_id: 1,
    flags: 0,
    rows_count: 0,
    summary: 'CREATE TABLE t1 (id INT)',
    decode_confidence: 'full',
    ...overrides,
  }
}

const MOCK_PAGE: EventPage = {
  events: [
    makeEvent({ pos: 100, summary: 'CREATE TABLE t1 (id INT)' }),
    makeEvent({ id: 2, pos: 200, summary: 'ALTER TABLE t1 ADD COLUMN name VARCHAR(100)' }),
  ],
  next_cursor: 0,
  total: 2,
}

function makeProps(overrides = {}) {
  return {
    fileId: 1,
    onOpenEvent: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(apiModule.api, 'events').mockResolvedValue(MOCK_PAGE)
})

describe('SchemaView', () => {
  it('shows loading text initially', () => {
    wrap(<SchemaView {...makeProps()} />)
    expect(screen.getByText(/loading schema timeline/i)).toBeTruthy()
  })

  it('renders DDL rows after load', async () => {
    wrap(<SchemaView {...makeProps()} />)
    // Note: TruncCell renders the label in both the <td> and its (cursor-following)
    // Tooltip.Floating node, so the summary text appears twice — assert ≥1.
    await waitFor(() => {
      expect(screen.getAllByText('CREATE TABLE t1 (id INT)').length).toBeGreaterThan(0)
      expect(screen.getAllByText('ALTER TABLE t1 ADD COLUMN name VARCHAR(100)').length).toBeGreaterThan(0)
    })
  })

  it('shows DDL kind badges', async () => {
    wrap(<SchemaView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('CREATE')).toBeTruthy()
      expect(screen.getByText('ALTER')).toBeTruthy()
    })
  })

  it('calls onOpenEvent when a row is clicked', async () => {
    const onOpenEvent = vi.fn()
    wrap(<SchemaView {...makeProps({ onOpenEvent })} />)
    await waitFor(() => screen.getAllByText('CREATE TABLE t1 (id INT)'))
    // The <td> is the cell; the duplicate is the tooltip label node. Click the
    // one inside a table row.
    screen
      .getAllByText('CREATE TABLE t1 (id INT)')
      .find((el) => el.closest('tr'))
      ?.closest('tr')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOpenEvent).toHaveBeenCalledWith(100)
  })

  it('filters out non-DDL QUERY events', async () => {
    vi.spyOn(apiModule.api, 'events').mockResolvedValue({
      events: [makeEvent({ summary: 'BEGIN' }), makeEvent({ id: 2, pos: 200, summary: 'CREATE TABLE t2 (id INT)' })],
      next_cursor: 0,
      total: 2,
    })
    wrap(<SchemaView {...makeProps()} />)
    await waitFor(() => screen.getAllByText('CREATE TABLE t2 (id INT)'))
    expect(screen.queryByText('BEGIN')).toBeNull()
  })

  it('shows empty state when no DDL events', async () => {
    vi.spyOn(apiModule.api, 'events').mockResolvedValue({ events: [], next_cursor: 0, total: 0 })
    wrap(<SchemaView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText(/No DDL statements/i)).toBeTruthy()
    })
  })

  it('shows error alert on API failure', async () => {
    vi.spyOn(apiModule.api, 'events').mockRejectedValue(new Error('fail'))
    wrap(<SchemaView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })
})
