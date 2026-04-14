const OVERLAY_HOST_ID = "local-canvas-host";

// Elements that shouldn't be selectable — they're structural, not content
const SKIP_TAGS = new Set(["HTML", "BODY"]);
const SKIP_IDS = new Set(["root", "__next", "app"]);

export function deepElementFromPoint(
  x: number,
  y: number,
  targetDoc: Document = document,
): HTMLElement | null {
  const elements = targetDoc.elementsFromPoint(x, y);

  for (const el of elements) {
    if (isOverlayElement(el as HTMLElement)) continue;
    // Skip structural root elements
    if (SKIP_TAGS.has(el.tagName)) continue;
    if (el.id && SKIP_IDS.has(el.id)) continue;
    return el as HTMLElement;
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
