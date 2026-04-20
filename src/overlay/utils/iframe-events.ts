/**
 * Shared iframe event forwarding utility.
 *
 * In edit mode, page content renders inside an iframe in the shadow DOM.
 * Events inside iframes don't bubble to the parent document. This utility
 * attaches event listeners to the iframe document and translates coordinates
 * from iframe-local to parent viewport space.
 *
 * Parent document handlers are guarded: they skip events when the cursor is
 * over the iframe, since the iframe handler handles those with proper
 * coordinate translation.
 */

const OVERLAY_HOST_ID = "local-canvas-host";

/** Get the current iframe element from the shadow DOM, or null. */
export function getEditorIframe(): HTMLIFrameElement | null {
  const host = document.getElementById(OVERLAY_HOST_ID);
  const shadow = host?.shadowRoot;
  return (shadow?.querySelector("#responsive-frame-container iframe") ??
    shadow?.querySelector("iframe")) as HTMLIFrameElement | null;
}

/** Get the iframe's content document, with cross-origin safety. */
export function getIframeDocument(): Document | null {
  try {
    return getEditorIframe()?.contentDocument ?? null;
  } catch {
    return null;
  }
}

/**
 * Current on-screen offset + scale of the iframe.
 *
 * Why not just `iframe.getBoundingClientRect()`? Under certain Chromium
 * conditions (iframe inside a Shadow DOM whose ancestor has a CSS
 * `transform`), the iframe's bounding rect can lag the browser's GPU
 * compositor by a frame — so the rect we read is from the *previous*
 * transform while the iframe is actually rendered at the current one. The
 * drift grows with zoom because the lag is a transform mismatch, not a
 * pixel offset.
 *
 * Robust approach: anchor to the transformed container's rect (which is
 * the element the transform is set on, so its rect is always consistent
 * with its own style), and compute the iframe's offset within the
 * container using `offsetLeft/offsetTop` — layout properties that are
 * *unaffected* by CSS transforms. Then apply the zoom/pan from the
 * zustand store (the source of truth) manually.
 */
export function getIframeOffset(iframe: HTMLIFrameElement): { x: number; y: number; scale: number } {
  const zoom = getViewportZoom();

  // Find the transformed container (the element useViewport applies
  // `transform: translate(panX, panY) scale(zoom)` to).
  const root = iframe.getRootNode();
  const container = root instanceof ShadowRoot
    ? (root.getElementById("responsive-frame-container") as HTMLElement | null)
    : null;

  if (!container) {
    // Outside the normal shadow-DOM editor context — fall back.
    const ir = iframe.getBoundingClientRect();
    return { x: ir.left, y: ir.top, scale: zoom };
  }

  // Walk offsetLeft/offsetTop chain from iframe up to (not including) the
  // container. These are layout offsets in container-local, pre-transform
  // CSS pixels.
  let localX = 0, localY = 0;
  let node: HTMLElement | null = iframe;
  while (node && node !== container) {
    localX += node.offsetLeft;
    localY += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }

  // Container's on-screen rect already reflects the transform applied to
  // itself (browsers report this reliably; the quirk only affects
  // transformed *descendants* like the iframe). Its top-left is the
  // post-transform origin since `transform-origin: 0 0`.
  const cr = container.getBoundingClientRect();
  return {
    x: cr.left + localX * zoom,
    y: cr.top + localY * zoom,
    scale: zoom,
  };
}

// Indirection so tests / non-overlay consumers don't need a viewport store.
let _viewportZoomGetter: (() => number) | null = null;
export function _setViewportZoomGetter(fn: () => number): void { _viewportZoomGetter = fn; }
function getViewportZoom(): number {
  return _viewportZoomGetter ? _viewportZoomGetter() : 1;
}

/**
 * Translate an iframe-local rect's top-left corner to parent viewport
 * coordinates. Accounts for responsive-frame scaling (iframe rendered at
 * a smaller size than its natural document width).
 *
 * `rect` is expected to come from an element inside the iframe's document
 * (e.g. `getBoundingClientRect()` called from within the iframe).
 */
export function iframeRectToScreen(
  rect: { left: number; top: number },
  iframe: HTMLIFrameElement,
): { x: number; y: number } {
  const { x, y, scale } = getIframeOffset(iframe);
  return { x: rect.left * scale + x, y: rect.top * scale + y };
}

/**
 * Translate an iframe-local rect to parent viewport coordinates, preserving
 * width and height (scaled). Useful when you need the full screen-space box
 * of an iframe element — e.g. to anchor a menu to its horizontal center.
 */
