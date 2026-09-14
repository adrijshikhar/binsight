import { describe, it, expect } from 'vitest'
import { cssVariablesResolver, theme } from './theme'
import { MantineTheme } from '@mantine/core'

// The resolver ignores the theme argument - it uses only the token objects.
// We pass a minimal stub cast to satisfy the type signature.
const stubTheme = {} as MantineTheme

describe('cssVariablesResolver', () => {
  it('defines required CSS custom properties in both dark and light schemes', () => {
    const result = cssVariablesResolver(stubTheme)
    const requiredVars = [
      '--brand',
      '--muted-foreground',
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
    expect(dark['--brand']).toBe('#0075de')
    expect(dark['--bg']).toBe('#010102')
    expect(dark['--panel']).toBe('#0f1011')
    expect(dark['--green']).toBe('#34d399')
    expect(dark['--red']).toBe('#fb7185')
    expect(dark['--orange']).toBe('#fbbf24')
    expect(dark['--warn']).toBe('#fbbf24')
  })

  it('uses correct light scheme values', () => {
    const light = cssVariablesResolver(stubTheme).light as Record<string, string>
    expect(light['--brand']).toBe('#0075de')
    expect(light['--bg']).toBe('#ffffff')
    expect(light['--panel']).toBe('#f5f6f6')
    expect(light['--green']).toBe('#059669')
    expect(light['--red']).toBe('#e11d48')
    expect(light['--orange']).toBe('#d97706')
    expect(light['--warn']).toBe('#d97706')
  })

  it('exposes the complete Linear surface and focus contract', () => {
    const result = cssVariablesResolver(stubTheme)
    expect(result.dark).toMatchObject({
      '--panel2': '#141516',
      '--elev': '#18191a',
      '--surface-4': '#191a1b',
      '--border-strong': '#34343a',
      '--accent-hi': '#388bfd',
      '--accent-focus': '#0075de',
    })
    expect(result.light).toMatchObject({
      '--surface-4': '#f1f3f5',
      '--border-strong': '#ced4da',
      '--accent-focus': '#0075de',
      '--accent-hi': '#005bab',
    })
    expect(result.variables['--radius-pill']).toBe('9999px')
  })

  it('configures canonical component radius defaults', () => {
    expect(theme.defaultRadius).toBe('sm')
    expect(theme.components?.Card?.defaultProps?.radius).toBe('sm')
    expect(theme.components?.Paper?.defaultProps?.radius).toBe('sm')
    expect(theme.components?.SegmentedControl?.defaultProps?.radius).toBe('pill')
  })
})
