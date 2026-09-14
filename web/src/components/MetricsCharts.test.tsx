import { describe, it, expect } from 'vitest'
import { colorFor } from './MetricsCharts'

describe('MetricsCharts color mapping', () => {
  it('maps event types to semantic theme variables', () => {
    // Write events must be green
    expect(colorFor('WRITE_ROWS_V1')).toBe('var(--green)')
    expect(colorFor('WRITE_ROWS_V2')).toBe('var(--green)')

    // Update events must be orange
    expect(colorFor('UPDATE_ROWS_V1')).toBe('var(--orange)')
    expect(colorFor('UPDATE_ROWS_V2')).toBe('var(--orange)')

    // Delete events must be red
    expect(colorFor('DELETE_ROWS_V1')).toBe('var(--red)')
    expect(colorFor('DELETE_ROWS_V2')).toBe('var(--red)')

    // Query events must be grape
    expect(colorFor('QUERY')).toBe('var(--grape)')

    // Others fall back to neutral muted-foreground
    expect(colorFor('ROTATE')).toBe('var(--muted-foreground)')
    expect(colorFor('FORMAT_DESCRIPTION')).toBe('var(--muted-foreground)')
    expect(colorFor('TABLE_MAP')).toBe('var(--muted-foreground)')
    expect(colorFor('UNKNOWN_TYPE')).toBe('var(--muted-foreground)')
  })
})
