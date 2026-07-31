import { describe, it, expect } from 'vitest'
import {
  clampWidth,
  clampDrawerWidth,
  parsePrefs,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  DRAWER_MIN_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_DEFAULT_WIDTH,
} from './sidebarPrefs'

describe('clampWidth', () => {
  it('keeps in-range widths (rounded)', () => {
    expect(clampWidth(240)).toBe(240)
    expect(clampWidth(240.6)).toBe(241)
  })

  it('clamps below min and above max', () => {
    expect(clampWidth(10)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampWidth(9999)).toBe(SIDEBAR_MAX_WIDTH)
  })

  it('falls back to default on non-finite input', () => {
    expect(clampWidth(NaN)).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(clampWidth(Infinity)).toBe(SIDEBAR_DEFAULT_WIDTH)
  })
})

describe('clampDrawerWidth', () => {
  it('keeps in-range widths (rounded)', () => {
    expect(clampDrawerWidth(640)).toBe(640)
    expect(clampDrawerWidth(639.4)).toBe(639)
  })

  it('clamps below min and above max', () => {
    expect(clampDrawerWidth(100)).toBe(DRAWER_MIN_WIDTH)
    expect(clampDrawerWidth(9999)).toBe(DRAWER_MAX_WIDTH)
  })

  it('falls back to default on non-finite input', () => {
    expect(clampDrawerWidth(NaN)).toBe(DRAWER_DEFAULT_WIDTH)
  })
})

describe('parsePrefs', () => {
  it('returns defaults when storage is empty', () => {
    expect(parsePrefs(null, null)).toEqual({ collapsed: false, width: SIDEBAR_DEFAULT_WIDTH })
  })

  it('reads collapsed only for the exact string "true"', () => {
    expect(parsePrefs('true', null).collapsed).toBe(true)
    expect(parsePrefs('false', null).collapsed).toBe(false)
    expect(parsePrefs('1', null).collapsed).toBe(false)
  })

  it('clamps a persisted out-of-range width', () => {
    expect(parsePrefs(null, '99999').width).toBe(SIDEBAR_MAX_WIDTH)
    expect(parsePrefs(null, '5').width).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('falls back to default width on garbage', () => {
    expect(parsePrefs(null, 'abc').width).toBe(SIDEBAR_DEFAULT_WIDTH)
  })
})
