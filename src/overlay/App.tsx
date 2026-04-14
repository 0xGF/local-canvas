import React, { useEffect } from "react";
import { CanvasOverlayLayer } from "./components/CanvasOverlayLayer.js";
import { Toolbar } from "./components/Toolbar.js";
import { PropertiesPanel } from "./components/PropertiesPanel.js";
import { ComponentView } from "./components/ComponentView.js";
import { ResponsiveFrame } from "./components/ResponsiveFrame.js";
import { ContextMenu } from "./components/ContextMenu.js";
import { useSelection } from "./hooks/useSelection.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useViewport, restoreViewport } from "./hooks/useViewport.js";
import { useComponentViewStore } from "./stores/component-view-store.js";
import { useEditorStore } from "./stores/editor-store.js";
import { readFromStorage } from "./utils/persist-state.js";

export function App() {
  const viewMode = useComponentViewStore((s) => s.viewMode);
  const mode = useEditorStore((s) => s.mode);

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

  return (
    <>
      {viewMode === "component" ? (
        <ComponentView />
      ) : (
        <>
          <ResponsiveFrame />
          {mode === "edit" && <CanvasOverlayLayer />}
          {mode === "edit" && <PropertiesPanel />}
          {mode === "edit" && <ContextMenu />}
        </>
      )}
      <Toolbar />
    </>
  );
}
