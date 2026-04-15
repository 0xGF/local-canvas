/**
 * Shared breakpoint configuration — single source of truth.
 *
 * Matches Tailwind CSS v3 default breakpoints.
 * Both the Toolbar UI and PropertiesPanel import from here
 * so pixel values, labels, and prefix mappings never drift.
 */

export interface BreakpointDef {
  /** Human-readable label shown in UI */
  label: string;
  /** Pixel width (0 = full / unconstrained) */
  width: number;
  /** Tailwind responsive prefix (empty string = no prefix / base styles) */
  prefix: string;
}

/** Tailwind v3 default breakpoint widths keyed by prefix */
export const DEFAULT_BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

/** All recognized responsive prefixes (order matters — smallest first) */
export const RESPONSIVE_PREFIXES = ["sm", "md", "lg", "xl", "2xl"] as const;

/** Matches a leading `sm:` / `md:` / `lg:` / `xl:` / `2xl:` prefix on a Tailwind class. */
export const RESPONSIVE_PREFIX_RE = /^(sm|md|lg|xl|2xl):/;

/** True if `cls` already carries a responsive prefix. */
export function hasResponsivePrefix(cls: string): boolean {
  return RESPONSIVE_PREFIX_RE.test(cls);
}

/** Strip any leading responsive prefix from a class name. */
export function stripResponsivePrefix(cls: string): string {
  return cls.replace(RESPONSIVE_PREFIX_RE, "");
}

/** Preset list for the Toolbar breakpoint selector */
export const BREAKPOINT_PRESETS: BreakpointDef[] = [
  { label: "Mobile S", width: 320, prefix: "" },
  { label: "Mobile", width: 375, prefix: "" },
  { label: "SM", width: 640, prefix: "sm" },
  { label: "MD", width: 768, prefix: "md" },
  { label: "LG", width: 1024, prefix: "lg" },
  { label: "XL", width: 1280, prefix: "xl" },
  { label: "2XL", width: 1536, prefix: "2xl" },
];

/** Default breakpoint — largest preset */
export const DEFAULT_BREAKPOINT = 1536;

/**
 * Map a breakpoint pixel width → Tailwind responsive prefix.
 * Returns empty string when the width doesn't match any breakpoint
 * (i.e. edits should target base / unprefixed classes).
 */
export function getBreakpointPrefix(width: number | null): string {
  if (!width) return "";
  // Exact match first
  for (const [prefix, px] of Object.entries(DEFAULT_BREAKPOINTS)) {
    if (px === width) return prefix;
  }
  // Find the largest breakpoint that is <= the given width
  let best = "";
  let bestPx = 0;
  for (const [prefix, px] of Object.entries(DEFAULT_BREAKPOINTS)) {
    if (px <= width && px > bestPx) {
      best = prefix;
      bestPx = px;
    }
  }
  return best;
}

