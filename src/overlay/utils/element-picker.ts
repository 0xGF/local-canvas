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

  // Remember the first valid (non-skipped) hit so we can fall back to it in
  // zero-dim environments (jsdom / not-yet-laid-out DOM) where every rect is
  // 0×0. Production browsers return a real element via the non-zero path.
  let firstCandidate: HTMLElement | null = null;

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

    if (!firstCandidate) firstCandidate = el;

    // Skip 0×0 elements (collapsed wrappers, display:contents children, empty
    // text-node parents). They aren't visually under the cursor, so walking
    // UP their parent chain would lock onto a giant ancestor and ignore the
    // real visible element sitting right below them in hit-test order.
    // Continuing lets `elementsFromPoint`'s own z-ordering pick the correct
    // visible sibling instead.
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;

    return el;
  }

  return firstCandidate;
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
