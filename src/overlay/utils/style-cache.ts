/**
 * Cached computed style reader — avoids repeated getComputedStyle calls
 * that force layout reflow. Cache invalidates when element's class changes.
 *
 * Uses @chenglou/pretext for text measurement without DOM reflow.
 */
import { prepare, layout, type PreparedText } from "@chenglou/pretext";

// ── Style Cache ──

interface CachedStyle {
  className: string;
  style: CSSStyleDeclaration;
  map: StylePropertyMapReadOnly | null;
  timestamp: number;
}

const styleCache = new WeakMap<HTMLElement, CachedStyle>();
const CACHE_TTL = 500; // ms — invalidate after half a second

// Feature-detect Typed OM. Chrome/Edge/Safari 17.4+ support it; older
// browsers get the string-based fallback.
const HAS_TYPED_OM =
  typeof Element !== "undefined" && "computedStyleMap" in Element.prototype;

/**
 * Get computed style with caching. Avoids repeated getComputedStyle calls
 * during a single paint frame. Cache invalidates when className changes
 * or after CACHE_TTL milliseconds.
 */
export function getCachedStyle(el: HTMLElement): CSSStyleDeclaration {
  const now = performance.now();
  const cached = styleCache.get(el);
  const currentClass = typeof el.className === "string" ? el.className : "";

  if (cached && cached.className === currentClass && now - cached.timestamp < CACHE_TTL) {
    return cached.style;
  }

  const style = getComputedStyle(el);
  styleCache.set(el, { className: currentClass, style, map: null, timestamp: now });
  return style;
}

/**
 * Get the element's typed computed-style map, cached alongside the string
 * form. Hot paths use this to read resolved lengths numerically without
 * `parseFloat(cs.x)`. Returns `null` when Typed OM isn't available — callers
 * must handle the fallback (or use `cssPx`, which does).
 */
export function getCachedStyleMap(el: HTMLElement): StylePropertyMapReadOnly | null {
  if (!HAS_TYPED_OM) return null;
  const now = performance.now();
  const cached = styleCache.get(el);
  const currentClass = typeof el.className === "string" ? el.className : "";

  if (cached && cached.className === currentClass && now - cached.timestamp < CACHE_TTL) {
    if (cached.map) return cached.map;
    cached.map = el.computedStyleMap();
    return cached.map;
  }

  const map = el.computedStyleMap();
  const style = getComputedStyle(el);
  styleCache.set(el, { className: currentClass, style, map, timestamp: now });
  return map;
}

/**
 * Read a resolved length from a Typed OM map as a px number. Returns 0 for
 * keywords (e.g. `auto`), missing properties, or non-numeric values. Passing
 * a `null` map (Typed OM unavailable) also returns 0 — the caller should
 * fall back to `getComputedStyle` + `parseFloat` in that case.
 */
export function cssPx(
  map: StylePropertyMapReadOnly | null,
  prop: string,
): number {
  if (!map) return 0;
  const v = map.get(prop);
  if (v && "value" in v && typeof (v as CSSUnitValue).value === "number") {
    return (v as CSSUnitValue).value;
  }
  return 0;
}

/**
 * Invalidate cache for an element (e.g. after mutation).
 */
export function invalidateStyleCache(el: HTMLElement): void {
  styleCache.delete(el);
}

// ── Text Measurement ──

const textPrepareCache = new Map<string, PreparedText>();
const MAX_TEXT_CACHE = 200;

/**
 * Measure text height/lineCount using pretext (no DOM reflow).
 * Results are cached by text+font+maxWidth key.
 */
export function measureText(text: string, font: string, maxWidth: number, lineHeight: number): { height: number; lineCount: number } {
  const cacheKey = `${font}|${text}`;
  let prepared = textPrepareCache.get(cacheKey);
  if (!prepared) {
    // Evict oldest entries if cache is full
    if (textPrepareCache.size >= MAX_TEXT_CACHE) {
      const firstKey = textPrepareCache.keys().next().value;
      if (firstKey) textPrepareCache.delete(firstKey);
    }
    prepared = prepare(text, font);
    textPrepareCache.set(cacheKey, prepared);
  }
  return layout(prepared, maxWidth, lineHeight);
}

/**
 * Clear all caches. Call after HMR or major state changes.
 */
export function clearAllCaches(): void {
  textPrepareCache.clear();
  // WeakMap entries are automatically collected
}
