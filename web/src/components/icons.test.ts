import { describe, it, expect } from 'vitest'
import { Close, Warning, kindBadgeStyle } from './icons'

describe('icons module', () => {
  it('exports semantic icons', () => {
    expect(typeof Close).toBe('function') // inline-wrapped icon component
    expect(typeof Warning).toBe('function') // inline-wrapped icon component
  })

  it('kindBadgeStyle drives badge vars off the right palette token per kind', () => {
    // text + fill are color-mixed from the kind's token (quiet, not full chroma)
    expect(kindBadgeStyle('QUERY')['--badge-color' as never]).toContain('var(--grape)')
    expect(kindBadgeStyle('XID')['--badge-color' as never]).toContain('var(--accent)')
    expect(kindBadgeStyle('TABLE_MAP')['--badge-color' as never]).toContain('var(--indigo)')
    expect(kindBadgeStyle('WRITE_ROWS_V2')['--badge-color' as never]).toContain('var(--green)')
    expect(kindBadgeStyle('WRITE_ROWS_V2')['--badge-bg' as never]).toContain('var(--green)')
    // unknown kind → muted (neutral), not an uncoloured fallback
    expect(kindBadgeStyle('SOMETHING_ELSE')['--badge-color' as never]).toContain('var(--muted)')
  })
})
