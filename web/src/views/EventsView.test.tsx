import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState, useEffect } from 'react'
import { MantineProvider, Switch } from '@mantine/core'
import EventsView from './EventsView'
import { SSEContext, type IndexEvent } from '../lib/sse'
import type { EventRow, Severity } from '../lib/types'

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

// jsdom doesn't implement ResizeObserver — Mantine's SegmentedControl/FloatingIndicator needs it.
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock the api module so EventsView's data fetches resolve deterministically.
vi.mock('../lib/api', () => ({
  api: {
    events: vi.fn(() => Promise.resolve({ events: [], next_cursor: 0, total: 0 })),
    tables: vi.fn(() => Promise.resolve([])),
  },
}))

// Pull the mocked api back in so we can assert on the spies.
import { api } from '../lib/api'
const eventsMock = api.events as unknown as ReturnType<typeof vi.fn>
const tablesMock = api.tables as unknown as ReturnType<typeof vi.fn>

const ACTIVE_FILE = 1
const OTHER_FILE = 2

// Stable references: EventsView's `load` callback depends on props.txnIds (and
// other props), so reusing the same object/function identities across rerenders
// prevents spurious refetches that would otherwise come from new `[]`/closures
// on every render.
const STABLE_TXN_IDS: number[] = []
const STABLE_SEVERITY = new Map<number, Severity>()
const noopSelect = (_e: EventRow) => {}
const noopConsume = () => {}
const noopRemoveTxn = (_id: number) => {}

function baseProps(fileId = ACTIVE_FILE) {
  return {
    fileId,
    txnIds: STABLE_TXN_IDS,
    dbFilter: '',
    tableFilter: '',
    typeFilter: '',
    selectedPos: -1,
    onSelect: noopSelect,
    posSeverity: STABLE_SEVERITY,
    onConsumeFilters: noopConsume,
    onRemoveTxn: noopRemoveTxn,
  }
}

function EventsViewHarness({ ev, fileId = ACTIVE_FILE }: { ev: IndexEvent | null; fileId?: number }) {
  const [live, setLive] = useState(false)
  const [currentFileId, setCurrentFileId] = useState(fileId)

  useEffect(() => {
    if (fileId !== currentFileId) {
      setCurrentFileId(fileId)
      setLive(false)
    }
  }, [fileId, currentFileId])

  return (
    <MantineProvider defaultColorScheme="dark">
      <SSEContext.Provider value={ev}>
        <Switch
          checked={live}
          onChange={(e) => setLive(e.currentTarget.checked)}
          label="Live"
          aria-label="Follow new events as they are indexed"
        />
        <EventsView
          {...baseProps(fileId)}
          live={live}
          onToggleLive={setLive}
        />
      </SSEContext.Provider>
    </MantineProvider>
  )
}

function wrapEv(ev: IndexEvent | null, fileId = ACTIVE_FILE) {
  return <EventsViewHarness ev={ev} fileId={fileId} />
}

function renderView(ev: IndexEvent | null, fileId = ACTIVE_FILE) {
  return render(wrapEv(ev, fileId))
}

function followButton(): HTMLInputElement {
  return screen.getByRole('switch', { name: /follow|live/i }) as HTMLInputElement
}

// Wait for the initial mount load() to settle so later call-count deltas are
// measured against a stable baseline.
async function settleInitialLoad() {
  await waitFor(() => expect(eventsMock).toHaveBeenCalled())
}

