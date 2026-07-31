import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import AnomaliesView from './AnomaliesView'
import { theme } from '../theme'
import * as apiModule from '../lib/api'
import type { Anomaly } from '../lib/types'

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

const MOCK_ANOMALIES: Anomaly[] = [
  {
    id: 1,
    file_id: 1,
    detector: 'huge_txn_rows',
    severity: 'high',
    txn_id: 42,
    metric: 5000,
    threshold: 1000,
    message: 'Transaction has too many rows',
    detail_json: '{}',
  },
  {
    id: 2,
    file_id: 1,
    detector: 'pos_wrap',
    severity: 'critical',
    event_pos: 100,
    metric: 0,
    threshold: 0,
    message: 'Position wrapped',
    detail_json: '{}',
  },
]

function makeProps(overrides = {}) {
  return {
    fileId: 1,
    onOpenTxn: vi.fn(),
    onOpenEvent: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(apiModule.api, 'anomalies').mockResolvedValue(MOCK_ANOMALIES)
})

describe('AnomaliesView', () => {
  it('shows loading text initially', () => {
    wrap(<AnomaliesView {...makeProps()} />)
    expect(screen.getByText(/loading anomalies/i)).toBeTruthy()
  })

  it('renders anomaly rows after load', async () => {
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('huge_txn_rows')).toBeTruthy()
      expect(screen.getByText('pos_wrap')).toBeTruthy()
    })
  })

  it('shows severity badges', async () => {
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('high')).toBeTruthy()
      expect(screen.getByText('critical')).toBeTruthy()
    })
  })

  it('shows txn link for anomalies with txn_id', async () => {
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('txn #42')).toBeTruthy()
    })
  })

  it('shows event pos link for anomalies with event_pos', async () => {
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('@ 100')).toBeTruthy()
    })
  })

  it('calls onOpenTxn when txn link is clicked', async () => {
    const onOpenTxn = vi.fn()
    wrap(<AnomaliesView {...makeProps({ onOpenTxn })} />)
    await waitFor(() => screen.getByText('txn #42'))
    screen.getByText('txn #42').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOpenTxn).toHaveBeenCalledWith(42)
  })

  it('calls onOpenEvent when event link is clicked', async () => {
    const onOpenEvent = vi.fn()
    wrap(<AnomaliesView {...makeProps({ onOpenEvent })} />)
    await waitFor(() => screen.getByText('@ 100'))
    screen.getByText('@ 100').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOpenEvent).toHaveBeenCalledWith(100)
  })

  it('shows empty state when no anomalies', async () => {
    vi.spyOn(apiModule.api, 'anomalies').mockResolvedValue([])
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText(/No anomalies detected/i)).toBeTruthy()
    })
  })

  it('shows error alert on API failure', async () => {
    vi.spyOn(apiModule.api, 'anomalies').mockRejectedValue(new Error('fail'))
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })

  it('shows severity filter select', () => {
    wrap(<AnomaliesView {...makeProps()} />)
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('shows re-run detection button', () => {
    wrap(<AnomaliesView {...makeProps()} />)
    expect(screen.getByRole('button', { name: /re-run detection/i })).toBeTruthy()
  })
})