export function iframeRectToScreenBox(
  rect: { left: number; top: number; width: number; height: number },
  iframe: HTMLIFrameElement,
): { left: number; top: number; width: number; height: number } {
  const { x, y, scale } = getIframeOffset(iframe);
  return {
    left: rect.left * scale + x,
    top: rect.top * scale + y,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

type EventName = keyof DocumentEventMap;
type Listener<E extends EventName = EventName> = (e: DocumentEventMap[E]) => void;

/** A listener bound to a specific event name. */
export interface EventBinding<E extends EventName = EventName> {
  event: E;
  handler: Listener<E>;
}

/** Discriminated union over every possible (event, handler) pair — lets a
 *  heterogeneous array hold bindings for different events while keeping each
 *  handler's event type narrowed at the call site. */
export type AnyEventBinding = { [E in EventName]: EventBinding<E> }[EventName];

/**
 * Construct an event binding with the handler's event type inferred from the
 * event name. Use this in `attachToDocumentAndIframe` calls so each entry
 * carries its own narrowed handler type without `as any`.
 */
export function bind<E extends EventName>(event: E, handler: Listener<E>): EventBinding<E> {
  return { event, handler };
}

interface AttachOptions {
  /** Translate iframe-local mouse coordinates to parent viewport coords. */
  translateCoords?: boolean;
  /** Use capture phase. Default true. */
  capture?: boolean;
}

/**
 * Attach event listeners to both the parent document and iframe document.
 * Handles iframe remounting (breakpoint changes) via polling.
 *
 * Parent handlers are guarded to skip when the cursor is inside the iframe area.
 * Iframe handlers translate coordinates to parent viewport space.
 *
 * Returns a cleanup function.
 */
export function attachToDocumentAndIframe(
  events: ReadonlyArray<AnyEventBinding>,
  opts: AttachOptions = {},
): () => void {
  const { translateCoords = false, capture = true } = opts;
  let iframeDoc: Document | null = null;

  // --- Parent document handlers (guarded) ---
  const parentHandlers: AnyEventBinding[] = [];

  // Track whether a mouse button is currently pressed. During an active drag,
  // pointer capture keeps mousemove/mouseup events on whichever document
  // received the mousedown — so if the drag started in the parent (e.g. on a
  // tag badge) and the cursor later enters the iframe area, we MUST still
  // deliver those parent-side events to the handler. Without this, the
  // reorder-drag ghost freezes at the iframe boundary because cursorX/Y stops
  // updating the moment the cursor crosses into the iframe region.
  let parentMouseDown = false;

  for (const binding of events) {
    const { event, handler } = binding as EventBinding<EventName>;
    const guarded: Listener = (e) => {
      if (e instanceof MouseEvent && e.isTrusted) {
        if (e.type === "mousedown") parentMouseDown = true;
        // Skip mouse events when cursor is over the iframe — iframe handler
        // covers those — EXCEPT during an active drag started in the parent.
        if (!parentMouseDown) {
          const iframe = getEditorIframe();
          if (iframe) {
            const ir = iframe.getBoundingClientRect();
            if (e.clientX >= ir.left && e.clientX <= ir.right &&
                e.clientY >= ir.top && e.clientY <= ir.bottom) {
              if (e.type === "mouseup") parentMouseDown = false;
              return;
            }
          }
        }
        if (e.type === "mouseup") parentMouseDown = false;
      }
      handler(e);
    };
    document.addEventListener(event, guarded, capture);
    parentHandlers.push({ event, handler: guarded } as AnyEventBinding);
  }

  // --- Iframe handlers (coordinate translation) ---
  const iframeHandlers: AnyEventBinding[] = [];

  function wrapHandler(handler: Listener): Listener {
    if (!translateCoords) return handler;
    return (e) => {
      if (!(e instanceof MouseEvent)) { handler(e); return; }
      const iframe = getEditorIframe();
      if (!iframe) return;
      const { x, y, scale } = getIframeOffset(iframe);
      const translated = new MouseEvent(e.type, {
        clientX: e.clientX * scale + x,
        clientY: e.clientY * scale + y,
        button: e.button,
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
      });
      handler(translated);
      if (translated.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
  }

  for (const binding of events) {
    const { event, handler } = binding as EventBinding<EventName>;
    iframeHandlers.push({ event, handler: wrapHandler(handler) } as AnyEventBinding);
  }

  function detachIframe() {
    if (!iframeDoc) return;
    for (const binding of iframeHandlers) {
      const { event, handler } = binding as EventBinding<EventName>;
      try { iframeDoc.removeEventListener(event, handler, capture); } catch { /* ignore */ }
    }
  }

  function attachIframe() {
    const doc = getIframeDocument();
    if (doc && doc !== iframeDoc) {
      detachIframe();
      iframeDoc = doc;
      for (const binding of iframeHandlers) {
        const { event, handler } = binding as EventBinding<EventName>;
        try { iframeDoc.addEventListener(event, handler, capture); } catch { /* cross-origin */ }
      }
    }
  }

  attachIframe();
  const poll = setInterval(attachIframe, 1000);

  return () => {
    clearInterval(poll);
    for (const binding of parentHandlers) {
      const { event, handler } = binding as EventBinding<EventName>;
      document.removeEventListener(event, handler, capture);
    }
    detachIframe();
  };
}
