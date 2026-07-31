import { IconX, IconAlertTriangle, IconRotateClockwise2, IconCheck, type IconProps } from '@tabler/icons-react'
import { createElement, type ComponentType, type CSSProperties, type FC } from 'react'

/**
 * Inline icon wrapper: tabler icons default to 24px (oversized next to this
 * app's 11–13px text). Wrap with a consistent 16px / 1.75-stroke default and
 * middle vertical alignment so icons sit centered inline with content. Any
 * prop (size, stroke, color, style) is overridable per call site. Defined with
 * createElement so this stays a .ts file (no rename → no dev-server HMR churn).
 */
function inlineIcon(Inner: ComponentType<IconProps>): FC<IconProps> {
  return (props: IconProps) =>
    createElement(Inner, {
      size: 16,
      stroke: 1.75,
      ...props,
      style: { verticalAlign: 'middle', ...props.style },
    })
}

export const Close = inlineIcon(IconX)
export const Warning = inlineIcon(IconAlertTriangle)
// uint32 end_log_pos rolled over past 4 GiB — a circular "wrapped around"
// glyph, not a back/undo arrow.
export const WrapArrow = inlineIcon(IconRotateClockwise2)
export const Check = inlineIcon(IconCheck)
export const Cross = inlineIcon(IconX)

/** Event-kind → palette CSS var. Mantine's `variant="light"` renders washed-out
 *  in dark mode (~10% fill + a muted `-light-color` text). We drive the badge
 *  off our own tokens instead so the hue reads clearly in both schemes. */
const KIND_VAR: Record<string, string> = {
  WRITE_ROWS_V2: '--green',
  WRITE_ROWS_V1: '--green',
  UPDATE_ROWS_V2: '--orange',
  UPDATE_ROWS_V1: '--orange',
  DELETE_ROWS_V2: '--red',
  DELETE_ROWS_V1: '--red',
  QUERY: '--grape',
  XID: '--accent',
  // Indigo, not teal: teal sits right next to WRITE's green and the two were
  // near-indistinguishable. Indigo (between sky & violet) is clearly outside
  // the green data-change family. See web/src/theme.ts `--indigo`.
  TABLE_MAP: '--indigo',
  default: '--muted',
}

/** Inline style for a kind badge, overriding Mantine Badge's internal
 *  `--badge-*` vars. Pair with `variant="light"`. Goal: hue is distinct but
 *  quiet — a faint tinted fill and text dimmed toward the background, no loud
 *  border. Bright-on-dark full-chroma text reads as "glowing" and crowds
 *  adjacent rows; this keeps categories scannable at low cognitive load. */
export function kindBadgeStyle(kind: string): CSSProperties {
  const v = KIND_VAR[kind] ?? KIND_VAR.default
  return {
    '--badge-bg': `color-mix(in srgb, var(${v}) 14%, transparent)`,
    '--badge-color': `var(${v})`,
    border: 'none',
    fontFamily: 'var(--mono)',
  } as CSSProperties
}

/** Anomaly severity → standard Mantine color name. */
export function severityColor(sev: string): string {
  if (sev === 'critical' || sev === 'high') return 'red'
  if (sev === 'medium') return 'orange'
  return 'gray'
}
