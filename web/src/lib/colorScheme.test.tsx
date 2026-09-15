import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ColorSchemeProvider, useColorScheme, ThemePreference } from './colorScheme'

function TestConsumer() {
  const { preference, resolved, setPreference } = useColorScheme()
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setPreference('light')}>Set Light</button>
      <button onClick={() => setPreference('dark')}>Set Dark</button>
      <button onClick={() => setPreference('auto')}>Set Auto</button>
    </div>
  )
}

describe('colorScheme', () => {
  const STORAGE_KEY = 'mantine-color-scheme-value'
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    const mockStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
      clear: () => {
        store = {}
      },
      length: 0,
      key: (i: number) => Object.keys(store)[i] ?? null,
    }
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })

    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  it('defaults to dark when preference is absent or invalid', () => {
    render(
      <ColorSchemeProvider>
        <TestConsumer />
      </ColorSchemeProvider>,
    )

    expect(screen.getByTestId('preference').textContent).toBe('dark')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('loads stored light preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    render(
      <ColorSchemeProvider>
        <TestConsumer />
      </ColorSchemeProvider>,
    )

    expect(screen.getByTestId('preference').textContent).toBe('light')
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('sets preference and updates DOM and localStorage', async () => {
    render(
      <ColorSchemeProvider>
        <TestConsumer />
      </ColorSchemeProvider>,
    )

    await userEvent.click(screen.getByText('Set Light'))

    expect(screen.getByTestId('preference').textContent).toBe('light')
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await userEvent.click(screen.getByText('Set Dark'))

    expect(screen.getByTestId('preference').textContent).toBe('dark')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('handles auto mode with matchMedia', async () => {
    // Mock matchMedia returning false for dark (i.e. light OS theme)
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(
      <ColorSchemeProvider>
        <TestConsumer />
      </ColorSchemeProvider>,
    )

    await userEvent.click(screen.getByText('Set Auto'))

    expect(screen.getByTestId('preference').textContent).toBe('auto')
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
