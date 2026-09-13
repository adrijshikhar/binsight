import {
  createTheme,
  type MantineColorsTuple,
  type CSSVariablesResolver,
  defaultVariantColorsResolver,
  type VariantColorsResolver,
} from '@mantine/core'

// Spring Mint (derived from #87d68d & #bcebcb) - accent / interaction.
// primaryShade picks 4 in dark (#87d68d, luminous), 6 in light (#2f8e3a, high contrast).
const accent: MantineColorsTuple = [
  '#f0fbf2',
  '#daf5df',
  '#bcebcb',
  '#9ee1aa',
  '#87d68d',
  '#5ec468',
  '#2f8e3a',
  '#24732e',
  '#1a5722',
  '#103b16',
]

// Cool Slate Neutral surface ladder (derived from #8491a3).
// index: 0 text ... 5 border, 6 panel2, 7 panel, 8 bg, 9 deepest.
const dark: MantineColorsTuple = [
  '#f3f6f9',
  '#c7d1db',
  '#9aa7b5',
  '#8491a3',
  '#4f5c6d',
  '#2e3a49',
  '#1d2633',
  '#141c26',
  '#0d131c',
  '#080c12',
]

// Herb Sage scale (derived from #93b48b) - muted indicators and secondary bounds.
const sage: MantineColorsTuple = [
  '#f4f8f3',
  '#e5eee3',
  '#ccdec9',
  '#b0cdab',
  '#93b48b',
  '#74966c',
  '#55774d',
  '#3e5937',
  '#293d24',
  '#162312',
]

// Green scale - aligned with Spring Mint accent for data additions and success states.
const green: MantineColorsTuple = [
  '#f0fbf2',
  '#daf5df',
  '#bcebcb',
  '#9ee1aa',
  '#87d68d',
  '#5ec468',
  '#2f8e3a',
  '#24732e',
  '#1a5722',
  '#103b16',
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
  colors: { accent, dark, green, orange, red, grape, teal, sage },
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
  bg: '#0d131c',
  panel: '#141c26',
  panel2: '#1d2633',
  elev: '#242f3e',
  border: '#2e3a49',
  borderSubtle: '#1d2633',
  text: '#f3f6f9',
  text2: '#c7d1db',
  muted: '#8491a3',
  accent: '#87d68d',
  accentHi: '#bcebcb',
  accentSoft: 'rgba(135,214,141,.12)',
  surfaceActive: 'rgba(135,214,141,.08)',
  green: '#87d68d',
  orange: '#fbbf24',
  red: '#fb7185',
  grape: '#c4b5fd',
  teal: '#5eead4',
  indigo: '#a5b4fc',
  sevCritical: '#fb7185',
  sevHigh: '#fb7185',
  sevMedium: '#fbbf24',
  sevLow: '#8491a3',
  warn: '#fbbf24',
  warnBg: 'rgba(251,191,36,.14)',
  warnRowBg: 'rgba(251,191,36,.14)',
  warnRowHover: 'rgba(251,191,36,.22)',
  warnBorder: '#fbbf24',
  diffOk: '#87d68d',
  diffDisBg: 'rgba(251,113,133,.14)',
  diffDisBar: '#fb7185',

  // Calibrated semantic badge & alert tokens (dark mode)
  badgeRedBg: 'rgba(251,113,133,.14)',
  badgeRedText: '#fb7185',
  badgeRedBorder: 'rgba(251,113,133,.35)',
  badgeOrangeBg: 'rgba(251,191,36,.14)',
  badgeOrangeText: '#fbbf24',
  badgeOrangeBorder: 'rgba(251,191,36,.35)',
  badgeGreenBg: 'rgba(135,214,141,.14)',
  badgeGreenText: '#87d68d',
  badgeGreenBorder: 'rgba(135,214,141,.35)',
  badgeGrapeBg: 'rgba(167,139,250,.14)',
  badgeGrapeText: '#c4b5fd',
  badgeGrapeBorder: 'rgba(167,139,250,.35)',
  badgeTealBg: 'rgba(94,234,212,.14)',
  badgeTealText: '#5eead4',
  badgeTealBorder: 'rgba(94,234,212,.35)',
  badgeAccentBg: 'rgba(135,214,141,.14)',
  badgeAccentText: '#87d68d',
  badgeAccentBorder: 'rgba(135,214,141,.35)',
  badgeGrayBg: 'rgba(132,145,163,.14)',
  badgeGrayText: '#c7d1db',
  badgeGrayBorder: 'rgba(132,145,163,.30)',
} as const
type Tokens = Record<keyof typeof darkTokens, string>
const lightTokens: Tokens = {
  bg: '#f7fff6',
  panel: '#ffffff',
  panel2: '#eef5ee',
  elev: '#ffffff',
  border: '#bcebcb',
  borderSubtle: '#d8eadb',
  text: '#121a15',
  text2: '#34453a',
  muted: '#5c7063',
  accent: '#2f8e3a',
  accentHi: '#24732e',
  accentSoft: 'rgba(47,142,58,.10)',
  surfaceActive: '#daf5df',
  green: '#2f8e3a',
  orange: '#d97706',
  red: '#e11d48',
  grape: '#7c3aed',
  teal: '#0d9488',
  indigo: '#4f46e5',
  sevCritical: '#e11d48',
  sevHigh: '#e11d48',
  sevMedium: '#d97706',
  sevLow: '#5c7063',
  warn: '#d97706',
  warnBg: 'rgba(217,119,6,.10)',
  warnRowBg: 'rgba(217,119,6,.10)',
  warnRowHover: 'rgba(217,119,6,.17)',
  warnBorder: '#d97706',
  diffOk: '#2f8e3a',
  diffDisBg: '#fff1f2',
  diffDisBar: '#e11d48',

  // Calibrated semantic badge & alert tokens (light mode)
  badgeRedBg: '#fff1f2',
  badgeRedText: '#be123c',
  badgeRedBorder: 'rgba(225,29,72,.28)',
  badgeOrangeBg: '#fffbeb',
  badgeOrangeText: '#b45309',
  badgeOrangeBorder: 'rgba(217,119,6,.28)',
  badgeGreenBg: '#daf5df',
  badgeGreenText: '#1a5722',
  badgeGreenBorder: 'rgba(47,142,58,.28)',
  badgeGrapeBg: '#f5f3ff',
  badgeGrapeText: '#6d28d9',
  badgeGrapeBorder: 'rgba(124,58,237,.28)',
  badgeTealBg: '#f0fdfa',
  badgeTealText: '#0f766e',
  badgeTealBorder: 'rgba(13,148,136,.28)',
  badgeAccentBg: '#daf5df',
  badgeAccentText: '#1a5722',
  badgeAccentBorder: 'rgba(47,142,58,.28)',
  badgeGrayBg: '#edf1f5',
  badgeGrayText: '#3a4655',
  badgeGrayBorder: '#bcebcb',
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
