/**
 * Shared framer-motion variants for overlay components.
 * Import from here instead of writing inline configs.
 */

import { SPRING, TWEEN } from "./easings.js";

// Check user preference once at load time
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Wrap a transition — if reduced motion, use instant tween. */
function rm<T>(transition: T): T {
  if (!prefersReducedMotion) return transition;
  return { type: "tween", duration: 0 } as T;
}

/** Toolbar bar sliding up from bottom. */
export const toolbarSlideUp = {
  initial: { y: 60, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: rm(SPRING.snappy),
};

/** Popover growing out of an anchor point. */
export const popoverEmerge = {
  initial: { opacity: 0, y: 6, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.96 },
  transition: rm(SPRING.popover),
};

/** Context menu / dropdown appearing. */
export const menuAppear = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: rm(TWEEN.medium),
};

/** Panel section expanding/collapsing. */
export const sectionExpand = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: rm(TWEEN.medium),
};

/** Fade in/out for overlays, backdrops. */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: rm(TWEEN.small),
};

/** Toast notification appearing and fading. */
export const toastAppear = {
  initial: { opacity: 0, y: 8, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.95 },
  transition: rm(TWEEN.medium),
};
