import {
  createTheme,
  type MantineColorsTuple,
  type CSSVariablesResolver,
  defaultVariantColorsResolver,
  type VariantColorsResolver,
} from '@mantine/core'

// Electric Sky Blue (Raycast / Linear technical devtool) - primary interactive accent.
// primaryShade picks 4 in dark (#38bdf8, luminous electric blue), 6 in light (#0284c7, high contrast cobalt).
const accent: MantineColorsTuple = [
  '#f0f9ff',
  '#e0f2fe',
  '#bae6fd',
  '#7dd3fc',
  '#38bdf8',
  '#0ea5e9',
  '#0284c7',
  '#0369a1',
  '#075985',
  '#0c4a6e',
]

// Inky Raycast / Linear dark surface ladder.
// index: 0 text ... 5 border, 6 panel2, 7 panel, 8 bg, 9 deepest.
const dark: MantineColorsTuple = [
  '#f3f6f9',
  '#c7d1db',
  '#8b98a5',
  '#6b7887',
  '#3d4756',
  '#252c38',
  '#181c24',
  '#101319',
  '#090c10',
  '#05070a',
]

// Green scale (Tailwind Emerald) - used exclusively for WRITE rows, diff additions, and success states.
const green: MantineColorsTuple = [
  '#ecfdf5',
  '#d1fae5',
  '#a7f3d0',
  '#6ee7b7',
  '#34d399',
  '#10b981',
  '#059669',
  '#047857',
  '#065f46',
  '#064e3b',
]

const orange: MantineColorsTuple = [
  '#fffbeb',
  '#fef3c7',
  '#fde68a',
  '#fcd34d',
  '#fbbf24',
  '#f59e0b',
  '#d97706',
  '#b45309',
  '#92400e',
  '#652707',
]

// Calibrated Coral-Rose scale - eliminates dark-red muddy blending on dark slate panels.
const red: MantineColorsTuple = [
  '#fff1f2',
  '#ffe4e6',
  '#fecdd3',
  '#fda4af',
  '#fb7185',
  '#f43f5e',
  '#e11d48',
  '#be123c',
  '#9f1239',
  '#6b0b24',
]

const grape: MantineColorsTuple = [
  '#f5f3ff',
  '#ede9fe',
  '#ddd6fe',
  '#c4b5fd',
  '#a78bfa',
  '#8b5cf6',
  '#7c3aed',
  '#6d28d9',
  '#5b21b6',
  '#3f1484',
]

const teal: MantineColorsTuple = [
  '#f0fdfa',
  '#ccfbf1',
  '#99f6e4',
  '#5eead4',
  '#2dd4bf',
  '#14b8a6',
  '#0d9488',
  '#0f766e',
  '#115e59',
  '#134e4a',
]

/**
 * Custom variant color resolver:
 * Mantine's default light-variant formula in dark mode uses 15% opacity of shade 9,
 * which results in muddy dark-brown/maroon sludge on dark surfaces without borders.
 * We intercept `variant="light"` and route it to our calibrated semantic tokens
 * that guarantee luminous, high-contrast ink and a crisp hairline border.
 */
const variantColorResolver: VariantColorsResolver = (input) => {
  const defaultResolved = defaultVariantColorsResolver(input)
  if (input.variant === 'light') {
    const c = input.color || input.theme.primaryColor
    return {
      ...defaultResolved,
      background: `var(--badge-${c}-bg, var(--mantine-color-${c}-light))`,
      color: `var(--badge-${c}-text, var(--mantine-color-${c}-light-color))`,
      border: `1px solid var(--badge-${c}-border, var(--mantine-color-${c}-light-border, transparent))`,
    }
  }
  return defaultResolved
}

export const theme = createTheme({
  primaryColor: 'accent',
  primaryShade: { light: 6, dark: 4 },
  white: '#ffffff',
  colors: { accent, dark, green, orange, red, grape, teal },
  variantColorResolver,
  autoContrast: true,
  fontFamily: '-apple-system, "Segoe UI", sans-serif',
  fontFamilyMonospace: "'SF Mono', ui-monospace, Menlo, monospace",
  defaultRadius: 'sm',
  fontSizes: { xs: '11px', sm: '12px', md: '13px', lg: '16px', xl: '20px' },
  components: {
    Button: { defaultProps: { size: 'xs' } },
    TextInput: { defaultProps: { size: 'xs' } },
    NumberInput: { defaultProps: { size: 'xs' } },
    Select: { defaultProps: { size: 'xs' } },
    MultiSelect: { defaultProps: { size: 'xs' } },
    Alert: {
      defaultProps: { radius: 'sm' },
      styles: {
        root: {
          borderRadius: '6px',
          fontSize: '12px',
          padding: '8px 12px',
        },
        message: {
          fontSize: '12px',
          lineHeight: '1.45',
        },
      },
    },
    Badge: {
      styles: {
        root: {
          fontWeight: 600,
          letterSpacing: '0.35px',
        },
      },
    },
    Tooltip: {
      defaultProps: { multiline: true },
      styles: {
        tooltip: {
          maxWidth: 'min(440px, 60vw)',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          backgroundColor: 'var(--panel2)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          borderRadius: '4px',
          padding: '4px 8px',
        },
        arrow: {
          backgroundColor: 'var(--panel2)',
          border: '1px solid var(--border)',
        },
      },
    },
    TooltipFloating: {
      styles: {
        tooltip: {
          maxWidth: 'min(440px, 60vw)',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          backgroundColor: 'var(--panel2)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          borderRadius: '4px',
          padding: '4px 8px',
        },
        arrow: {
          backgroundColor: 'var(--panel2)',
          border: '1px solid var(--border)',
        },
      },
    },
  },
})

