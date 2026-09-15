/**
 * Minimal URL state helpers - sync key view state to the query string via
 * history.replaceState so the view is shareable and survives reload.
 * No router dependency; uses the History API directly.
 */

export interface UrlState {
  file?: number
  tab?: string
  type?: string // comma-separated event types (multi-select)
  db?: string
  table?: string
  q?: string
  txn?: string // comma-separated txn ids (multi-select)
  event?: number
}

/**
 * Parse URL state from a query string (the part after "?", without the "?").
 * Pure function - testable without a browser.
 */
export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search)
  const state: UrlState = {}
  const file = p.get('file')
  if (file !== null) {
    const n = parseInt(file, 10)
    if (!Number.isNaN(n) && n > 0) state.file = n
  }
  const tab = p.get('tab')
  if (tab) state.tab = tab
  const type = p.get('type')
  if (type) state.type = type
  const db = p.get('db')
  if (db) state.db = db
  const table = p.get('table')
  if (table) state.table = table
  const q = p.get('q')
  if (q) state.q = q
  const txn = p.get('txn')
  if (txn) state.txn = txn
  const event = p.get('event')
  if (event !== null) {
    const n = parseInt(event, 10)
    if (!Number.isNaN(n) && n > 0) state.event = n
  }
  return state
}

/**
 * Serialise URL state to a query string (without leading "?").
 * Pure function - testable without a browser.
 */
export function buildUrlState(state: UrlState): string {
  const p = new URLSearchParams()
  if (state.file && state.file > 0) p.set('file', String(state.file))
  if (state.tab) p.set('tab', state.tab)
  if (state.type) p.set('type', state.type)
  if (state.db) p.set('db', state.db)
  if (state.table) p.set('table', state.table)
  if (state.q) p.set('q', state.q)
  if (state.txn) p.set('txn', state.txn)
  if (state.event && state.event > 0) p.set('event', String(state.event))
  return p.toString()
}

/** Read current URL state from window.location.search. */
export function readUrlState(): UrlState {
  if (typeof window === 'undefined') return {}
  return parseUrlState(window.location.search.replace(/^\?/, ''))
}

/**
 * Write state to the URL query string without adding a history entry.
 * Merges over the current URL so partial writers (App writes file/tab/event,
 * EventsView writes file/type/db/table/q) don't strip each other's keys.
 * Pass a key as `undefined` to clear it.
 */
export function writeUrlState(state: UrlState): void {
  if (typeof window === 'undefined') return
  const next = buildUrlState({ ...readUrlState(), ...state })
  const current = window.location.search.replace(/^\?/, '')
  if (next !== current) {
    window.history.replaceState(null, '', next ? `?${next}` : window.location.pathname)
  }
}

/**
 * Like writeUrlState but PUSHES a new history entry, so the browser Back button
 * returns to the previous in-app view (tab / event / file) instead of leaving
 * the site. Used for navigation transitions; live edits (search typing) keep
 * using writeUrlState to avoid flooding the history stack.
 */
export function pushUrlState(state: UrlState): void {
  if (typeof window === 'undefined') return
  const next = buildUrlState({ ...readUrlState(), ...state })
  const current = window.location.search.replace(/^\?/, '')
  if (next !== current) {
    window.history.pushState(null, '', next ? `?${next}` : window.location.pathname)
  }
}
