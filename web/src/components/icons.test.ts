import { describe, it, expect } from 'vitest'
import { Close, Warning, kindToBadgeVariant } from './icons'

describe('icons module', () => {
  it('exports semantic icons', () => {
    expect(typeof Close).toBe('function') // inline-wrapped icon component
    expect(typeof Warning).toBe('function') // inline-wrapped icon component
  })

  it('kindToBadgeVariant maps semantic variants honoring green quarantine', () => {
    expect(kindToBadgeVariant('WRITE_ROWS_V1')).toBe('success')
    expect(kindToBadgeVariant('WRITE_ROWS_V2')).toBe('success')
    expect(kindToBadgeVariant('UPDATE_ROWS_V1')).toBe('warning')
    expect(kindToBadgeVariant('DELETE_ROWS_V1')).toBe('error')
    expect(kindToBadgeVariant('QUERY')).toBe('info')
    expect(kindToBadgeVariant('CREATE')).toBe('info')
    expect(kindToBadgeVariant('ALTER')).toBe('info')
    expect(kindToBadgeVariant('DROP')).toBe('error')
    expect(kindToBadgeVariant('TRUNCATE')).toBe('warning')
    expect(kindToBadgeVariant('TABLE_MAP')).toBe('outline')
    expect(kindToBadgeVariant('XID')).toBe('outline')
    expect(kindToBadgeVariant('UNKNOWN')).toBe('outline')
  })
})
