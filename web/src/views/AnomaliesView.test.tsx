import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import AnomaliesView from './AnomaliesView'
import * as apiModule from '../lib/api'
import type { Anomaly } from '../lib/types'

function wrap(ui: React.ReactElement) {
  return render(ui)
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

  it('shows severity badges with data-severity', async () => {
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      const badges = document.querySelectorAll('[data-slot="badge"]')
      expect(badges.length).toBe(2)
      expect(badges[0].getAttribute('data-severity')).toBe('high')
      expect(badges[1].getAttribute('data-severity')).toBe('critical')
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

  it('activates txn link on keyboard Enter key', async () => {
    const onOpenTxn = vi.fn()
    wrap(<AnomaliesView {...makeProps({ onOpenTxn })} />)
    await waitFor(() => screen.getByText('txn #42'))
    const link = screen.getByText('txn #42').closest('[role="button"]')!
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onOpenTxn).toHaveBeenCalledWith(42)
  })

  it('calls onOpenEvent when event link is clicked', async () => {
    const onOpenEvent = vi.fn()
    wrap(<AnomaliesView {...makeProps({ onOpenEvent })} />)
    await waitFor(() => screen.getByText('@ 100'))
    screen.getByText('@ 100').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOpenEvent).toHaveBeenCalledWith(100)
  })

  it('activates event link on keyboard Space key', async () => {
    const onOpenEvent = vi.fn()
    wrap(<AnomaliesView {...makeProps({ onOpenEvent })} />)
    await waitFor(() => screen.getByText('@ 100'))
    const link = screen.getByText('@ 100').closest('[role="button"]')!
    link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
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

  it('preserves high and critical severity on rows', async () => {
    wrap(<AnomaliesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('huge_txn_rows')).toBeTruthy()
    })
    const rows = screen.getAllByRole('row')
    expect(rows[1].getAttribute('data-severity')).toMatch(/high|critical/)
    expect(rows[2].getAttribute('data-severity')).toMatch(/high|critical/)
  })
})
