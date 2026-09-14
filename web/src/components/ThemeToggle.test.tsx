import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { ColorSchemeProvider } from '@/lib/colorScheme'
import ThemeToggle from './ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      // ignore
    }
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-mantine-color-scheme')
  })

  it('renders with accessible name for switching to next theme and toggles on click with focus preserved', async () => {
    render(
      <ColorSchemeProvider>
        <ThemeToggle />
      </ColorSchemeProvider>,
    )

    const btn = screen.getByRole('button', { name: 'Switch to light theme' })
    expect(btn).toBeTruthy()

    await userEvent.click(btn)

    const nextBtn = screen.getByRole('button', { name: 'Switch to dark theme' })
    expect(nextBtn).toBeTruthy()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.activeElement).toBe(nextBtn)
  })
})
