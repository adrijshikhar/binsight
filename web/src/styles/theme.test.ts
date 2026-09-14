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
        rule.selector.includes(':root.dark')
      const isLight =
        rule.selector.includes('data-theme="light"') ||
        rule.selector.includes(':root:not(.dark)')
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

    // Task 20A: Coss color roles and destructive separation
    expect(darkTokens['--destructive-foreground']).toBe('var(--data-delete)')
    expect(lightTokens['--destructive-foreground']).toBe('var(--data-delete)')
    expect(darkTokens['--destructive-solid-foreground']).toBe('#ffffff')
    expect(lightTokens['--destructive-solid-foreground']).toBe('#ffffff')
    expect(darkTokens['--destructive-hover']).toBe('#9f1239')
    expect(lightTokens['--destructive-hover']).toBe('#9f1239')

    expect(darkTokens['--info']).toBe('var(--selection)')
    expect(darkTokens['--info-foreground']).toBe('var(--brand-foreground)')
    expect(lightTokens['--info']).toBe('var(--selection)')
    expect(lightTokens['--info-foreground']).toBe('var(--brand-foreground)')

    expect(darkTokens['--warning']).toBe('var(--data-update-bg)')
    expect(darkTokens['--warning-foreground']).toBe('var(--data-update)')
    expect(lightTokens['--warning']).toBe('var(--data-update-bg)')
    expect(lightTokens['--warning-foreground']).toBe('var(--data-update)')

    // Success role must be NEUTRAL, strictly respecting green quarantine
    expect(darkTokens['--success']).toBe('var(--surface-2)')
    expect(darkTokens['--success-foreground']).toBe('var(--foreground)')
    expect(lightTokens['--success']).toBe('var(--surface-2)')
    expect(lightTokens['--success-foreground']).toBe('var(--foreground)')

    // Ready dot exception
    expect(darkTokens['--status-ready']).toBe('#34d399')
    expect(lightTokens['--status-ready']).toBe('#059669')

    // Task 20B: Font stacks and headings
    expect(sharedTokens['--font-sans']).toBe(
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
    )
    expect(sharedTokens['--font-mono']).toBe(
      "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace",
    )
    expect(sharedTokens['--font-heading'] || darkTokens['--font-heading']).toBe('var(--font-sans)')

    // Task 20B: Binsight type scale and zero tracking
    expect(sharedTokens['--fs-badge']).toBe('11px')
    expect(sharedTokens['--lh-badge']).toBe('14px')
    expect(sharedTokens['--fs-compact']).toBe('12px')
    expect(sharedTokens['--lh-compact']).toBe('16px')
    expect(sharedTokens['--fs-body']).toBe('13px')
    expect(sharedTokens['--lh-body']).toBe('20px')
    expect(sharedTokens['--fs-section']).toBe('16px')
    expect(sharedTokens['--lh-section']).toBe('22px')
    expect(sharedTokens['--fs-heading']).toBe('20px')
    expect(sharedTokens['--lh-heading']).toBe('26px')
    expect(sharedTokens['--fs-metric']).toBe('24px')
    expect(sharedTokens['--lh-metric']).toBe('30px')
    expect(sharedTokens['--letter-spacing-zero']).toBe('0')

    // Legacy aliases preserved
    expect(sharedTokens['--fs-sm']).toBe('var(--fs-badge)')
    expect(sharedTokens['--fs-base']).toBe('var(--fs-body)')
    expect(sharedTokens['--fs-lg']).toBe('var(--fs-section)')
    expect(sharedTokens['--fs-xl']).toBe('var(--fs-heading)')
  })

  it('verifies global.css enforces zero letter-spacing on headings and controls', () => {
    const globalCssPath = path.resolve(process.cwd(), 'src/global.css')
    const globalCss = fs.readFileSync(globalCssPath, 'utf-8')
    const globalRoot = postcss.parse(globalCss)

    let headingSpacing: string | undefined
    let controlsSpacing: string | undefined
    let bodyFontFamily: string | undefined

    globalRoot.walkRules((rule: Rule) => {
      if (rule.selector === 'body') {
        rule.walkDecls('font-family', (decl) => {
          bodyFontFamily = decl.value
        })
      }
      if (rule.selector === 'h1, h2, h3, h4, h5, h6') {
        rule.walkDecls('letter-spacing', (decl) => {
          headingSpacing = decl.value
        })
      }
      if (
        rule.selector.includes('button') &&
        rule.selector.includes('[data-slot="badge"]')
      ) {
        rule.walkDecls('letter-spacing', (decl) => {
          controlsSpacing = decl.value
        })
      }
    })

    expect(bodyFontFamily).toBe('var(--font-sans)')
    expect(headingSpacing).toBe('0')
    expect(controlsSpacing).toBe('0')
  })

  it('verifies pills, shapes and navigation adhere to compact rounded rectangle specs', () => {
    // 1. FilterChip uses rounded-xs (4px)
    const filterChipPath = path.resolve(process.cwd(), 'src/components/ui/filter-chip.tsx')
    const filterChipCode = fs.readFileSync(filterChipPath, 'utf-8')
    expect(filterChipCode).toContain('rounded-xs')

    // 2. Badge uses rounded-sm (6px)
    const badgePath = path.resolve(process.cwd(), 'src/components/ui/badge.tsx')
    const badgeCode = fs.readFileSync(badgePath, 'utf-8')
    expect(badgeCode).toContain('rounded-sm')

    // 3. Card uses rounded-lg (12px)
    const cardPath = path.resolve(process.cwd(), 'src/components/ui/card.tsx')
    const cardCode = fs.readFileSync(cardPath, 'utf-8')
    expect(cardCode).toContain('rounded-lg')
    expect(cardCode).not.toContain('rounded-2xl')

    // 4. App tabs use underline navigation
    const appCssPath = path.resolve(process.cwd(), 'src/App.module.css')
    const appCss = fs.readFileSync(appCssPath, 'utf-8')
    expect(appCss).toContain('border-bottom: 2px solid transparent')
    expect(appCss).toContain('border-bottom-color: var(--primary)')

    // 5. Dialog uses rounded-md (8px)
    const dialogPath = path.resolve(process.cwd(), 'src/components/ui/dialog.tsx')
    const dialogCode = fs.readFileSync(dialogPath, 'utf-8')
    expect(dialogCode).toContain('rounded-md')
    expect(dialogCode).not.toContain('rounded-2xl')
  })

  it('verifies elevation and interaction states (focus rings and reduced motion)', () => {
    const globalCssPath = path.resolve(process.cwd(), 'src/global.css')
    const globalCss = fs.readFileSync(globalCssPath, 'utf-8')
    const globalRoot = postcss.parse(globalCss)

    let hasFocusRing = false
    let hasReducedMotion = false

    globalRoot.walkRules((rule: Rule) => {
      if (rule.selector === ':focus-visible') {
        const outline = rule.nodes.find((n) => n.type === 'decl' && n.prop === 'outline')
        const offset = rule.nodes.find((n) => n.type === 'decl' && n.prop === 'outline-offset')
        if (outline && offset) {
          hasFocusRing = true
        }
      }
    })

    globalRoot.walkAtRules((atRule) => {
      if (
        atRule.name === 'media' &&
        atRule.params.includes('prefers-reduced-motion: reduce')
      ) {
        hasReducedMotion = true
      }
    })

    expect(hasFocusRing).toBe(true)
    expect(hasReducedMotion).toBe(true)
  })
})
