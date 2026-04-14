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
  timestamp: number;
}

const styleCache = new WeakMap<HTMLElement, CachedStyle>();
const CACHE_TTL = 500; // ms — invalidate after half a second

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
  styleCache.set(el, { className: currentClass, style, timestamp: now });
  return style;
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
