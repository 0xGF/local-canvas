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

/**
 * After committing a class mutation, clear the inline preview style only
 * AFTER the class list actually updates (via HMR). Clearing on the next
 * animation frame would make the element flash back to the old value for
 * as many frames as HMR takes to land, then snap to the new value.
 * Waiting for the class mutation means the inline value is held until
 * the new class is in place, so the swap is invisible.
 */
export function clearInlineAfterClassUpdate(el: HTMLElement, cssProp: string) {
  let done = false;
  const observer = new MutationObserver(() => {
    if (done) return;
    done = true;
    setStyleProp(el, cssProp, "");
    observer.disconnect();
    clearTimeout(fallback);
  });
  observer.observe(el, { attributes: true, attributeFilter: ["class"] });
  const fallback = setTimeout(() => {
    if (done) return;
    done = true;
    setStyleProp(el, cssProp, "");
    observer.disconnect();
  }, 5000);
}
