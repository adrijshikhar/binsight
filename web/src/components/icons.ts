import { IconX, IconAlertTriangle, IconRotateClockwise2, IconCheck, type IconProps } from '@tabler/icons-react'
import { createElement, type ComponentType, type CSSProperties, type FC } from 'react'

import styles from './icons.module.css'

/**
 * Inline icon wrapper: tabler icons default to 24px (oversized next to this
 * app's 11-13px text). Wrap with a consistent 16px / 1.75-stroke default and
 * middle vertical alignment so icons sit centered inline with content. Any
 * prop (size, stroke, color, style) is overridable per call site. Defined with
 * createElement so this stays a .ts file (no rename -> no dev-server HMR churn).
 */
function inlineIcon(Inner: ComponentType<IconProps>): FC<IconProps> {
  return (props: IconProps) =>
    createElement(Inner, {
      size: 16,
      stroke: 1.75,
      ...props,
      className: props.className ? `${styles.inlineIcon} ${props.className}` : styles.inlineIcon,
    })
}

export const Close = inlineIcon(IconX)
export const Warning = inlineIcon(IconAlertTriangle)
// uint32 end_log_pos rolled over past 4 GiB - a circular "wrapped around"
// glyph, not a back/undo arrow.
export const WrapArrow = inlineIcon(IconRotateClockwise2)
export const Check = inlineIcon(IconCheck)
export const Cross = inlineIcon(IconX)

const KIND_CLASS: Record<string, string> = {
  WRITE_ROWS_V2: styles.green,
  WRITE_ROWS_V1: styles.green,
  UPDATE_ROWS_V2: styles.orange,
  UPDATE_ROWS_V1: styles.orange,
  DELETE_ROWS_V2: styles.red,
  DELETE_ROWS_V1: styles.red,
  QUERY: styles.grape,
  XID: styles.accent,
  TABLE_MAP: styles.indigo,
  default: styles.muted,
}

/** Event-kind -> theme color name. */
export function kindColor(typeName: string): string {
  if (typeName.startsWith('WRITE_ROWS_')) return 'green'
  if (typeName.startsWith('UPDATE_ROWS_')) return 'orange'
  if (typeName.startsWith('DELETE_ROWS_')) return 'red'
  if (typeName === 'QUERY') return 'grape'
  if (typeName === 'XID') return 'accent'
  if (typeName === 'TABLE_MAP') return 'teal'
  return 'gray'
}

/** Returns the scoped CSS Module class name for a given event kind badge. */
export function kindBadgeClassName(kind: string): string {
  const c = KIND_CLASS[kind] ?? KIND_CLASS.default
  return `${styles.badge} ${c}`
}

/** Event-kind -> palette CSS var. Mantine's `variant="light"` renders washed-out
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
  XID: '--brand',
  TABLE_MAP: '--indigo',
  default: '--muted-foreground',
}

/** Inline style for a kind badge (kept for backward compatibility). */
export function kindBadgeStyle(kind: string): CSSProperties {
  const v = KIND_VAR[kind] ?? KIND_VAR.default
  return {
    '--badge-bg': `color-mix(in srgb, var(${v}) 14%, transparent)`,
    '--badge-color': `var(${v})`,
    border: `1px solid color-mix(in srgb, var(${v}) 32%, transparent)`,
    fontFamily: 'var(--mono)',
  } as CSSProperties
}

/** Anomaly severity → standard Mantine color name. */
export function severityColor(sev: string): string {
  if (sev === 'critical' || sev === 'high') return 'red'
  if (sev === 'medium') return 'orange'
  return 'gray'
}
