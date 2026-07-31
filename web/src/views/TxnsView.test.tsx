import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import TxnsView from './TxnsView'
import { theme } from '../theme'
import * as apiModule from '../lib/api'
import type { Txn } from '../lib/types'

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

const MOCK_TXNS: Txn[] = [
  {
    id: 1,
    file_id: 1,
    gtid: 'ANONYMOUS',
    start_pos: 100,
    end_pos: 500,
    start_ts: 1700000000,
    commit_ts: 1700000005,
    event_count: 10,
    rows_inserted: 5,
    rows_updated: 2,
    rows_deleted: 1,
    status: 'committed',
  },
  {
    id: 2,
    file_id: 1,
    gtid: 'abc-123-def:1',
    start_pos: 600,
    end_pos: 900,
    start_ts: 1700000010,
    commit_ts: 0,
    event_count: 3,
    rows_inserted: 0,
    rows_updated: 0,
    rows_deleted: 0,
    status: 'incomplete',
  },
]

function makeProps(overrides = {}) {
  return {
    fileId: 1,
    onOpenTxn: vi.fn(),
    txnSeverity: new Map<number, 'critical' | 'high' | 'medium' | 'low'>(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(apiModule.api, 'txns').mockResolvedValue(MOCK_TXNS)
})

describe('TxnsView', () => {
  it('shows loading text initially', () => {
    wrap(<TxnsView {...makeProps()} />)
    expect(screen.getByText(/loading transactions/i)).toBeTruthy()
  })

  it('renders transaction rows after load', async () => {
    wrap(<TxnsView {...makeProps()} />)
    await waitFor(() => {
      // Per-file ordinal label (txn 1 = lowest start_pos), anonymous txn shows @ pos
      expect(screen.getByText('txn 1')).toBeTruthy()
      expect(screen.getByText('@ 100')).toBeTruthy()
      // GTID txn shows the gtid as the secondary detail
      expect(screen.getByText('abc-123-def:1')).toBeTruthy()
    })
  })

  it('shows status badges', async () => {
    wrap(<TxnsView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('committed')).toBeTruthy()
      expect(screen.getByText('incomplete')).toBeTruthy()
    })
  })

  it('calls onOpenTxn when a row is clicked', async () => {
    const onOpenTxn = vi.fn()
    wrap(<TxnsView {...makeProps({ onOpenTxn })} />)
    await waitFor(() => screen.getByText('txn 1'))
    screen
      .getByText('txn 1')
      .closest('tr')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOpenTxn).toHaveBeenCalledWith(1)
  })

  it('shows anomaly warning icon for txns with severity', async () => {
    const txnSeverity = new Map<number, 'critical' | 'high' | 'medium' | 'low'>([[1, 'high']])
    wrap(<TxnsView {...makeProps({ txnSeverity })} />)
    await waitFor(() => {
      const warningEl = document.querySelector('[aria-label="anomaly: high"]')
      expect(warningEl).toBeTruthy()
    })
  })

  it('shows sortable column headers', async () => {
    wrap(<TxnsView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText(/txn \/ gtid/i)).toBeTruthy()
      expect(screen.getByText(/duration/i)).toBeTruthy()
      expect(screen.getByText(/events/i)).toBeTruthy()
      expect(screen.getByText(/I \/ U \/ D/i)).toBeTruthy()
    })
  })

  it('sorts by event_count when events header is clicked', async () => {
    wrap(<TxnsView {...makeProps()} />)
    await waitFor(() => screen.getByText('txn 1'))
    // Click on the "events" sortable header
    const eventsHeader = screen.getByText(/events/i)
    eventsHeader.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    // After sorting by event_count descending, txn 1 (10 events) should come first
    await waitFor(() => {
      const rows = document.querySelectorAll('tbody tr')
      expect(rows.length).toBe(2)
      // Verify sort order: txn 1 with higher event_count (10) should appear first.
      // Ordinal is by start_pos rank (stable across sort), so the @100 txn is "txn 1".
      const firstRowText = rows[0].textContent
      expect(firstRowText).toContain('txn 1')
    })
  })

  it('shows error alert on API failure', async () => {
    vi.spyOn(apiModule.api, 'txns').mockRejectedValue(new Error('fail'))
    wrap(<TxnsView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })

  it('shows empty state when no transactions', async () => {
    vi.spyOn(apiModule.api, 'txns').mockResolvedValue([])
    wrap(<TxnsView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText(/No transactions in this file/i)).toBeTruthy()
    })
  })
})
