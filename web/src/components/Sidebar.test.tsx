import { it, expect, vi, describe } from 'vitest'
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from './Sidebar'
import type { BinlogFile, StreamStatus } from '../lib/types'

// Mock the api module so TypeBreakdown's fetch doesn't fire real requests.
vi.mock('../lib/api', () => ({
  api: {
    typeCounts: vi.fn(() => Promise.resolve([])),
  },
}))

function wrap(ui: React.ReactElement) {
  return render(ui)
}

const baseFile: BinlogFile = {
  id: 1,
  path: '/x/mysql-bin.000001',
  state: 'ready',
  size: 100,
  magic_ok: true,
  format_version: 4,
  server_version: '8.0.0',
  checksum_algo: 'crc32',
  indexed_by_adapter: 'gomysql',
  adapter_version: '1.0',
  last_indexed_offset: 100,
  indexed_at: '',
  error: '',
  anomaly_count: 0,
  remote: false,
}

function defaultProps() {
  return {
    files: [baseFile],
    activeId: 0,
    onSelect: vi.fn(),
    onSettings: vi.fn(),
    onArchitecture: vi.fn(),
    collapsed: false,
    onToggle: vi.fn(),
    streamStatus: undefined as StreamStatus | undefined,
  }
}

describe('Sidebar - expanded', () => {
  it('renders a file entry and fires onSelect on click', async () => {
    const props = defaultProps()
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    screen.getByText('mysql-bin.000001').click()
    expect(props.onSelect).toHaveBeenCalledWith(1)
  })

  it('shows the "Files" header label', async () => {
    await act(async () => {
      wrap(<Sidebar {...defaultProps()} />)
    })
    expect(screen.getByText('Files')).toBeTruthy()
  })

  it('does not render duplicate Architecture and Settings links in files sidebar', async () => {
    await act(async () => {
      wrap(<Sidebar {...defaultProps()} />)
    })
    expect(screen.queryByLabelText('Open architecture overview')).toBeNull()
    expect(screen.queryByLabelText('Open settings')).toBeNull()
  })

  it('calls onToggle when collapse button is clicked', async () => {
    const props = defaultProps()
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    screen.getByLabelText('Collapse sidebar').click()
    expect(props.onToggle).toHaveBeenCalledOnce()
  })

  it('shows anomaly badge for a file with anomalies', async () => {
    const props = defaultProps()
    props.files = [{ ...baseFile, anomaly_count: 3, anomaly_max_severity: 'high' }]
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows remote badge for a remote file', async () => {
    const props = defaultProps()
    props.files = [{ ...baseFile, remote: true }]
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    expect(screen.getByText('remote')).toBeTruthy()
  })

  it('shows stream chip for a non-disabled stream status', async () => {
    const props = defaultProps()
    props.streamStatus = {
      state: 'streaming',
      file: 'mysql-bin.000001',
      pos: 1234,
      last_event_ts: 0,
      skipped_events: 0,
    }
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    expect(screen.getByRole('status', { name: /stream: streaming/i })).toBeTruthy()
  })

  it('does NOT show stream chip when status is disabled', async () => {
    const props = defaultProps()
    props.streamStatus = {
      state: 'disabled',
      file: '',
      pos: 0,
      last_event_ts: 0,
      skipped_events: 0,
    }
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('Sidebar - collapsed', () => {
  it('renders the expand button', async () => {
    await act(async () => {
      wrap(<Sidebar {...defaultProps()} collapsed={true} />)
    })
    expect(screen.getByLabelText('Expand sidebar')).toBeTruthy()
  })

  it('calls onToggle when expand button is clicked', async () => {
    const props = { ...defaultProps(), collapsed: true }
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    screen.getByLabelText('Expand sidebar').click()
    expect(props.onToggle).toHaveBeenCalledOnce()
  })

  it('renders a file as a button with aria-label in icon rail', async () => {
    await act(async () => {
      wrap(<Sidebar {...defaultProps()} collapsed={true} />)
    })
    // In collapsed mode there is no text label - only icon boxes with aria-labels.
    const btn = screen.getByRole('button', { name: /mysql-bin\.000001/ })
    expect(btn).toBeTruthy()
  })

  it('fires onSelect from the collapsed file box via Enter key', async () => {
    const props = { ...defaultProps(), collapsed: true }
    await act(async () => {
      wrap(<Sidebar {...props} />)
    })
    const btn = screen.getByRole('button', { name: /mysql-bin\.000001/ })
    btn.focus()
    await userEvent.setup().keyboard('{Enter}')
    expect(props.onSelect).toHaveBeenCalledWith(1)
  })
})
