import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { PortalContainerProvider } from "./lib/portal-container.js";
import { createOverlayContainer, injectStyles } from "./utils/shadow-dom.js";
import { resetPaintCache } from "./canvas/paint-frame.js";
import { clearAllCaches } from "./utils/style-cache.js";
import styles from "./styles.css?inline";

// Clear paint and style caches on every Vite HMR tick so we don't retain
// references to elements the host page is about to swap out.
function resetCachesForHMR() {
  resetPaintCache();
  clearAllCaches();
}
window.addEventListener("vite:beforeUpdate", resetCachesForHMR);
window.addEventListener("vite:beforeFullReload", resetCachesForHMR);

// Suppress benign "ResizeObserver loop completed with undelivered notifications"
// warnings — Chromium fires them whenever an RO callback writes a layout value
// that re-flows the next frame, which is normal during canvas zoom + iframe
// height settling. We can't beat Vite's HMR client to register a regular error
// listener (the host page's bundle loads first), so we wrap addEventListener:
// any 'error' listener registered AFTER this runs will be filtered before it
// receives the RO warning. The host's listeners (already registered by the time
// our overlay loads) are cleaned up via console.error filtering further down.
{
  const RO_MSG = "ResizeObserver loop";
  const origAdd = window.addEventListener.bind(window);
  type Listener = EventListenerOrEventListenerObject | null;
  window.addEventListener = function (this: Window, type: string, listener: Listener, options?: boolean | AddEventListenerOptions) {
    if (type === "error" && listener) {
      const wrapped: EventListener = function (this: unknown, e) {
        if (e instanceof ErrorEvent && e.message && e.message.includes(RO_MSG)) return;
        if (typeof listener === "function") return listener.call(this, e);
        return (listener as EventListenerObject).handleEvent.call(listener, e);
      };
      return origAdd(type, wrapped, options);
    }
    return origAdd(type, listener as EventListener, options);
  } as typeof window.addEventListener;

  // Vite's HMR client logs unhandled errors via console.error too — drop the
  // RO warning there so it doesn't pile up in the dev terminal either.
  const origConsoleError = console.error.bind(console);
  console.error = ((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.includes(RO_MSG)) return;
    if (first instanceof Error && first.message.includes(RO_MSG)) return;
    return origConsoleError(...args);
  }) as typeof console.error;
}

function bootstrap() {
  const params = new URLSearchParams(location.search);

  // Never run inside iframes (prevents recursive canvas-in-canvas)
  if (window.parent !== window) return;

  // Don't inject overlay into responsive preview iframes
  if (params.has("__canvas_no_overlay")) return;

  // Don't initialize twice
  if (document.getElementById("local-canvas-host")) return;

  const { shadowRoot, mountPoint } = createOverlayContainer();

  // Inject compiled Tailwind CSS into shadow DOM
  injectStyles(shadowRoot, styles);

  // Render React app inside shadow DOM with portal container for Radix
  const root = createRoot(mountPoint);
  root.render(
    <React.StrictMode>
      <PortalContainerProvider container={mountPoint}>
        <App />
      </PortalContainerProvider>
    </React.StrictMode>
  );

  console.log(
    "%c local-canvas %c v0.1.0 ",
    "background: #3b82f6; color: white; border-radius: 3px 0 0 3px; padding: 2px 6px;",
    "background: #1e293b; color: #94a3b8; border-radius: 0 3px 3px 0; padding: 2px 6px;"
  );
}

// Bootstrap when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
