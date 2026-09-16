import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HexView from './HexView'
import { api } from '../lib/api'
import type { HexResult } from '../lib/types'

// Mock the api module
vi.mock('../lib/api', () => ({
  api: {
    hex: vi.fn(),
  },
}))

const mockHexResult: HexResult = {
  bytes: btoa('test byte stream for hex view testing!!'),
  pos: 100,
  win_start: 0,
  total: 40,
  annotations: [
    { field: 'timestamp', start: 0, end: 4, value: '1700000000' },
    { field: 'type_code', start: 4, end: 5, value: 'QUERY' },
  ],
  crc_checked: true,
  crc_valid: true,
}

describe('HexView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially while fetching bytes', () => {
    vi.mocked(api.hex).mockImplementation(() => new Promise(() => {}))
    render(<HexView fileId={1} pos={100} />)
    expect(screen.getByText(/loading/i)).toBeTruthy()
  })

  it('renders offsets, hex values, and CRC32 valid badge', async () => {
    vi.mocked(api.hex).mockResolvedValueOnce(mockHexResult)
    render(<HexView fileId={1} pos={100} />)

    await waitFor(() => {
      expect(screen.getByText('00000000')).toBeTruthy()
    })
    expect(screen.getByText(/CRC32/i)).toBeTruthy()
    expect(screen.getByText(/valid/i)).toBeTruthy()
    expect(screen.getByText(/bytes 0-39 of 40/i)).toBeTruthy()
  })

  it('renders CRC32 MISMATCH when crc is invalid', async () => {
    vi.mocked(api.hex).mockResolvedValueOnce({
      ...mockHexResult,
      crc_valid: false,
    })
    render(<HexView fileId={1} pos={100} />)

    await waitFor(() => {
      expect(screen.getByText(/MISMATCH/i)).toBeTruthy()
    })
  })

  it('shows error banner and allows retry on request failure', async () => {
    vi.mocked(api.hex).mockRejectedValueOnce(new Error('Network error loading hex'))
    render(<HexView fileId={1} pos={100} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Network error loading hex')

    // Prepare success response for retry
    vi.mocked(api.hex).mockResolvedValueOnce(mockHexResult)
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('00000000')).toBeTruthy()
    })
    expect(vi.mocked(api.hex)).toHaveBeenCalledTimes(2)
  })

  it('cancels pending request when fileId or pos changes', async () => {
    let resolveFirst: (value: HexResult) => void
    const firstPromise = new Promise<HexResult>((res) => {
      resolveFirst = res
    })

    const secondResult: HexResult = {
      ...mockHexResult,
      bytes: btoa('second event bytes'),
      total: 18,
    }

    vi.mocked(api.hex)
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(secondResult)

    const { rerender } = render(<HexView fileId={1} pos={100} />)

    // Change pos before first request resolves
    rerender(<HexView fileId={1} pos={200} />)

    // Now resolve first promise
    resolveFirst!(mockHexResult)

    // Verify second request took precedence
    await waitFor(() => {
      expect(screen.getByText(/bytes 0-18 of 18/i)).toBeTruthy()
    })
  })

  it('paginates large events with next button', async () => {
    const largeResult: HexResult = {
      ...mockHexResult,
      win_start: 0,
      total: 8192,
    }
    const page2Result: HexResult = {
      ...mockHexResult,
      win_start: 4096,
      total: 8192,
    }

    vi.mocked(api.hex)
      .mockResolvedValueOnce(largeResult)
      .mockResolvedValueOnce(page2Result)

    render(<HexView fileId={1} pos={100} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => {
      expect(vi.mocked(api.hex)).toHaveBeenCalledWith(1, 100, 4096, 4096)
    })
  })
})
