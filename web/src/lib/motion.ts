import { animate } from 'animejs'

/**
 * Snappy, premium transition for tab switches and view transitions.
 * Runs in 140ms with outQuad easing for a crisp developer-tool feel.
 * Respects prefers-reduced-motion for accessibility.
 */
export function animateViewTransition(target: HTMLElement | null) {
  if (!target) return
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

  animate(target, {
    opacity: [0.65, 1],
    translateY: [4, 0],
    duration: 140,
    ease: 'outQuad',
  })
}

/**
 * Snappy tap feedback for navigation buttons and pills.
 */
export function animateTap(target: HTMLElement | null) {
  if (!target) return
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

  animate(target, {
    scale: [0.97, 1],
    duration: 120,
    ease: 'outQuad',
  })
}
