import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemePreference = 'dark' | 'light' | 'auto'

export interface ColorSchemeContextValue {
  preference: ThemePreference
  resolved: 'dark' | 'light'
  setPreference: (val: ThemePreference) => void
}

const STORAGE_KEY = 'binsight-theme'
const LEGACY_STORAGE_KEY = 'mantine-color-scheme-value'

export function getSystemScheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredPreference(): ThemePreference {
  try {
    const val = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (val === 'dark' || val === 'light' || val === 'auto') return val
  } catch {
    // blocked or unavailable storage
  }
  return 'dark'
}

export function resolveScheme(pref: ThemePreference): 'dark' | 'light' {
  if (pref === 'auto') return getSystemScheme()
  return pref
}

export function applySchemeToDOM(resolved: 'dark' | 'light') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

// Initial script application before React mounts to prevent flash
export function applyInitialScheme(): { preference: ThemePreference; resolved: 'dark' | 'light' } {
  const preference = getStoredPreference()
  const resolved = resolveScheme(preference)
  applySchemeToDOM(resolved)
  return { preference, resolved }
}

const ColorSchemeContext = createContext<ColorSchemeContextValue>({
  preference: 'dark',
  resolved: 'dark',
  setPreference: () => {},
})

export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPrefState] = useState<ThemePreference>(() => getStoredPreference())
  const [systemScheme, setSystemScheme] = useState<'dark' | 'light'>(() => getSystemScheme())

  const resolved = preference === 'auto' ? systemScheme : preference

  const setPreference = (newPref: ThemePreference) => {
    setPrefState(newPref)
    try {
      localStorage.setItem(STORAGE_KEY, newPref)
      localStorage.setItem(LEGACY_STORAGE_KEY, newPref)
    } catch {
      // ignore
    }
  }

  // Update DOM when resolved scheme changes
  useEffect(() => {
    applySchemeToDOM(resolved)
  }, [resolved])

  // Listen to matchMedia changes for auto mode
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setSystemScheme(e.matches ? 'dark' : 'light')
    }
    if (mq.addEventListener) {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else if (mq.addListener) {
      mq.addListener(handler)
      return () => mq.removeListener(handler)
    }
  }, [])

  // Listen to cross-tab storage changes
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if (e.newValue === 'dark' || e.newValue === 'light' || e.newValue === 'auto') {
          setPrefState(e.newValue)
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <ColorSchemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ColorSchemeContext.Provider>
  )
}

export function useColorScheme(): ColorSchemeContextValue {
  return useContext(ColorSchemeContext)
}
