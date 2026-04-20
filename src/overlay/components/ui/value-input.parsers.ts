/**
 * Parser / formatter strategies for ValueInput.
 *
 * parse(raw)      : user-typed text → Tailwind value (bare token like "full"
 *                   or bracket value like "[27px]" or "").
 * format(stored)  : Tailwind value → user-facing text (reverse direction).
 *
 * Each strategy takes the preset list so exact matches short-circuit to the
 * bare Tailwind token and round-trip cleanly through the input.
 */

export interface Preset {
  value: string;
  label?: string;
}

export interface ValueStrategy {
  parse: (raw: string, presets: Preset[]) => string;
  format: (value: string, presets: Preset[]) => string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const CSS_LENGTH_UNITS = /(px|rem|em|%|vh|vw|vmin|vmax|lh|ch|ex|pt|cm|mm|in|pc|svh|svw|dvh|dvw|lvh|lvw)$/i;
const NUMBER_WITH_UNIT = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|lh|ch|ex|pt|cm|mm|in|pc|svh|svw|dvh|dvw|lvh|lvw|fr|deg|rad|turn|s|ms)$/i;
const PURE_NUMBER = /^-?\d*\.?\d+$/;
const ALREADY_BRACKETED = /^\[.+\]$/;

function normalizeRaw(raw: string): string {
  return raw.trim();
}

function toBracket(inner: string): string {
  // Tailwind JIT requires spaces inside brackets to be underscores.
  return `[${inner.replace(/\s+/g, "_")}]`;
}

function unbracket(value: string): string {
  const m = value.match(/^\[(.+)\]$/);
  return m ? m[1].replace(/_/g, " ") : value;
}

function matchPreset(presets: Preset[], raw: string): Preset | undefined {
  const r = raw.toLowerCase();
  return presets.find(p =>
    p.value.toLowerCase() === r ||
    (p.label ?? "").toLowerCase() === r
  );
}

// ── Strategies ───────────────────────────────────────────────────────────

/**
 * LENGTH: for top/right/bottom/left/W/H/padding/margin/radius.
 * - bare number       → [Npx]
 * - number+unit       → [Nunit]
 * - negative          → [-Npx] or [-Nunit]
 * - preset match      → preset.value (e.g. "full", "1/2", "auto", "")
 * - calc/var/complex  → bracket with spaces→_
 */
export const LENGTH: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    if (PURE_NUMBER.test(r)) return toBracket(`${r}px`);
    if (NUMBER_WITH_UNIT.test(r)) return toBracket(r);
    // calc(), min(), max(), clamp(), var(), etc. — anything non-numeric
    return toBracket(r);
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    return unbracket(value);
  },
};

/**
 * INTEGER: for z-index, grid-cols, flex-grow.
 * - bare integer      → [N]      (Tailwind JIT accepts z-[999])
 * - preset match      → preset.value
 * - anything else     → [raw]    (lets caller escape to arbitrary)
 */
export const INTEGER: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    if (/^-?\d+$/.test(r)) return toBracket(r);
    return toBracket(r);
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    return unbracket(value);
  },
};

/**
 * GRID_COLS: pure integers 1-12 stay bare (grid-cols-3); anything else
 * becomes a bracket value (e.g. [repeat(7,1fr)] or [200px_1fr]).
 */
export const GRID_COLS: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    if (/^\d+$/.test(r)) {
      const n = parseInt(r, 10);
      if (n >= 1 && n <= 12) return r;
      return toBracket(`repeat(${n},minmax(0,1fr))`);
    }
    return toBracket(r);
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    if (/^\d+$/.test(value)) return value;
    return unbracket(value);
  },
};

/**
 * KEYWORD: presets are the canonical keywords (leading-tight, tracking-wide,
 * shadow-lg, flex-1…). Anything unmatched becomes bracket → the caller
 * pipes the bare exact class in via `isExact`.
 */
export const KEYWORD: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    // If raw looks like a number or number+unit, bracket it
    if (PURE_NUMBER.test(r) || NUMBER_WITH_UNIT.test(r)) return toBracket(r);
    // Multi-word / complex values (shadow strings, calc(), etc.) → bracket
    if (/\s/.test(r) || /[(),]/.test(r)) return toBracket(r);
    // Treat raw word as literal preset value fallback (user knows tailwind)
    return r;
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    return unbracket(value);
  },
};

/**
 * ANGLE: for rotate / skew / hue-rotate / backdrop-hue-rotate.
 * - bare number    → [Ndeg]
 * - negative       → [-Ndeg]
 * - number+unit    → [Nunit] (deg, rad, turn, grad supported)
 * - preset match   → preset.value
 */
const ANGLE_UNIT_RE = /^-?\d*\.?\d+(deg|rad|turn|grad)$/i;
export const ANGLE: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    if (PURE_NUMBER.test(r)) return toBracket(`${r}deg`);
    if (ANGLE_UNIT_RE.test(r)) return toBracket(r);
    return toBracket(r);
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    return unbracket(value);
  },
};

/**
 * DURATION: for transition-duration / delay / animation durations.
 * - bare number   → [Nms]
 * - number+s/ms   → [Nunit]
 */
const TIME_UNIT_RE = /^-?\d*\.?\d+(ms|s)$/i;
export const DURATION: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    if (PURE_NUMBER.test(r)) return toBracket(`${r}ms`);
    if (TIME_UNIT_RE.test(r)) return toBracket(r);
    return toBracket(r);
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    return unbracket(value);
  },
};

/**
 * NUMBER: unit-less numeric (scale, flex-grow, order, opacity fraction).
 * - number         → [N]
 * - preset match   → preset.value
 */
export const NUMBER: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    if (PURE_NUMBER.test(r)) return toBracket(r);
    return toBracket(r);
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    return unbracket(value);
  },
};

/**
 * RAW: no parsing. User types exactly what gets emitted (after bracketing
 * spaces). Useful for shadow values like "0 4px 12px rgba(0,0,0,.3)".
 */
export const RAW: ValueStrategy = {
  parse(raw, presets) {
    const r = normalizeRaw(raw);
    if (!r) return "";
    const preset = matchPreset(presets, r);
    if (preset) return preset.value;
    if (ALREADY_BRACKETED.test(r)) return r;
    return toBracket(r);
  },
  format(value, presets) {
    if (!value) return "";
    const preset = presets.find(p => p.value === value);
    if (preset) return preset.label ?? preset.value;
    return unbracket(value);
  },
};

// Re-export helpers so tests and edge-case callers can use them
export const _internal = { toBracket, unbracket, matchPreset, CSS_LENGTH_UNITS };
