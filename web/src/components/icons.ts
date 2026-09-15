import { IconX, IconAlertTriangle, IconRotateClockwise2, IconCheck, type IconProps } from '@tabler/icons-react'
import { createElement, type ComponentType, type FC } from 'react'

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
      className: props.className ? `${'align-middle'} ${props.className}` : 'align-middle',
    })
}

export const Close = inlineIcon(IconX)
export const Warning = inlineIcon(IconAlertTriangle)
// uint32 end_log_pos rolled over past 4 GiB - a circular "wrapped around"
// glyph, not a back/undo arrow.
export const WrapArrow = inlineIcon(IconRotateClockwise2)
export const Check = inlineIcon(IconCheck)
export const Cross = inlineIcon(IconX)

export type EventBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'outline'

/** Event-kind -> semantic Badge variant following strict green quarantine and data roles. */
export function kindToBadgeVariant(typeName: string): EventBadgeVariant {
  if (typeName.startsWith('WRITE_ROWS')) return 'success'
  if (typeName.startsWith('UPDATE_ROWS')) return 'warning'
  if (typeName.startsWith('DELETE_ROWS')) return 'error'
  if (typeName === 'QUERY' || typeName === 'CREATE' || typeName === 'ALTER') return 'info'
  if (typeName === 'DROP') return 'error'
  if (typeName === 'TRUNCATE') return 'warning'
  return 'outline'
}

/** Anomaly severity → standard Mantine color name. */
export function severityColor(sev: string): string {
  if (sev === 'critical' || sev === 'high') return 'red'
  if (sev === 'medium') return 'orange'
  return 'gray'
}