const darkTokens = {
  bg: '#090c10',
  panel: '#101319',
  panel2: '#181c24',
  elev: '#202631',
  border: '#252c38',
  borderSubtle: '#181c24',
  text: '#f3f6f9',
  text2: '#c7d1db',
  muted: '#8b98a5',
  accent: '#38bdf8',
  accentHi: '#7dd3fc',
  accentSoft: 'rgba(56,189,248,.12)',
  surfaceActive: 'rgba(56,189,248,.08)',
  green: '#34d399',
  orange: '#fbbf24',
  red: '#fb7185',
  grape: '#c4b5fd',
  teal: '#2dd4bf',
  indigo: '#818cf8',
  sevCritical: '#fb7185',
  sevHigh: '#fb7185',
  sevMedium: '#fbbf24',
  sevLow: '#8b98a5',
  warn: '#fbbf24',
  warnBg: 'rgba(251,191,36,.14)',
  warnRowBg: 'rgba(251,191,36,.14)',
  warnRowHover: 'rgba(251,191,36,.22)',
  warnBorder: '#fbbf24',
  diffOk: '#34d399',
  diffDisBg: 'rgba(251,113,133,.14)',
  diffDisBar: '#fb7185',

  // Calibrated semantic badge & alert tokens (dark mode)
  badgeRedBg: 'rgba(251,113,133,.14)',
  badgeRedText: '#fb7185',
  badgeRedBorder: 'rgba(251,113,133,.35)',
  badgeOrangeBg: 'rgba(251,191,36,.14)',
  badgeOrangeText: '#fbbf24',
  badgeOrangeBorder: 'rgba(251,191,36,.35)',
  badgeGreenBg: 'rgba(52,211,153,.14)',
  badgeGreenText: '#34d399',
  badgeGreenBorder: 'rgba(52,211,153,.35)',
  badgeGrapeBg: 'rgba(167,139,250,.14)',
  badgeGrapeText: '#c4b5fd',
  badgeGrapeBorder: 'rgba(167,139,250,.35)',
  badgeTealBg: 'rgba(45,212,191,.14)',
  badgeTealText: '#2dd4bf',
  badgeTealBorder: 'rgba(45,212,191,.35)',
  badgeAccentBg: 'rgba(56,189,248,.14)',
  badgeAccentText: '#38bdf8',
  badgeAccentBorder: 'rgba(56,189,248,.35)',
  badgeGrayBg: 'rgba(139,152,165,.14)',
  badgeGrayText: '#c7d1db',
  badgeGrayBorder: 'rgba(139,152,165,.30)',
} as const
type Tokens = Record<keyof typeof darkTokens, string>
const lightTokens: Tokens = {
  bg: '#f8fafc',
  panel: '#ffffff',
  panel2: '#f1f5f9',
  elev: '#ffffff',
  border: '#e2e8f0',
  borderSubtle: '#edf2f7',
  text: '#0f172a',
  text2: '#334155',
  muted: '#64748b',
  accent: '#0284c7',
  accentHi: '#036aa1',
  accentSoft: 'rgba(2,132,199,.10)',
  surfaceActive: '#e0f2fe',
  green: '#059669',
  orange: '#d97706',
  red: '#e11d48',
  grape: '#7c3aed',
  teal: '#0d9488',
  indigo: '#4f46e5',
  sevCritical: '#e11d48',
  sevHigh: '#e11d48',
  sevMedium: '#d97706',
  sevLow: '#64748b',
  warn: '#d97706',
  warnBg: 'rgba(217,119,6,.10)',
  warnRowBg: 'rgba(217,119,6,.10)',
  warnRowHover: 'rgba(217,119,6,.17)',
  warnBorder: '#d97706',
  diffOk: '#059669',
  diffDisBg: '#fff1f2',
  diffDisBar: '#e11d48',

  // Calibrated semantic badge & alert tokens (light mode)
  badgeRedBg: '#fff1f2',
  badgeRedText: '#be123c',
  badgeRedBorder: 'rgba(225,29,72,.28)',
  badgeOrangeBg: '#fffbeb',
  badgeOrangeText: '#b45309',
  badgeOrangeBorder: 'rgba(217,119,6,.28)',
  badgeGreenBg: '#ecfdf5',
  badgeGreenText: '#047857',
  badgeGreenBorder: 'rgba(5,150,105,.28)',
  badgeGrapeBg: '#f5f3ff',
  badgeGrapeText: '#6d28d9',
  badgeGrapeBorder: 'rgba(124,58,237,.28)',
  badgeTealBg: '#f0fdfa',
  badgeTealText: '#0f766e',
  badgeTealBorder: 'rgba(13,148,136,.28)',
  badgeAccentBg: '#f0f9ff',
  badgeAccentText: '#0284c7',
  badgeAccentBorder: 'rgba(2,132,199,.28)',
  badgeGrayBg: '#f1f5f9',
  badgeGrayText: '#334155',
  badgeGrayBorder: '#cbd5e1',
}
function vars(t: Tokens, scheme: 'light' | 'dark'): Record<string, string> {
  return {
    'color-scheme': scheme,
    '--bg': t.bg,
    '--panel': t.panel,
    '--panel2': t.panel2,
    '--elev': t.elev,
    '--border': t.border,
    '--border-subtle': t.borderSubtle,
    '--text': t.text,
    '--text2': t.text2,
    '--muted': t.muted,
    '--accent': t.accent,
    '--accent-hi': t.accentHi,
    '--accent-soft': t.accentSoft,
    '--surface-active': t.surfaceActive,
    '--green': t.green,
    '--orange': t.orange,
    '--red': t.red,
    '--grape': t.grape,
    '--teal': t.teal,
    '--indigo': t.indigo,
    '--sev-critical-text': t.sevCritical,
    '--sev-high-text': t.sevHigh,
    '--sev-medium-text': t.sevMedium,
    '--sev-low-text': t.sevLow,
    '--warn': t.warn,
    '--warn-bg': t.warnBg,
    '--warn-row-bg': t.warnRowBg,
    '--warn-row-hover': t.warnRowHover,
    '--warn-border': t.warnBorder,
    '--diff-ok': t.diffOk,
    '--diff-dis-bg': t.diffDisBg,
    '--diff-dis-bar': t.diffDisBar,

    // Badge & Alert semantic tokens
    '--badge-red-bg': t.badgeRedBg,
    '--badge-red-text': t.badgeRedText,
    '--badge-red-border': t.badgeRedBorder,
    '--badge-orange-bg': t.badgeOrangeBg,
    '--badge-orange-text': t.badgeOrangeText,
    '--badge-orange-border': t.badgeOrangeBorder,
    '--badge-green-bg': t.badgeGreenBg,
    '--badge-green-text': t.badgeGreenText,
    '--badge-green-border': t.badgeGreenBorder,
    '--badge-grape-bg': t.badgeGrapeBg,
    '--badge-grape-text': t.badgeGrapeText,
    '--badge-grape-border': t.badgeGrapeBorder,
    '--badge-teal-bg': t.badgeTealBg,
    '--badge-teal-text': t.badgeTealText,
    '--badge-teal-border': t.badgeTealBorder,
    '--badge-accent-bg': t.badgeAccentBg,
    '--badge-accent-text': t.badgeAccentText,
    '--badge-accent-border': t.badgeAccentBorder,
    '--badge-gray-bg': t.badgeGrayBg,
    '--badge-gray-text': t.badgeGrayText,
    '--badge-gray-border': t.badgeGrayBorder,

    // Override Mantine built-in light-color vars directly for all components:
    '--mantine-color-red-light': t.badgeRedBg,
    '--mantine-color-red-light-color': t.badgeRedText,
    '--mantine-color-red-light-border': t.badgeRedBorder,
    '--mantine-color-orange-light': t.badgeOrangeBg,
    '--mantine-color-orange-light-color': t.badgeOrangeText,
    '--mantine-color-orange-light-border': t.badgeOrangeBorder,
    '--mantine-color-green-light': t.badgeGreenBg,
    '--mantine-color-green-light-color': t.badgeGreenText,
    '--mantine-color-green-light-border': t.badgeGreenBorder,
    '--mantine-color-grape-light': t.badgeGrapeBg,
    '--mantine-color-grape-light-color': t.badgeGrapeText,
    '--mantine-color-grape-light-border': t.badgeGrapeBorder,
    '--mantine-color-teal-light': t.badgeTealBg,
    '--mantine-color-teal-light-color': t.badgeTealText,
    '--mantine-color-teal-light-border': t.badgeTealBorder,
    '--mantine-color-accent-light': t.badgeAccentBg,
    '--mantine-color-accent-light-color': t.badgeAccentText,
    '--mantine-color-accent-light-border': t.badgeAccentBorder,
    '--mantine-color-gray-light': t.badgeGrayBg,
    '--mantine-color-gray-light-color': t.badgeGrayText,
    '--mantine-color-gray-light-border': t.badgeGrayBorder,
  }
}
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--mono': "'SF Mono', ui-monospace, Menlo, monospace",
    '--fs-sm': '11px',
    '--fs-base': '13px',
    '--fs-lg': '16px',
    '--fs-xl': '20px',
  },
  light: vars(lightTokens, 'light'),
  dark: vars(darkTokens, 'dark'),
})
