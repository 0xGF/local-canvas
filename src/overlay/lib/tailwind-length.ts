// Shared px ↔ Tailwind class-suffix conversion for the sidebar's length
// inputs. The panel always shows values in px (or % for opacity-like fields),
// and when the user commits we prefer the named Tailwind class if it maps
// cleanly; otherwise we fall back to a bracket value like `[13px]`.
//
// Keeps the inputs honest: the number in the box matches what the element
// actually renders, regardless of whether the source uses `rounded-lg`,
// `rounded-[8px]`, or `rounded-md`.

// Border-radius — Tailwind's named scale. Values taken from the v3 default
// theme. `""` is the empty suffix used by the bare `rounded` class (4px).
const RADIUS_SCALE_PX: Record<string, number> = {
  none: 0,
  sm: 2,
  "": 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  "3xl": 24,
  full: 9999,
};

// Spacing scale — 1 unit = 0.25rem = 4px. Includes the irregular entries
// (`0.5`, `1.5`, `2.5`, `3.5`) and the `px` keyword (1px).
const SPACING_KEYWORD_PX: Record<string, number> = {
  px: 1,
  "0": 0,
  "0.5": 2,
  "1.5": 6,
  "2.5": 10,
  "3.5": 14,
};

/**
 * Decode a Tailwind suffix into a px number. `suffix` is what
 * `useClassHelpers().get(prefix)` returns — i.e. the part after the prefix,
 * or "" when the class is the bare prefix (e.g. `rounded` → suffix "").
 *
 * Returns null when the suffix doesn't name a known scale and doesn't parse
 * as a bracket value — the caller can fall back to the computed CSS value.
 */
export function radiusSuffixToPx(suffix: string): number | null {
  if (suffix in RADIUS_SCALE_PX) return RADIUS_SCALE_PX[suffix];
  const bracket = suffix.match(/^\[(\d+(?:\.\d+)?)(?:px)?\]$/);
  if (bracket) return parseFloat(bracket[1]);
  return null;
}

/**
 * Encode a px value as a Tailwind suffix. Uses the named scale when the px
 * value lines up exactly, otherwise emits a bracket value. Returns "none"
 * (not "") for 0 so the class writer reliably clears prior radius instead
 * of leaving bare `rounded` in place.
 */
export function pxToRadiusSuffix(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return "none";
  for (const [suffix, scalePx] of Object.entries(RADIUS_SCALE_PX)) {
    if (scalePx === px) return suffix;
  }
  return `[${Math.round(px)}px]`;
}

/**
 * Decode a spacing-scale suffix (p, m, gap, top/right/bottom/left, w, h, …)
 * into px. Handles bracket values, numeric scale (N → N*4px), and the
 * irregular keyword entries (`px`, `0.5`, etc). Sizing-only keywords like
 * `auto`/`full`/`screen` are not numeric and return null.
 */
export function spacingSuffixToPx(suffix: string): number | null {
  if (!suffix) return null;
  if (suffix in SPACING_KEYWORD_PX) return SPACING_KEYWORD_PX[suffix];
  const bracket = suffix.match(/^\[(-?\d+(?:\.\d+)?)(?:px)?\]$/);
  if (bracket) return parseFloat(bracket[1]);
  const n = Number(suffix);
  if (Number.isFinite(n)) return n * 4;
  return null;
}

/**
 * Encode a px value as a spacing suffix. Falls back to a bracket value when
 * the px doesn't land on a multiple-of-4 or one of the irregular scale steps.
 * Negative values are supported (margin can be negative); the caller still
 * owes the leading `-` on the class name.
 */
export function pxToSpacingSuffix(px: number): string {
  if (!Number.isFinite(px)) return "[0px]";
  if (px === 0) return "0";
  if (px === 1) return "px";
  const abs = Math.abs(px);
  for (const [suffix, scalePx] of Object.entries(SPACING_KEYWORD_PX)) {
    if (scalePx === abs && suffix !== "0") return suffix;
  }
  if (abs % 4 === 0) {
    const step = abs / 4;
    return String(step);
  }
  return `[${Math.round(px)}px]`;
}
