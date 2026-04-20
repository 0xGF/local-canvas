import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useEditorStore } from "../stores/editor-store.js";
import { syncToStorage } from "../utils/persist-state.js";
import { _setViewportZoomGetter } from "../utils/iframe-events.js";

// ── Viewport store ───────────────────────────────────────────────────────────

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  setZoom: (z: number, cx?: number, cy?: number) => void;
  setPan: (x: number, y: number) => void;
  reset: () => void;
  fitToPage: () => void;
}

export const useViewportStore = create<ViewportState>((set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  setZoom: (zoom, cx, cy) => {
    zoom = Math.max(0.1, Math.min(5, zoom));
    if (cx !== undefined && cy !== undefined) {
      const prev = get();
      const scale = zoom / prev.zoom;
      const panX = cx - scale * (cx - prev.panX);
      const panY = cy - scale * (cy - prev.panY);
      set({ zoom, panX, panY });
    } else {
      set({ zoom });
    }
  },
  setPan: (panX, panY) => set({ panX, panY }),
  reset: () => set({ zoom: 1, panX: 0, panY: 0 }),
  fitToPage: () => {
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;

    // Measure the iframe container in the shadow DOM
    const host = document.getElementById("local-canvas-host");
    const shadow = host?.shadowRoot;
    const container = shadow?.getElementById("responsive-frame-container");
    if (!container) return;

    // Temporarily remove transform to measure natural size
    const prevTransform = container.style.transform;
    container.style.transform = "none";
    void container.offsetHeight;
    const pageW = container.scrollWidth;
    const pageH = container.scrollHeight;
    container.style.transform = prevTransform;

    const fitZoom = Math.min(viewW / pageW, viewH / pageH) * 0.85;
    const clampedZoom = Math.max(0.1, Math.min(1, fitZoom));
    const scaledW = pageW * clampedZoom;
    const scaledH = pageH * clampedZoom;
    const panX = (viewW - scaledW) / 2;
    const panY = (viewH - scaledH) / 2;
    set({ zoom: clampedZoom, panX, panY });
  },
}));

// Persist viewport state
syncToStorage(useViewportStore, ["zoom", "panX", "panY"], "viewport", 300);

// Expose current zoom to iframe-events helpers so `iframeRectToScreen*` and
// `getIframeOffset` can read the source of truth without a circular import.
_setViewportZoomGetter(() => useViewportStore.getState().zoom);

// ── Restoration (persistence) ────────────────────────────────────────────────

let isRestoring = false;

/**
 * Restore viewport state from localStorage on page load.
 * Must be called before the mode-change effect fires to prevent fitToPage
 * from overriding saved zoom/pan.
 */
export function restoreViewport(saved: { zoom: number; panX: number; panY: number }) {
  isRestoring = true;
  useViewportStore.setState({ zoom: saved.zoom, panX: saved.panX, panY: saved.panY });
  // applyTransform fires via subscription
  isRestoring = false;
}

// ── Apply transform ──────────────────────────────────────────────────────────

function setCanvasBackground() {
  document.body.style.overflow = "hidden";
  document.body.style.background = "#1a1a1a";
  document.body.style.backgroundImage = "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)";
  document.body.style.backgroundSize = "24px 24px";
}

function clearCanvasBackground() {
  document.body.style.overflow = "";
  document.body.style.background = "";
  document.body.style.backgroundImage = "";
  document.body.style.backgroundSize = "";
}

