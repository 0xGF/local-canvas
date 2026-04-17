const OVERLAY_HOST_ID = "local-canvas-host";

// Elements that shouldn't be selectable — they're structural, not content
const SKIP_TAGS = new Set(["HTML", "BODY"]);
const SKIP_IDS = new Set(["root", "__next", "app"]);

/** True if `el` is inside an <svg> (but isn't the <svg> root itself). */
function isSvgDescendant(el: Element): boolean {
  return el.tagName !== "svg" && !!el.closest("svg");
}

export function deepElementFromPoint(
  x: number,
  y: number,
  targetDoc: Document = document,
): HTMLElement | null {
  const elements = targetDoc.elementsFromPoint(x, y);

  for (const raw of elements) {
    let el = raw as HTMLElement;
    if (isOverlayElement(el)) continue;
    if (SKIP_TAGS.has(el.tagName)) continue;
    if (el.id && SKIP_IDS.has(el.id)) continue;

    // Treat the whole <svg> as one unit — avoid selecting <path>, <g>, <circle> etc.
    if (isSvgDescendant(el)) {
      const svg = el.closest("svg") as HTMLElement | null;
      if (!svg) continue;
      el = svg;
    }

    // 0×0 elements have no draggable box — walk up until we find one with area.
    // Guards against collapsed wrappers (empty <li>, display:contents children, etc.)
    // causing phantom selection outlines at the page origin.
    let cursor: HTMLElement | null = el;
    while (cursor) {
      const r = cursor.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) break;
      const next: HTMLElement | null = cursor.parentElement;
      if (!next || SKIP_TAGS.has(next.tagName)) { cursor = null; break; }
      if (next.id && SKIP_IDS.has(next.id)) { cursor = null; break; }
      cursor = next;
    }
    if (!cursor) {
      // No non-zero ancestor — fall back to the original hit so we don't
      // silently drop every element in zero-dim environments (jsdom tests,
      // not-yet-laid-out DOM). Production browsers hit the break above.
      return el;
    }

    return cursor;
  }

  return null;
}

export function isOverlayElement(element: HTMLElement): boolean {
  let current: Node | null = element;

  while (current) {
    if (current instanceof HTMLElement && current.id === OVERLAY_HOST_ID) {
      return true;
    }
    // Check shadow DOM boundary
    if (current instanceof ShadowRoot) {
      current = current.host;
      continue;
    }
    current = current.parentNode;
  }

  return false;
}

export function getElementRect(element: HTMLElement): DOMRect {
  return element.getBoundingClientRect();
}

export function getComputedTailwindClasses(element: HTMLElement): string {
  return typeof element.className === "string" ? element.className : "";
}
