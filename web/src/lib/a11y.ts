import type React from 'react'

/**
 * Returns props that make a non-button element keyboard-reachable and
 * activatable via Enter or Space, matching mouse-click behaviour.
 *
 * Usage:
 *   <div {...clickable(() => doSomething())}>…</div>
 */
export function clickable(onActivate: () => void): {
  role: string
  tabIndex: number
  onClick: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  style: React.CSSProperties
} {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
    style: { cursor: 'pointer' },
  }
}

/**
 * Returns props that make a <tr> keyboard-activatable WITHOUT adding
 * role="button", so native table row semantics (column headers, cell
 * navigation) are preserved for assistive technologies.
 *
 * Usage:
 *   <tr {...clickableRow(() => doSomething())}>…</tr>
 */
export function clickableRow(onActivate: () => void): {
  tabIndex: number
  onClick: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  style: React.CSSProperties
} {
  return {
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
    style: { cursor: 'pointer' },
  }
}
