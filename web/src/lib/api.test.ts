import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, eventQueryString } from './api'
import { parseUrlState, buildUrlState } from './url'

describe('eventQueryString', () => {
  it('includes only set params', () => {
    const qs = eventQueryString({ file: 3, table: 'orders', limit: 100 })
    const p = new URLSearchParams(qs)
    expect(p.get('file')).toBe('3')
    expect(p.get('table')).toBe('orders')
    expect(p.get('limit')).toBe('100')
    expect(p.has('db')).toBe(false)
    expect(p.has('cursor')).toBe(false)
  })
  it('always includes file even when 0-ish', () => {
    const qs = eventQueryString({ file: 1 })
    expect(new URLSearchParams(qs).get('file')).toBe('1')
  })
  it('encodes cursor for pagination', () => {
    const qs = eventQueryString({ file: 1, cursor: 12345 })
    expect(new URLSearchParams(qs).get('cursor')).toBe('12345')
  })
  it('preserves from_pos=0 (valid seek to file start)', () => {
    const qs = eventQueryString({ file: 1, from_pos: 0 })
    expect(new URLSearchParams(qs).get('from_pos')).toBe('0')
  })
  it('drops cursor=0 (no pagination needed)', () => {
    const qs = eventQueryString({ file: 1, cursor: 0 })
    expect(new URLSearchParams(qs).has('cursor')).toBe(false)
  })
  it('includes tail when set and omits cursor', () => {
    const qs = eventQueryString({ file: 3, tail: 500 })
    const p = new URLSearchParams(qs)
    expect(p.get('tail')).toBe('500')
    expect(p.has('cursor')).toBe(false)
    expect(p.get('file')).toBe('3')
  })
  it('omits tail when not set', () => {
    const qs = eventQueryString({ file: 3, cursor: 100 })
    expect(new URLSearchParams(qs).has('tail')).toBe(false)
  })
})

describe('URL state helpers (pure functions)', () => {
  describe('buildUrlState', () => {
    it('serialises file and tab', () => {
      const qs = buildUrlState({ file: 42, tab: 'txns' })
      const p = new URLSearchParams(qs)
      expect(p.get('file')).toBe('42')
      expect(p.get('tab')).toBe('txns')
    })

    it('serialises filter params', () => {
      const qs = buildUrlState({ type: 'QUERY', db: 'mydb', table: 'orders', q: 'hello' })
      const p = new URLSearchParams(qs)
      expect(p.get('type')).toBe('QUERY')
      expect(p.get('db')).toBe('mydb')
      expect(p.get('table')).toBe('orders')
      expect(p.get('q')).toBe('hello')
    })

    it('omits falsy/zero file', () => {
      const qs = buildUrlState({ file: 0 })
      expect(new URLSearchParams(qs).has('file')).toBe(false)
    })

    it('produces empty string when all fields absent', () => {
      expect(buildUrlState({})).toBe('')
    })
  })

  describe('parseUrlState', () => {
    it('round-trips with buildUrlState', () => {
      const state = { file: 7, tab: 'tables', type: 'QUERY', db: 'app', table: 'users', q: 'test' }
      const parsed = parseUrlState(buildUrlState(state))
      expect(parsed).toEqual(state)
    })

    it('returns empty object for empty string', () => {
      expect(parseUrlState('')).toEqual({})
    })

    it('ignores non-positive file values', () => {
      expect(parseUrlState('file=0').file).toBeUndefined()
      expect(parseUrlState('file=-1').file).toBeUndefined()
      expect(parseUrlState('file=abc').file).toBeUndefined()
    })

    it('handles partial state (only file)', () => {
      const parsed = parseUrlState('file=5')
      expect(parsed.file).toBe(5)
      expect(parsed.tab).toBeUndefined()
    })

    it('handles partial state (only filters)', () => {
      const parsed = parseUrlState('db=mydb&table=orders')
      expect(parsed.file).toBeUndefined()
      expect(parsed.db).toBe('mydb')
      expect(parsed.table).toBe('orders')
    })
  })
})

describe('api.metrics', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('metrics() requests the per-file metrics path', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        return { ok: true, json: async () => ({ events: 0, series: [] }) } as Response
      }),
    )
    await api.metrics(7)
    expect(calls[0]).toBe('/api/files/7/metrics')
  })
})

describe('api.anomalies', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('anomalies() builds the file + severity query', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        return { ok: true, json: async () => [] } as Response
      }),
    )
    await api.anomalies(5, 'high')
    expect(calls[0]).toBe('/api/anomalies?file=5&severity=high')
    await api.anomalies(5)
    expect(calls[1]).toBe('/api/anomalies?file=5')
  })
})
