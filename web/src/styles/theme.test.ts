import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import postcss, { Rule } from 'postcss'

const cssPath = path.resolve(process.cwd(), 'src/styles/theme.css')
const css = fs.readFileSync(cssPath, 'utf-8')

describe('theme.css', () => {
  it('defines valid CSS containing required dark and light tokens', () => {
    const root = postcss.parse(css)
    expect(root.nodes.length).toBeGreaterThan(0)

    const darkTokens: Record<string, string> = {}
    const lightTokens: Record<string, string> = {}
    const sharedTokens: Record<string, string> = {}

    root.walkRules((rule: Rule) => {
      const isDark =
        rule.selector.includes('data-theme="dark"') ||
        rule.selector.includes("data-mantine-color-scheme='dark'") ||
        rule.selector.includes('.dark')
      const isLight =
        rule.selector.includes('data-theme="light"') ||
        rule.selector.includes("data-mantine-color-scheme='light'") ||
        rule.selector.includes(':not(.dark)')
      const isRoot = rule.selector === ':root' || rule.selector === ':root, :host'

      rule.walkDecls((decl) => {
        if (isDark) {
          darkTokens[decl.prop] = decl.value
        } else if (isLight) {
          lightTokens[decl.prop] = decl.value
        } else if (isRoot) {
          sharedTokens[decl.prop] = decl.value
        }
      })
    })

    // Exact primary values
    expect(darkTokens['--primary']).toBe('#0075de')
    expect(lightTokens['--primary']).toBe('#0062bd')

    // Stock surface roles
    expect(darkTokens['--accent']).toBe('var(--selection)')
    expect(lightTokens['--accent']).toBe('var(--selection)')
    expect(darkTokens['--muted']).toBe('var(--surface-2)')
    expect(lightTokens['--muted']).toBe('var(--surface-2)')

    // Radii
    expect(sharedTokens['--radius-xs'] || darkTokens['--radius-xs']).toBe('4px')
    expect(sharedTokens['--radius-sm'] || darkTokens['--radius-sm']).toBe('6px')
    expect(sharedTokens['--radius-md'] || darkTokens['--radius-md']).toBe('8px')
    expect(sharedTokens['--radius-lg'] || darkTokens['--radius-lg']).toBe('12px')
    expect(sharedTokens['--radius-pill'] || darkTokens['--radius-pill']).toBe('9999px')

    // Standard shadcn aliases
    expect(darkTokens['--card']).toBe('var(--surface-1)')
    expect(darkTokens['--popover']).toBe('var(--surface-3)')
    expect(darkTokens['--brand']).toBe('var(--primary)')
    expect(darkTokens['--muted-foreground']).toBe('#8a8f98')
    expect(lightTokens['--muted-foreground']).toBe('#62666d')

    // Preserved behavioral variables from former theme.test.ts
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
      expect(darkTokens[v], `dark missing ${v}`).toBeTruthy()
      expect(lightTokens[v], `light missing ${v}`).toBeTruthy()
    }

    // Specific dark scheme values
    expect(darkTokens['--bg']).toBe('var(--background)')
    expect(darkTokens['--panel']).toBe('var(--surface-1)')
    expect(darkTokens['--green']).toBe('var(--data-insert)')
    expect(darkTokens['--red']).toBe('var(--data-delete)')
    expect(darkTokens['--orange']).toBe('var(--data-update)')
    expect(darkTokens['--warn']).toBe('var(--data-update)')

    // Surface ladder
    expect(darkTokens['--panel2']).toBe('var(--surface-2)')
    expect(darkTokens['--elev']).toBe('var(--surface-3)')
    expect(darkTokens['--surface-4']).toBe('#191a1b')
    expect(darkTokens['--border-strong']).toBe('#34343a')
    expect(lightTokens['--surface-4']).toBe('#f1f3f5')
    expect(lightTokens['--border-strong']).toBe('#ced4da')
  })
})
