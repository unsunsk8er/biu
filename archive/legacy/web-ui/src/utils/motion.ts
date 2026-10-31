/**
 * Shared motion language. Keep UI transitions short and on the compositor:
 * opacity/transform only, with a single decelerating ease so pages, sheets and
 * rows feel like one app rather than a collection of different springs.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const MOTION_FAST = 0.12
export const MOTION_BASE = 0.18
export const MOTION_SLOW = 0.24

export const springSnappy = {
  type: 'spring',
  stiffness: 480,
  damping: 40,
  mass: 0.66,
} as const

export const springPanel = {
  type: 'spring',
  stiffness: 440,
  damping: 38,
  mass: 0.76,
} as const

/** Dialogs and sheets: short tween, never scale the whole layer. */
export const panelTransition = {
  duration: MOTION_FAST,
  ease: EASE_OUT,
} as const

export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: MOTION_BASE, ease: EASE_OUT },
} as const
