import type { useClassHelpers } from "../../hooks/useClassHelpers.js";
import type { useEditorStore } from "../../stores/editor-store.js";
import { setStyleProp } from "../../utils/dom-style.js";

/** Shared helper type across every properties section. */
export type ClassHelpers = ReturnType<typeof useClassHelpers>;

/**
 * Wrap a CSS color for use as an arbitrary-value class. Tailwind can't always
 * infer the type of `var(--x)` (is it a color? a length?), so we prefix with
 * `color:` when the value is a bare var() reference. Hex/rgb/hsl strings are
 * self-typing and pass through untouched.
 */
export function arbitraryColorValue(cleaned: string): string {
  return /^var\(/.test(cleaned) ? `color:${cleaned}` : cleaned;
}

/** Tight alias for the non-null `selectedElement` shape; every section takes
 *  this as `sel`. Kept here so lazy-loaded section modules don't each re-
 *  derive the same type. */
export type Sel = NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]>;

/** Convert a camelCase style key ("fontSize") to its CSS property name
 *  ("font-size") so `getComputedStyle().getPropertyValue()` can read it. */
function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function normalizeCssValue(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * After committing a class mutation, clear the inline preview style only
 * AFTER:
 *   (1) the class attribute on the element has changed, AND
 *   (2) the class-provided CSS actually resolves to the intended value.
 *
 * HMR in dev arrives in two waves: React Fast Refresh can update the
 * `className` attribute BEFORE Tailwind's JIT has compiled and pushed
 * the new CSS rule. Clearing on the class change alone means the inline
 * preview disappears while the new class is effectively unstyled —
 * which is the "change, flash back, change again" the user sees.
 *
 * The fix is to peek at what the element would compute to WITHOUT the
 * inline style and only clear once that matches what we previewed. Peek
 * = temporarily strip inline, read computed, restore inline (all in one
 * synchronous turn, so nothing paints). Retry every animation frame
 * until match, or give up after 3s.
 */
export function clearInlineAfterClassUpdate(el: HTMLElement, cssProp: string) {
  const kebab = camelToKebab(cssProp);
  const inline = (el.style as unknown as Record<string, string>)[cssProp];
  if (!inline) return; // nothing previewed, nothing to clear

  let done = false;
  let classChanged = false;
  let rafId = 0;

  const finish = () => {
    if (done) return;
    done = true;
    setStyleProp(el, cssProp, "");
    observer.disconnect();
    clearTimeout(fallback);
    if (rafId) cancelAnimationFrame(rafId);
  };

  // Check whether the class-provided computed value now matches our
  // previewed value. If yes, clear. If no, try again next frame.
  const check = () => {
    rafId = 0;
    if (done) return;
    // Peek: strip inline, read computed, restore — synchronous so no
    // paint happens in between.
    const saved = (el.style as unknown as Record<string, string>)[cssProp];
    setStyleProp(el, cssProp, "");
    const classComputed = getComputedStyle(el).getPropertyValue(kebab);
    const inlineComputed = (() => {
      if (!saved) return classComputed;
      setStyleProp(el, cssProp, saved);
      return getComputedStyle(el).getPropertyValue(kebab);
    })();
    // Both readings happened above. If class matches inline, the class
    // CSS is in place and we can drop the preview safely.
    if (normalizeCssValue(classComputed) === normalizeCssValue(inlineComputed)) {
      // Already cleared by the peek above; just leave it cleared.
      setStyleProp(el, cssProp, "");
      done = true;
      observer.disconnect();
      clearTimeout(fallback);
      return;
    }
    rafId = requestAnimationFrame(check);
  };

  const observer = new MutationObserver(() => {
    if (done) return;
    classChanged = true;
    // Kick off the match-polling. One rAF lets style recalc finish
    // before the first check.
    if (!rafId) rafId = requestAnimationFrame(check);
  });
  observer.observe(el, { attributes: true, attributeFilter: ["class"] });

  // Hard cap. If HMR never lands (e.g. dev server hiccup, class in a
  // dynamic branch we can't mutate), drop the preview anyway after 3s
  // so the element doesn't stay stuck on an inline override forever.
  const fallback = setTimeout(() => {
    // Reference the unused local to keep lint happy + document the
    // intent: the fallback fires even if classChanged never flipped.
    void classChanged;
    finish();
  }, 3000);
}
