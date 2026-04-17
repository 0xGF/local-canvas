/**
 * Shared easing curves for all overlay animations.
 *
 * Use `snappy` for micro-interactions (hover, badge updates).
 * Use `smooth` for panel/popover entrances.
 * Use `spring` configs for organic motion (selection morph, drag settle).
 * Use `decelerate` for exits (things leaving the screen).
 */

// CSS cubic-bezier strings (for inline style `transition`)
export const EASE = {
  /** Quick snap for hovers, toggles, badge updates. 60-120ms. */
  snappy: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** Smooth entrance for panels, popovers. 180-240ms. */
  smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** Gentle deceleration for exits. 120-180ms. */
  decelerate: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Bounce settle for drag-drop, selection snap. */
  bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

// Framer-motion spring presets
export const SPRING = {
  /** Tight spring for selection morphs, toolbar transitions. */
  snappy: { type: "spring" as const, stiffness: 500, damping: 35, mass: 0.8 },
  /** Bouncy spring for popovers, panels entering. */
  popover: { type: "spring" as const, stiffness: 400, damping: 28, mass: 0.8 },
  /** Gentle spring for large layout shifts. */
  gentle: { type: "spring" as const, stiffness: 300, damping: 30, mass: 1 },
} as const;

// Framer-motion tween presets
export const TWEEN = {
  /** Micro: badge updates, color shifts. */
  micro: { type: "tween" as const, duration: 0.08, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  /** Small: hover states, icon swaps. */
  small: { type: "tween" as const, duration: 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  /** Medium: panel sections, popover content. */
  medium: { type: "tween" as const, duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  /** Exit: things leaving the screen. */
  exit: { type: "tween" as const, duration: 0.12, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
} as const;

// Duration constants (ms) for inline CSS transitions
export const DURATION = {
  micro: 80,
  small: 150,
  medium: 200,
  large: 300,
} as const;
