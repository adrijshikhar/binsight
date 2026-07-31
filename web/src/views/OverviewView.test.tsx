import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import OverviewView from './OverviewView'
import { theme } from '../theme'
import * as apiModule from '../lib/api'
import type { BinlogFile, FileMetrics, TypeCount } from '../lib/types'

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

const MOCK_FILE: BinlogFile = {
  id: 1,
  path: '/data/mysql-bin.000001',
  size: 1024,
  magic_ok: true,
  format_version: 4,
  server_version: '8.0.28',
  checksum_algo: 'CRC32',
  indexed_by_adapter: 'gomysql',
  adapter_version: '1.0',
  last_indexed_offset: 1024,
  indexed_at: '2024-01-01T00:00:00Z',
  state: 'ready',
  error: '',
}

const MOCK_COUNTS: TypeCount[] = [
  { type_name: 'WRITE_ROWS_V2', count: 5, rows_total: 10 },
  { type_name: 'QUERY', count: 2, rows_total: 0 },
]

const MOCK_METRICS: FileMetrics = {
  events: 7,
  event_size: { min: 50, avg: 100, max: 200, total: 700 },
  first_ts: 1700000000,
  last_ts: 1700000060,
  span_sec: 60,
  events_per_sec: 0.12,
  bytes_per_sec: 11.7,
  txns: {
    count: 1,
    events: { min: 5, avg: 5, max: 5, total: 5 },
    duration_sec: { min: 1, avg: 1, max: 1, total: 1 },
    rows: { min: 10, avg: 10, max: 10, total: 10 },
  },
  decode: { full: 7, partial: 0, none: 0, errors: 0 },
  by_type: [{ type_name: 'WRITE_ROWS_V2', events: 5, bytes: 500 }],
  largest_events: [{ pos: 100, size: 200, ts: 1700000010, type_name: 'WRITE_ROWS_V2', txn_id: 1 }],
  largest_txns: [{ id: 1, events: 5, rows: 10, gtid: 'ANONYMOUS' }],
  series: [],
}

function makeProps(overrides = {}) {
  return {
    file: MOCK_FILE,
    onOpenType: vi.fn(),
    onOpenEvent: vi.fn(),
    onOpenTxn: vi.fn(),
    anomalies: [],
    onShowAnomalies: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(apiModule.api, 'typeCounts').mockResolvedValue(MOCK_COUNTS)
  vi.spyOn(apiModule.api, 'metrics').mockResolvedValue(MOCK_METRICS)
})

describe('OverviewView', () => {
  it('renders the filename as title', async () => {
    wrap(<OverviewView {...makeProps()} />)
    expect(screen.getByText('mysql-bin.000001')).toBeTruthy()
  })

  it('shows re-index button', () => {
    wrap(<OverviewView {...makeProps()} />)
    expect(screen.getByRole('button', { name: /re-index/i })).toBeTruthy()
  })

  it('shows file metadata rows', async () => {
    wrap(<OverviewView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('Path')).toBeTruthy()
      expect(screen.getByText('State')).toBeTruthy()
    })
  })

  it('shows anomaly count', () => {
    const anomaly = {
      id: 1,
      file_id: 1,
      detector: 'huge_txn_rows',
      severity: 'high' as const,
      metric: 5000,
      threshold: 1000,
      message: 'too many rows',
      detail_json: '{}',
    }
    wrap(<OverviewView {...makeProps({ anomalies: [anomaly] })} />)
    expect(screen.getByText(/Anomalies: 1/)).toBeTruthy()
  })

  it('calls onShowAnomalies when anomaly strip is clicked', async () => {
    const onShowAnomalies = vi.fn()
    const anomaly = {
      id: 1,
      file_id: 1,
      detector: 'huge_txn_rows',
      severity: 'high' as const,
      metric: 5000,
      threshold: 1000,
      message: 'too many rows',
      detail_json: '{}',
    }
    const { container } = wrap(<OverviewView {...makeProps({ anomalies: [anomaly], onShowAnomalies })} />)
    const strip = container.querySelector('[role="button"]')
    strip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onShowAnomalies).toHaveBeenCalled()
  })

  it('calls onOpenEvent when a row in largest events panel is clicked', async () => {
    const user = userEvent.setup()
    const onOpenEvent = vi.fn()
    wrap(<OverviewView {...makeProps({ onOpenEvent })} />)
    // Wait for the event row to be rendered (look for the offset value 100)
    const eventRow = await screen.findByText('100')
    await user.click(eventRow.closest('tr')!)
    expect(onOpenEvent).toHaveBeenCalledWith(100)
  })

  it('calls onOpenTxn when a row in largest transactions panel is clicked', async () => {
    const user = userEvent.setup()
    const onOpenTxn = vi.fn()
    wrap(<OverviewView {...makeProps({ onOpenTxn })} />)
    // Wait for the txn panel header to appear
    await screen.findByText('Largest transactions by event count')
    // Find the "Largest transactions" paper container by walking up from the header text
    const headerText = screen.getByText('Largest transactions by event count')
    const paper = headerText.closest('[class*="Paper"]')?.parentElement
    expect(paper).toBeTruthy()
    // Within that paper, find the row with #1 and events=5
    const txnRows = paper?.querySelectorAll('tbody tr')
    const targetRow = Array.from(txnRows || []).find(
      (row) => row.textContent?.includes('#1') && row.textContent?.includes('5'),
    )
    expect(targetRow).toBeTruthy()
    await user.click(targetRow!)
    expect(onOpenTxn).toHaveBeenCalledWith(1)
  })

  it('shows metrics cards after load', async () => {
    wrap(<OverviewView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('time span')).toBeTruthy()
      expect(screen.getByText('decode')).toBeTruthy()
    })
  })

  it('shows event types table after load', async () => {
    wrap(<OverviewView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getAllByText('WRITE_ROWS_V2').length).toBeGreaterThan(0)
      expect(screen.getByText('QUERY')).toBeTruthy()
    })
  })

  it('shows error alert on API failure', async () => {
    vi.spyOn(apiModule.api, 'typeCounts').mockRejectedValue(new Error('network error'))
    vi.spyOn(apiModule.api, 'metrics').mockRejectedValue(new Error('network error'))
    wrap(<OverviewView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })

  it('calls onOpenType when a ROW event type row is clicked', async () => {
    const onOpenType = vi.fn()
    wrap(<OverviewView {...makeProps({ onOpenType })} />)
    await waitFor(() => screen.getAllByText('WRITE_ROWS_V2').length > 0)
    const cells = screen.getAllByText('WRITE_ROWS_V2')
    // Find the one in the event-types table (last occurrence is in the breakdown table)
    const cell = cells[cells.length - 1]
    cell.closest('tr')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOpenType).toHaveBeenCalledWith('WRITE_ROWS_V2')
  })
})
