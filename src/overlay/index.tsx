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

// Suppress ResizeObserver loop error — benign, caused by layout settling across frames
window.addEventListener("error", (e) => {
  if (e.message?.includes("ResizeObserver loop")) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

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
