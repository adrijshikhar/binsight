import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MetricsCharts, { colorFor } from './MetricsCharts'
import type { Bucket, TypeBytes } from '../lib/types'

describe('MetricsCharts color mapping', () => {
  it('maps event types to semantic theme variables', () => {
    // Write events must be data-insert
    expect(colorFor('WRITE_ROWS_V1')).toBe('var(--data-insert)')
    expect(colorFor('WRITE_ROWS_V2')).toBe('var(--data-insert)')

    // Update events must be data-update
    expect(colorFor('UPDATE_ROWS_V1')).toBe('var(--data-update)')
    expect(colorFor('UPDATE_ROWS_V2')).toBe('var(--data-update)')

    // Delete events must be data-delete
    expect(colorFor('DELETE_ROWS_V1')).toBe('var(--data-delete)')
    expect(colorFor('DELETE_ROWS_V2')).toBe('var(--data-delete)')

    // Query events must be data-query
    expect(colorFor('QUERY')).toBe('var(--data-query)')

    // Others fall back to neutral muted-foreground
    expect(colorFor('ROTATE')).toBe('var(--muted-foreground)')
    expect(colorFor('FORMAT_DESCRIPTION')).toBe('var(--muted-foreground)')
    expect(colorFor('TABLE_MAP')).toBe('var(--muted-foreground)')
    expect(colorFor('UNKNOWN_TYPE')).toBe('var(--muted-foreground)')
  })
})

describe('MetricsCharts rendering', () => {
  it('renders empty message when series is empty', () => {
    render(
      <MetricsCharts
        series={[]}
        byType={[]}
        onOpenType={vi.fn()}
      />,
    )
    expect(screen.getByText('no event activity to chart')).toBeTruthy()
  })

  it('renders loading state', () => {
    const { container } = render(
      <MetricsCharts
        series={[]}
        byType={[]}
        onOpenType={vi.fn()}
        loading
      />,
    )
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0)
  })

  it('renders error alert and retry button', () => {
    const onRetry = vi.fn()
    render(
      <MetricsCharts
        series={[]}
        byType={[]}
        onOpenType={vi.fn()}
        error="Network timeout"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Network timeout/)).toBeTruthy()
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders chart regions for populated series', () => {
    const mockSeries: Bucket[] = [
      { t: 1700000000, count: 10, bytes: 1024, dml: 10, query: 0, other: 0, by_type: { WRITE_ROWS_V2: 10 } },
      { t: 1700000010, count: 5, bytes: 512, dml: 5, query: 0, other: 0, by_type: { WRITE_ROWS_V2: 5 } },
    ]
    const mockByType: TypeBytes[] = [
      { type_name: 'WRITE_ROWS_V2', events: 15, bytes: 1536 },
    ]

    const { container } = render(
      <MetricsCharts
        series={mockSeries}
        byType={mockByType}
        onOpenType={vi.fn()}
      />,
    )

    // Chart panels exist with proper accessible roles/labels
    const chartImgs = container.querySelectorAll('[role="img"]')
    expect(chartImgs.length).toBe(4)
    expect(screen.getByText('events over time')).toBeTruthy()
    expect(screen.getByText('bytes/sec over time')).toBeTruthy()
    expect(screen.getByText('bytes by type')).toBeTruthy()
    expect(screen.getByText('event types over time')).toBeTruthy()
  })
})
