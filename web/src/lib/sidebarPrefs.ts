// Sidebar layout preferences: collapsed (icon-rail) flag + expanded width,
// persisted to localStorage so the layout survives reloads.
//
// The parse/clamp logic is kept pure (no localStorage access) so it is unit
// testable in the node test env; load/save are thin guarded wrappers.

export interface SidebarPrefs {
  collapsed: boolean
  width: number
}

export const SIDEBAR_MIN_WIDTH = 150
export const SIDEBAR_MAX_WIDTH = 480
export const SIDEBAR_DEFAULT_WIDTH = 200
export const SIDEBAR_RAIL_WIDTH = 48

export const DRAWER_MIN_WIDTH = 360
export const DRAWER_MAX_WIDTH = 1000
export const DRAWER_DEFAULT_WIDTH = 520

const KEY_COLLAPSED = 'sidebar.collapsed'
const KEY_WIDTH = 'sidebar.width'
const KEY_DRAWER_WIDTH = 'drawer.width'

// Constrain a width to [min, max]. Non-finite input falls back to def rather
// than producing NaN downstream.
function clampTo(n: number, min: number, max: number, def: number): number {
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function clampWidth(n: number): number {
  return clampTo(n, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_DEFAULT_WIDTH)
}

export function clampDrawerWidth(n: number): number {
  return clampTo(n, DRAWER_MIN_WIDTH, DRAWER_MAX_WIDTH, DRAWER_DEFAULT_WIDTH)
}

export function loadDrawerWidth(): number {
  if (typeof localStorage === 'undefined') return DRAWER_DEFAULT_WIDTH
  const raw = localStorage.getItem(KEY_DRAWER_WIDTH)
  return raw === null ? DRAWER_DEFAULT_WIDTH : clampDrawerWidth(Number(raw))
}

export function saveDrawerWidth(width: number): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY_DRAWER_WIDTH, String(clampDrawerWidth(width)))
}

// Build prefs from raw localStorage strings (or null when unset/unavailable).
// Pure — does not touch localStorage so it can be tested directly.
export function parsePrefs(rawCollapsed: string | null, rawWidth: string | null): SidebarPrefs {
  return {
    collapsed: rawCollapsed === 'true',
    width: rawWidth === null ? SIDEBAR_DEFAULT_WIDTH : clampWidth(Number(rawWidth)),
  }
}

export function loadPrefs(): SidebarPrefs {
  if (typeof localStorage === 'undefined') {
    return { collapsed: false, width: SIDEBAR_DEFAULT_WIDTH }
  }
  return parsePrefs(localStorage.getItem(KEY_COLLAPSED), localStorage.getItem(KEY_WIDTH))
}

export function savePrefs(prefs: SidebarPrefs): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY_COLLAPSED, String(prefs.collapsed))
  localStorage.setItem(KEY_WIDTH, String(clampWidth(prefs.width)))
}
