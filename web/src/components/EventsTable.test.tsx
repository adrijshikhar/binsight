import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import EventsTable from './EventsTable'

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

// Spy on useVirtualizer options and configurable return value
let capturedOptions: Record<string, unknown> | null = null
let mockVirtualizerResult = {
  getTotalSize: () => 320,
  getVirtualItems: () => [] as Array<{ index: number; start: number; size: number }>,
  scrollToIndex: vi.fn(),
  measureElement: vi.fn(),
}

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: Record<string, unknown>) => {
    capturedOptions = options
    return mockVirtualizerResult
  },
}))

describe('EventsTable', () => {
  it('estimates compact event rows at 32px before runtime measurement', () => {
    render(<EventsTable visualRows={[]} renderEventRow={() => null} renderGroupRow={() => null} />)
    expect(capturedOptions).toBeTruthy()
    const estimateFn = capturedOptions?.estimateSize as () => number
    expect(estimateFn()).toBe(32)
  })

  it('honors explicit estimateSize override', () => {
    render(<EventsTable visualRows={[]} estimateSize={40} renderEventRow={() => null} renderGroupRow={() => null} />)
    expect(capturedOptions).toBeTruthy()
    const estimateFn = capturedOptions?.estimateSize as () => number
    expect(estimateFn()).toBe(40)
  })

  it('renders only the virtual subset with top and bottom spacers matching virtualizer metrics', () => {
    mockVirtualizerResult = {
      getTotalSize: () => 640,
      getVirtualItems: () => [
        { index: 2, start: 64, size: 32 },
        { index: 3, start: 96, size: 32 },
      ],
      scrollToIndex: vi.fn(),
      measureElement: vi.fn(),
    }

    const visualRows = Array.from({ length: 20 }, (_, i) => ({
      kind: 'event' as const,
      e: { id: i, name: `event-${i}` },
    }))

    const renderEventRow = vi.fn((e: { id: number; name: string }, idx: number) => (
      <tr key={e.id} data-testid={`row-${idx}`}>
        <td>{e.name}</td>
      </tr>
    ))

    const { container } = render(
      <EventsTable visualRows={visualRows} renderEventRow={renderEventRow} renderGroupRow={() => null} />,
    )

    // Only index 2 and index 3 should be rendered
    expect(renderEventRow).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-testid="row-2"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="row-3"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="row-0"]')).toBeNull()
    expect(container.querySelector('[data-testid="row-1"]')).toBeNull()

    // Spacer rows: top spacer height = 64px, bottom spacer height = 640 - (96 + 32) = 512px
    const spacers = container.querySelectorAll('tr[style*="height"]')
    expect(spacers).toHaveLength(2)
    expect((spacers[0] as HTMLElement).style.height).toBe('64px')
    expect((spacers[1] as HTMLElement).style.height).toBe('512px')
  })
})
