/**
 * Overlay theme tokens. Every surface (toolbar, popover, pin disc, status
 * chip, etc.) reads from this — do not hardcode hex values in components.
 * When adjusting a hue, change it here and the whole overlay moves with it.
 *
 * Naming convention:
 *   <role>          base colour
 *   <role>Hover     slightly darker shade for hover/active states
 *   <role>Soft      translucent tint used for chip backgrounds
 */
export const THEME = {
  // ── Surfaces ───────────────────────────────────────────────────────────
  bg: "#1e1e1e",
  bgAlt: "#2c2c2c",
  bgHover: "#363636",

  // ── Text ──────────────────────────────────────────────────────────────
  fg: "#e0e0e0",
  fgDim: "#8c8c8c",
  fgMuted: "#5c5c5c",

  // ── Lines ─────────────────────────────────────────────────────────────
  border: "#3a3a3a",
  borderLight: "#2f2f2f",

  // ── Status palette (pins + history rows + popover chips) ──────────────
  // Tuned down from raw primaries so the discs read editorial, not neon.
  // `Hover` is the darker tone for hover/press; `Soft` is the translucent
  // chip-background tone.
  accent: "#3b82f6",              // "in progress" / primary action
  accentHover: "#2563eb",
  accentSoft: "rgba(59,130,246,0.18)",

  success: "#10b981",             // "resolved"
  successHover: "#0e9c6e",
  successSoft: "rgba(16,185,129,0.16)",

  warning: "#e0a800",             // "pending" / attention
  warningHover: "#b88900",
  warningSoft: "rgba(224,168,0,0.18)",

  danger: "#f24822",              // destructive actions
  dangerHover: "#d63a18",
  dangerSoft: "rgba(242,72,34,0.12)",

  attention: "#FE7338",           // "needs input" / agent is waiting for the user
  attentionHover: "#e5611e",
  attentionSoft: "rgba(254,115,56,0.16)",

  // "Dismissed" reads as muted grey — borrows from the text scale so the
  // token isn't duplicated. `neutralSoft` is its matching chip tint.
  neutral: "#6b7280",
  neutralHover: "#565c66",
  neutralSoft: "rgba(255,255,255,0.05)",

  // ── Canvas-only palette (drawn by paint-frame.ts / draw-helpers.ts) ──
  // The rest of the canvas palette — selection blue, padding green, annotate
  // yellow — reuses `accent` / `success` / `warning` directly (no duplicate
  // tokens). Margin + layer have no status equivalent so they live here:
  canvasMargin: "#FE7338",        // margin badges + zones (orange)
  canvasLayer: "#a855f7",         // layers / breakpoint / component indicator (purple)
  canvasLayerSoft: "rgba(168,85,247,0.15)",

  // ── Typography ────────────────────────────────────────────────────────
  mono: "'SF Mono','Fira Code','Fira Mono',monospace",
  font: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
} as const;

/** Convert a `#rrggbb` hex string from THEME into an `rgba(r,g,b,a)` string
 *  at the given alpha. Used where a colour needs a custom transparency that
 *  doesn't have its own token (e.g. CSS keyframes that interpolate from 0
 *  to 0.5 alpha on the same hue). Accepts `#rgb` shorthand too. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