describe('EventsView live mode', () => {
  beforeEach(() => {
    eventsMock.mockClear()
    tablesMock.mockClear()
    // Reset URL so writeUrlState/readUrlState don't leak filters across tests.
    window.history.replaceState(null, '', '/')
  })

  it('1. toggling Follow issues a tail query (tail set, no cursor)', async () => {
    renderView({ type: 'noop', file_id: 0, seq: 0 })
    await settleInitialLoad()

    fireEvent.click(followButton())

    await waitFor(() => {
      const tailCall = eventsMock.mock.calls.find((c) => c[0]?.tail)
      expect(tailCall).toBeTruthy()
    })
    const tailCall = eventsMock.mock.calls.find((c) => c[0]?.tail)
    expect(tailCall![0].tail).toBeTruthy()
    expect(tailCall![0].cursor).toBeUndefined()
  })

  it('2. index_done for the active file refetches', async () => {
    const { rerender } = renderView({ type: 'index_done', file_id: ACTIVE_FILE, seq: 1 })
    await settleInitialLoad()

    fireEvent.click(followButton())
    await waitFor(() => expect(eventsMock.mock.calls.some((c) => c[0]?.tail)).toBe(true))
    const before = eventsMock.mock.calls.length

    rerender(wrapEv({ type: 'index_done', file_id: ACTIVE_FILE, seq: 2 }))

    await waitFor(() => expect(eventsMock.mock.calls.length).toBeGreaterThan(before))
  })

  it('3. index_done for a DIFFERENT file does not refetch', async () => {
    const { rerender } = renderView({ type: 'index_done', file_id: ACTIVE_FILE, seq: 1 })
    await settleInitialLoad()

    fireEvent.click(followButton())
    await waitFor(() => expect(eventsMock.mock.calls.some((c) => c[0]?.tail)).toBe(true))
    const before = eventsMock.mock.calls.length

    rerender(wrapEv({ type: 'index_done', file_id: OTHER_FILE, seq: 2 }))

    await new Promise((r) => setTimeout(r, 30))
    expect(eventsMock.mock.calls.length).toBe(before)
  })

  it('4. a non-index_done type does not refetch', async () => {
    const { rerender } = renderView({ type: 'index_done', file_id: ACTIVE_FILE, seq: 1 })
    await settleInitialLoad()

    fireEvent.click(followButton())
    await waitFor(() => expect(eventsMock.mock.calls.some((c) => c[0]?.tail)).toBe(true))
    const before = eventsMock.mock.calls.length

    rerender(wrapEv({ type: 'index_progress', file_id: ACTIVE_FILE, seq: 2 }))

    await new Promise((r) => setTimeout(r, 30))
    expect(eventsMock.mock.calls.length).toBe(before)
  })

  it('5. the same seq does not double-fetch on a repeat rerender', async () => {
    const { rerender } = renderView({ type: 'index_done', file_id: ACTIVE_FILE, seq: 5 })
    await settleInitialLoad()

    fireEvent.click(followButton())
    await waitFor(() => expect(eventsMock.mock.calls.some((c) => c[0]?.tail)).toBe(true))
    const beforeSeq7 = eventsMock.mock.calls.length

    // Deliver a fresh index_done (new object, new seq) for the active file and
    // wait for the refetch. This sets lastHandledSeqRef to 7.
    rerender(wrapEv({ type: 'index_done', file_id: ACTIVE_FILE, seq: 7 }))
    await waitFor(() => expect(eventsMock.mock.calls.length).toBeGreaterThan(beforeSeq7))
    await new Promise((r) => setTimeout(r, 30))
    const afterFirst = eventsMock.mock.calls.length

    // Re-applying the SAME seq via a DIFFERENT object reference forces the
    // context effect to re-run, but the lastHandledSeqRef guard must block the
    // duplicate fetch.
    rerender(wrapEv({ type: 'index_done', file_id: ACTIVE_FILE, seq: 7 }))
    await new Promise((r) => setTimeout(r, 30))
    expect(eventsMock.mock.calls.length).toBe(afterFirst)
  })

  it('6. switching files resets live and does not auto-refetch for the new file', async () => {
    const { rerender } = renderView({ type: 'index_done', file_id: ACTIVE_FILE, seq: 1 })
    await settleInitialLoad()

    fireEvent.click(followButton())
    await waitFor(() => expect(followButton().checked).toBe(true))

    // Switch to a new file -> live must reset to off.
    rerender(wrapEv({ type: 'index_done', file_id: OTHER_FILE, seq: 1 }, OTHER_FILE))
    await waitFor(() => expect(followButton().checked).toBe(false))

    const before = eventsMock.mock.calls.length
    // An index_done for the new file must NOT auto-refetch since live was reset.
    rerender(wrapEv({ type: 'index_done', file_id: OTHER_FILE, seq: 2 }, OTHER_FILE))
    await new Promise((r) => setTimeout(r, 30))
    // No tail fetch should fire from a stale live state.
    const tailAfter = eventsMock.mock.calls.slice(before).some((c) => c[0]?.tail)
    expect(tailAfter).toBe(false)
  })

  it('7. the load-more control is absent while live', async () => {
    // next_cursor > 0 so load-more would render when NOT live.
    eventsMock.mockResolvedValue({ events: [], next_cursor: 99, total: 10 })
    renderView({ type: 'noop', file_id: 0, seq: 0 })
    await settleInitialLoad()

    fireEvent.click(followButton())
    await waitFor(() => expect(followButton().checked).toBe(true))

    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
    // Reset the default for other tests.
    eventsMock.mockResolvedValue({ events: [], next_cursor: 0, total: 0 })
  })
})
