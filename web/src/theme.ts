import {
  createTheme,
  type MantineColorsTuple,
  type CSSVariablesResolver,
  defaultVariantColorsResolver,
  type VariantColorsResolver,
} from '@mantine/core'

// Trove Signature Blue - confident, crisp developer-tool primary interactive accent.
// primaryShade picks 5 in dark (#0075de), 6 in light (#0062bd, contrast-calibrated against light surfaces).
const accent: MantineColorsTuple = [
  '#eef6ff',
  '#d8ebff',
  '#b9dcff',
  '#84c3ff',
  '#4da4ff',
  '#0075de',
  '#0062bd',
  '#00509e',
  '#004080',
  '#002f61',
]

// Linear canonical dark surface ladder (from DESIGN.md).
// index: 0 text (#f7f8f8), 1 text-muted (#d0d6e0), 2 text-subtle (#8a8f98), 3 text-tertiary (#62666d),
// 4 hairline-strong (#34343a), 5 hairline (#23252a), 6 surface-3 (#18191a), 7 surface-2 (#141516),
// 8 surface-1 (#0f1011), 9 canvas (#010102).
const dark: MantineColorsTuple = [
  '#f7f8f8',
  '#d0d6e0',
  '#8a8f98',
  '#62666d',
  '#34343a',
  '#23252a',
  '#18191a',
  '#141516',
  '#0f1011',
  '#010102',
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
  primaryShade: { light: 6, dark: 5 },
  white: '#ffffff',
  colors: { accent, dark, green, orange, red, grape, teal },
  variantColorResolver,
  autoContrast: true,
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace",
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  defaultRadius: 'sm',
  fontSizes: { xs: '11px', sm: '12px', md: '13px', lg: '16px', xl: '20px' },
  components: {
    Button: { defaultProps: { size: 'xs', radius: 'sm' } },
    Card: { defaultProps: { radius: 'sm' } },
    Paper: { defaultProps: { radius: 'sm' } },
    SegmentedControl: { defaultProps: { radius: 'pill' } },
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
      defaultProps: { radius: 'sm' },
      styles: {
        root: {
          fontWeight: 500,
          letterSpacing: '0.02em',
          fontFamily: 'var(--mono)',
          borderRadius: '6px',
        },
      },
    },
    Pill: {
      defaultProps: { radius: 'sm' },
      styles: {
        root: {
          borderRadius: '6px',
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          cursor: 'pointer',
          borderRadius: '0',
          transition: 'background 120ms ease',
        },
        label: {
          color: 'var(--text)',
          fontWeight: 500,
        },
        description: {
          color: 'var(--muted-foreground)',
        },
      },
    },
    Switch: {
      defaultProps: {
        withThumbIndicator: false,
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
  bg: '#010102',
  panel: '#0f1011',
  panel2: '#141516',
  elev: '#18191a',
  surface4: '#191a1b',
  border: '#23252a',
  borderStrong: '#34343a',
  borderSubtle: '#18191a',
  text: '#f7f8f8',
  text2: '#d0d6e0',
  muted: '#8a8f98',
  accent: '#0075de',
  accentHi: '#388bfd',
  accentFocus: '#0075de',
  accentSoft: 'rgba(0,117,222,.16)',
  surfaceActive: 'rgba(0,117,222,.10)',
  green: '#34d399',
  orange: '#fbbf24',
  red: '#fb7185',
  grape: '#c4b5fd',
  teal: '#2dd4bf',
  indigo: '#818cf8',
  sevCritical: '#fb7185',
  sevHigh: '#fb7185',
  sevMedium: '#fbbf24',
  sevLow: '#8a8f98',
  warn: '#fbbf24',
  warnBg: 'rgba(251,191,36,.14)',
  warnRowBg: 'rgba(251,191,36,.14)',
  warnRowHover: 'rgba(251,191,36,.22)',
  warnBorder: '#fbbf24',
  diffOk: '#34d399',
  diffDisBg: 'rgba(251,113,133,.14)',
  diffDisBar: '#fb7185',

  // Calibrated semantic badge & alert tokens (dark mode) - clean subtle hairlines, zero neon
  badgeRedBg: 'rgba(251,113,133,.14)',
  badgeRedText: '#fb7185',
  badgeRedBorder: 'rgba(251,113,133,.20)',
  badgeOrangeBg: 'rgba(251,191,36,.14)',
  badgeOrangeText: '#fbbf24',
  badgeOrangeBorder: 'rgba(251,191,36,.20)',
  badgeGreenBg: 'rgba(52,211,153,.14)',
  badgeGreenText: '#34d399',
  badgeGreenBorder: 'rgba(52,211,153,.20)',
  badgeGrapeBg: 'rgba(167,139,250,.14)',
  badgeGrapeText: '#c4b5fd',
  badgeGrapeBorder: 'rgba(167,139,250,.20)',
  badgeTealBg: 'rgba(45,212,191,.14)',
  badgeTealText: '#2dd4bf',
  badgeTealBorder: 'rgba(45,212,191,.20)',
  badgeAccentBg: 'rgba(0,117,222,.16)',
  badgeAccentText: '#4da4ff',
  badgeAccentBorder: 'var(--border)',
  badgeGrayBg: 'rgba(138,143,152,.14)',
  badgeGrayText: '#d0d6e0',
  badgeGrayBorder: 'var(--border)',
} as const
type Tokens = Record<keyof typeof darkTokens, string>
const lightTokens: Tokens = {
  bg: '#ffffff',
  panel: '#f5f6f6',
  panel2: '#f6f7f7',
  elev: '#ffffff',
  surface4: '#f1f3f5',
  border: '#e1e4ea',
  borderStrong: '#ced4da',
  borderSubtle: '#edf0f4',
  text: '#000000',
  text2: '#2c313a',
  muted: '#62666d',
  accent: '#0075de',
  accentHi: '#005bab',
  accentFocus: '#0075de',
  accentSoft: 'rgba(0,117,222,.10)',
  surfaceActive: 'rgba(0,117,222,.08)',
  green: '#059669',
  orange: '#d97706',
  red: '#e11d48',
  grape: '#7c3aed',
  teal: '#0d9488',
  indigo: '#4f46e5',
  sevCritical: '#e11d48',
  sevHigh: '#e11d48',
  sevMedium: '#d97706',
  sevLow: '#62666d',
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
  badgeRedBorder: 'rgba(225,29,72,.20)',
  badgeOrangeBg: '#fffbeb',
  badgeOrangeText: '#b45309',
  badgeOrangeBorder: 'rgba(217,119,6,.20)',
  badgeGreenBg: '#ecfdf5',
  badgeGreenText: '#047857',
  badgeGreenBorder: 'rgba(5,150,105,.20)',
  badgeGrapeBg: '#f5f3ff',
  badgeGrapeText: '#6d28d9',
  badgeGrapeBorder: 'rgba(124,58,237,.20)',
  badgeTealBg: '#f0fdfa',
  badgeTealText: '#0f766e',
  badgeTealBorder: 'rgba(13,148,136,.20)',
  badgeAccentBg: '#eef6ff',
  badgeAccentText: '#005bab',
  badgeAccentBorder: 'rgba(0,117,222,.20)',
  badgeGrayBg: '#f1f3f5',
  badgeGrayText: '#2c313a',
  badgeGrayBorder: '#ced4da',
}
function vars(t: Tokens, scheme: 'light' | 'dark'): Record<string, string> {
  return {
    'color-scheme': scheme,
    '--bg': t.bg,
    '--panel': t.panel,
    '--panel2': t.panel2,
    '--elev': t.elev,
    '--surface-4': t.surface4,
    '--border': t.border,
    '--border-strong': t.borderStrong,
    '--border-subtle': t.borderSubtle,
    '--text': t.text,
    '--text2': t.text2,
    '--muted-foreground': t.muted,
    '--brand': t.accent,
    '--accent-hi': t.accentHi,
    '--accent-focus': t.accentFocus,
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
    '--mono': "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace",
    '--fs-sm': '11px',
    '--fs-base': '13px',
    '--fs-lg': '16px',
    '--fs-xl': '20px',
    '--radius-pill': '9999px',
  },
  light: vars(lightTokens, 'light'),
  dark: vars(darkTokens, 'dark'),
})
