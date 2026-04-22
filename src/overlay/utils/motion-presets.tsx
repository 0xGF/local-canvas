/**
 * Lightweight CSS-based transitions (zero framer-motion).
 *
 * Design tools get smooth motion with plain
 * `transition` + `@keyframes`. Framer-motion is ~42KB gzipped; for our
 * overlay use-cases (fade-in popovers, expand/collapse, slide-up toolbar)
 * it's pure overhead.
 *
 * All these exports are React components or CSS strings — no runtime
 * measurement, no layout prop, no AnimatePresence ordering games.
 */

import React, { useEffect, useState } from "react";

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Shared easings — match what we already use elsewhere.
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";       // soft decelerate
const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // bouncy overshoot

/**
 * Mounts children when `open` becomes true, fades + scales them in with a
 * CSS transition, then after the exit transition completes unmounts them.
 *
 * Replaces `<AnimatePresence><motion.div popoverEmerge ../></AnimatePresence>`.
 */
export function PopFade({
  open,
  duration = 180,
  bouncy = true,
  children,
  style,
  ...rest
}: {
  open: boolean;
  /** Transition duration in ms. Enter uses this; exit uses 70% of it. */
  duration?: number;
  /** Use overshoot easing on enter. Default true . */
  bouncy?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "children">) {
  // Two-stage state: `mounted` controls DOM presence, `active` flips to
  // animate to the open state after mount. On close: flip active off,
  // wait for transition, then unmount.
  const [mounted, setMounted] = useState(open);
  const [active, setActive] = useState(false);
  const exitMs = Math.round(duration * 0.7);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame so browser registers the initial (active=false) state
      // before we flip to active=true and trigger the transition.
      const id = requestAnimationFrame(() => setActive(true));
      return () => cancelAnimationFrame(id);
    }
    setActive(false);
    const id = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(id);
  }, [open, exitMs]);

  if (!mounted) return null;

  const reduce = prefersReducedMotion;
  return (
    <div
      {...rest}
      style={{
        ...style,
        opacity: active ? 1 : 0,
        transform: `${style?.transform ?? ""} ${active ? "scale(1) translateY(0)" : "scale(0.96) translateY(4px)"}`.trim(),
        transformOrigin: "center bottom",
        pointerEvents: active ? "auto" : "none",
        transition: reduce
          ? "none"
          : `opacity ${active ? duration : exitMs}ms ease, transform ${active ? duration : exitMs}ms ${bouncy && active ? EASE_SPRING : EASE_OUT}`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Vertical equivalent — `grid-template-rows: 0fr → 1fr` animation for
 * expand/collapse of accordion sections.
 */
export function ExpandY({
  open,
  children,
  duration = 280,
  style,
}: {
  open: boolean;
  children: React.ReactNode;
  duration?: number;
  style?: React.CSSProperties;
}) {
  const reduce = prefersReducedMotion;
  return (
    <div
      aria-hidden={!open}
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: reduce
          ? "none"
          : `grid-template-rows ${duration}ms ${EASE_OUT}, opacity ${Math.round(duration * 0.7)}ms ease`,
        ...style,
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}

/**
 * Toolbar-style slide-up entrance: starts 60px below + invisible, animates
 * to rest position. Use on the outer toolbar root.
 *
 * Returns the style props to spread onto a regular `<div>`; no framer.
 */
export function useSlideUp(key?: unknown) {
  const reduce = prefersReducedMotion;
  const [active, setActive] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, [key]);
  return {
    transform: active ? "translateY(0)" : "translateY(60px)",
    opacity: active ? 1 : 0,
    transition: reduce ? "none" : `transform 360ms ${EASE_OUT}, opacity 240ms ease`,
    willChange: "transform, opacity",
  } as React.CSSProperties;
}
