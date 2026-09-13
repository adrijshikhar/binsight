import { describe, it, expect } from 'vitest'
import { cssVariablesResolver } from './theme'
import { MantineTheme } from '@mantine/core'

// The resolver ignores the theme argument — it uses only the token objects.
// We pass a minimal stub cast to satisfy the type signature.
const stubTheme = {} as MantineTheme

describe('cssVariablesResolver', () => {
  it('defines required CSS custom properties in both dark and light schemes', () => {
    const result = cssVariablesResolver(stubTheme)
    const requiredVars = [
      '--accent',
      '--green',
      '--red',
      '--orange',
      '--bg',
      '--panel',
      '--text',
      '--text2',
      '--accent-soft',
      '--grape',
      '--teal',
      '--indigo',
      '--diff-dis-bar',
    ]

    for (const v of requiredVars) {
      const darkVal = (result.dark as Record<string, string>)[v]
      const lightVal = (result.light as Record<string, string>)[v]
      expect(darkVal, `dark missing ${v}`).toBeTruthy()
      expect(lightVal, `light missing ${v}`).toBeTruthy()
    }
  })

  it('uses correct dark scheme values', () => {
    const dark = cssVariablesResolver(stubTheme).dark as Record<string, string>
    expect(dark['--accent']).toBe('#87d68d')
    expect(dark['--green']).toBe('#87d68d')
    expect(dark['--red']).toBe('#fb7185')
    expect(dark['--orange']).toBe('#fbbf24')
    expect(dark['--warn']).toBe('#fbbf24')
  })

  it('uses correct light scheme values', () => {
    const light = cssVariablesResolver(stubTheme).light as Record<string, string>
    expect(light['--accent']).toBe('#2f8e3a')
    expect(light['--green']).toBe('#2f8e3a')
    expect(light['--red']).toBe('#e11d48')
    expect(light['--orange']).toBe('#d97706')
    expect(light['--warn']).toBe('#d97706')
  })
})
