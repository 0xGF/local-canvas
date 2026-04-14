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

type EventName = keyof DocumentEventMap;
type Listener = (e: any) => void;

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
  events: Array<{ event: EventName; handler: Listener }>,
  opts: AttachOptions = {},
): () => void {
  const { translateCoords = false, capture = true } = opts;
  let iframeDoc: Document | null = null;

  // --- Parent document handlers (guarded) ---
  const parentHandlers: Array<{ event: EventName; handler: Listener }> = [];

  for (const { event, handler } of events) {
    const guarded = (e: Event) => {
      // Skip mouse events when cursor is over the iframe — iframe handler covers those
      if (e instanceof MouseEvent && e.isTrusted) {
        const iframe = getEditorIframe();
        if (iframe) {
          const ir = iframe.getBoundingClientRect();
          if (e.clientX >= ir.left && e.clientX <= ir.right &&
              e.clientY >= ir.top && e.clientY <= ir.bottom) {
            return;
          }
        }
      }
      handler(e);
    };
    document.addEventListener(event, guarded, capture);
    parentHandlers.push({ event, handler: guarded });
  }

  // --- Iframe handlers (coordinate translation) ---
  const iframeHandlers: Array<{ event: EventName; handler: Listener }> = [];

  function wrapHandler(handler: Listener): Listener {
    if (!translateCoords) return handler;
    return (e: MouseEvent) => {
      const iframe = getEditorIframe();
      if (!iframe) return;
      const ir = iframe.getBoundingClientRect();
      const naturalW = parseInt(iframe.style.width) || ir.width;
      const scale = ir.width / naturalW;
      const translated = new MouseEvent(e.type, {
        clientX: e.clientX * scale + ir.left,
        clientY: e.clientY * scale + ir.top,
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

  for (const { event, handler } of events) {
    iframeHandlers.push({ event, handler: wrapHandler(handler) });
  }

  function detachIframe() {
    if (!iframeDoc) return;
    for (const { event, handler } of iframeHandlers) {
      try { iframeDoc.removeEventListener(event, handler, capture); } catch { /* ignore */ }
    }
  }

  function attachIframe() {
    const doc = getIframeDocument();
    if (doc && doc !== iframeDoc) {
      detachIframe();
      iframeDoc = doc;
      for (const { event, handler } of iframeHandlers) {
        try { iframeDoc.addEventListener(event, handler, capture); } catch { /* cross-origin */ }
      }
    }
  }

  attachIframe();
  const poll = setInterval(attachIframe, 1000);

  return () => {
    clearInterval(poll);
    for (const { event, handler } of parentHandlers) {
      document.removeEventListener(event, handler, capture);
    }
    detachIframe();
  };
}
