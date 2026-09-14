import { describe, it, expect } from 'vitest'
import { Close, Warning, kindBadgeStyle, kindBadgeClassName, kindColor } from './icons'

describe('icons module', () => {
  it('exports semantic icons', () => {
    expect(typeof Close).toBe('function') // inline-wrapped icon component
    expect(typeof Warning).toBe('function') // inline-wrapped icon component
  })

  it('kindBadgeStyle drives badge vars off the right palette token per kind', () => {
    // text + fill are color-mixed from the kind's token (quiet, not full chroma)
    expect(kindBadgeStyle('QUERY')['--badge-color' as never]).toContain('var(--grape)')
    expect(kindBadgeStyle('XID')['--badge-color' as never]).toContain('var(--brand)')
    expect(kindBadgeStyle('TABLE_MAP')['--badge-color' as never]).toContain('var(--indigo)')
    expect(kindBadgeStyle('WRITE_ROWS_V2')['--badge-color' as never]).toContain('var(--green)')
    expect(kindBadgeStyle('WRITE_ROWS_V2')['--badge-bg' as never]).toContain('var(--green)')
    // unknown kind -> muted-foreground (neutral), not an uncoloured fallback
    expect(kindBadgeStyle('SOMETHING_ELSE')['--badge-color' as never]).toContain('var(--muted-foreground)')
  })

  it('kindBadgeClassName returns CSS module classes for event kinds', () => {
    expect(kindBadgeClassName('WRITE_ROWS_V1')).toContain('green')
    expect(kindBadgeClassName('WRITE_ROWS_V2')).toContain('green')
    expect(kindBadgeClassName('UPDATE_ROWS_V1')).toContain('orange')
    expect(kindBadgeClassName('DELETE_ROWS_V1')).toContain('red')
    expect(kindBadgeClassName('QUERY')).toContain('grape')
    expect(kindBadgeClassName('XID')).toContain('accent')
    expect(kindBadgeClassName('TABLE_MAP')).toContain('indigo')
    expect(kindBadgeClassName('UNKNOWN')).toContain('muted')
  })

  it('kindColor maps event types to theme color names', () => {
    expect(kindColor('WRITE_ROWS_V1')).toBe('green')
    expect(kindColor('WRITE_ROWS_V2')).toBe('green')
    expect(kindColor('UPDATE_ROWS_V1')).toBe('orange')
    expect(kindColor('DELETE_ROWS_V1')).toBe('red')
    expect(kindColor('QUERY')).toBe('grape')
    expect(kindColor('XID')).toBe('accent')
    expect(kindColor('TABLE_MAP')).toBe('teal')
    expect(kindColor('FORMAT_DESCRIPTION')).toBe('gray')
  })
})
