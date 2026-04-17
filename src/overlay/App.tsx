import React, { Suspense, lazy, useEffect } from "react";
import { CanvasOverlayLayer } from "./components/CanvasOverlayLayer.js";
import { Toolbar } from "./components/Toolbar.js";
import { PropertiesPanel } from "./components/PropertiesPanel.js";
import { ResponsiveFrame } from "./components/ResponsiveFrame.js";
import { ContextMenu } from "./components/ContextMenu.js";
// Only needed once the user is in edit mode and not mid-interaction.
const AnnotationPins = lazy(() =>
  import("./components/AnnotationPins.js").then(m => ({ default: m.AnnotationPins }))
);
import { useSelection } from "./hooks/useSelection.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useViewport, restoreViewport } from "./hooks/useViewport.js";
import { useEditorStore } from "./stores/editor-store.js";
import { readFromStorage } from "./utils/persist-state.js";
import { getIframeDocument } from "./utils/iframe-events.js";

const PAUSE_STYLE_ID = "local-canvas-animation-pause";
const PAUSE_CSS = "*, *::before, *::after { animation-play-state: paused !important; transition: none !important; pointer-events: none !important; }";

/** Inject or remove the animation-pause stylesheet in the target page. */
function syncAnimationPause(paused: boolean) {
  // Apply to both the main document and any iframe document
  for (const doc of [document, getIframeDocument()]) {
    if (!doc) continue;
    const existing = doc.getElementById(PAUSE_STYLE_ID);
    if (paused && !existing) {
      const style = doc.createElement("style");
      style.id = PAUSE_STYLE_ID;
      style.textContent = PAUSE_CSS;
      doc.head.appendChild(style);
    } else if (!paused && existing) {
      existing.remove();
    }
  }
}

export function App() {
  const mode = useEditorStore((s) => s.mode);
  const animationsPaused = useEditorStore((s) => s.animationsPaused);
  const interacting = useEditorStore((s) => s.interacting);

  useSelection();
  useKeyboard();
  useViewport();

  // Restore viewport zoom/pan on mount (mode + breakpoint are initialized in the store)
  useEffect(() => {
    if (mode === "edit") {
      const viewportState = readFromStorage<{
        zoom?: number;
        panX?: number;
        panY?: number;
      }>("viewport");

      if (viewportState?.zoom && viewportState.zoom !== 1) {
        restoreViewport({
          zoom: viewportState.zoom,
          panX: viewportState.panX || 0,
          panY: viewportState.panY || 0,
        });
      }
    }
  }, []);

  // Sync animation-pause stylesheet to target page
  useEffect(() => {
    syncAnimationPause(animationsPaused);
    // Re-apply on iframe reload (breakpoint change)
    const interval = setInterval(() => syncAnimationPause(animationsPaused), 1000);
    return () => {
      clearInterval(interval);
      // Clean up on unmount
      syncAnimationPause(false);
    };
  }, [animationsPaused]);

  return (
    <>
      <ResponsiveFrame />
      {mode === "edit" && !interacting && <CanvasOverlayLayer />}
      {mode === "edit" && !interacting && <PropertiesPanel />}
      {mode === "edit" && !interacting && <ContextMenu />}
      {mode === "edit" && !interacting && (
        <Suspense fallback={null}>
          <AnnotationPins />
        </Suspense>
      )}

      <Toolbar />
    </>
  );
}