function applyTransform() {
  const { zoom, panX, panY } = useViewportStore.getState();
  const isEdit = useEditorStore.getState().mode === "edit";

  if (!isEdit) {
    clearCanvasBackground();
    return;
  }

  // Transform the iframe container in the shadow DOM
  const host = document.getElementById("local-canvas-host");
  const shadow = host?.shadowRoot;
  const container = shadow?.getElementById("responsive-frame-container");
  if (container) {
    container.style.transformOrigin = "0 0";
    container.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
  setCanvasBackground();
}

// ── useViewport hook ─────────────────────────────────────────────────────────

export function useViewport() {
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const spaceHeld = useRef(false);

  // Keep transform in sync with store
  useEffect(() => {
    const unsub = useViewportStore.subscribe(applyTransform);
    applyTransform();
    return () => { unsub(); applyTransform(); };
  }, []);

  // Auto zoom-to-fit when entering edit mode, reset when leaving
  useEffect(() => {
    const unsub = useEditorStore.subscribe((state, prev) => {
      if (state.mode === "edit" && prev.mode !== "edit" && !isRestoring) {
        setCanvasBackground();
        useViewportStore.getState().fitToPage();
      } else if (state.mode === "navigate" && prev.mode !== "navigate") {
        clearCanvasBackground();
        useViewportStore.getState().reset();
      }
      // Breakpoint changed while in edit mode — refit after React renders
      if (state.mode === "edit" && state.breakpoint !== prev.breakpoint) {
        requestAnimationFrame(() => useViewportStore.getState().fitToPage());
      }
    });
    return () => {
      unsub();
    };
  }, []);

  // Scroll: Cmd/Ctrl + scroll = zoom, regular scroll = pan when zoomed
  useEffect(() => {
    function isInsideOverlayUI(e: Event): boolean {
      const path = e.composedPath();
      for (const node of path) {
        if (!(node instanceof HTMLElement)) continue;
        // Overlay controls (toolbar, panels, inputs) opt-in with this flag.
        // The host/iframe itself should still allow viewport wheel handling.
        if (node.getAttribute?.("data-canvas-overlay") === "true") return true;
      }
      return false;
    }

    function onWheel(e: WheelEvent) {
      const isEditMode = useEditorStore.getState().mode === "edit";
      if (!isEditMode) return;

      const { zoom, panX, panY } = useViewportStore.getState();

      if (e.metaKey || e.ctrlKey) {
        // Prevent browser/page zoom so Ctrl/Cmd+wheel always zooms the canvas.
        e.preventDefault();
        const sensitivity = Math.abs(e.deltaY) < 10 ? 0.02 : 0.08;
        const delta = e.deltaY > 0 ? -sensitivity : sensitivity;
        useViewportStore.getState().setZoom(zoom + delta * zoom, e.clientX, e.clientY);
        return;
      }

      if (isInsideOverlayUI(e)) return;

      if (zoom !== 1) {
        e.preventDefault();
        useViewportStore.getState().setPan(panX - e.deltaX, panY - e.deltaY);
      }
    }

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, true);
  }, []);

  // Space + drag OR middle-click = pan
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !isTyping(e)) {
        if (useEditorStore.getState().interacting) return;
        const { zoom } = useViewportStore.getState();
        if (zoom !== 1 || isPanning.current) {
          e.preventDefault();
          spaceHeld.current = true;
          document.body.style.cursor = "grab";
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceHeld.current = false;
        if (!isPanning.current) document.body.style.cursor = "";
      }
    }

    function onDown(e: MouseEvent) {
      if (useEditorStore.getState().interacting) return;
      if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
        e.preventDefault();
        e.stopPropagation();
        isPanning.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        document.body.style.cursor = "grabbing";
      }
    }
    function onMove(e: MouseEvent) {
      if (!isPanning.current) return;
      e.preventDefault();
      e.stopPropagation();
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      const { panX, panY } = useViewportStore.getState();
      useViewportStore.getState().setPan(panX + dx, panY + dy);
    }
    function onUp() {
      if (!isPanning.current) return;
      isPanning.current = false;
      document.body.style.cursor = spaceHeld.current ? "grab" : "";
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };
  }, []);
}

function isTyping(e: KeyboardEvent): boolean {
  // Use composedPath so we see through shadow DOM (e.target is retargeted to the host)
  const t = (e.composedPath()[0] || e.target) as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}
