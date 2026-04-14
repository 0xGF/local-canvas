import { create } from "zustand";
import type { SourceLocation } from "../../core/source-map/types.js";
import { DEFAULT_BREAKPOINT } from "../../shared/breakpoints.js";
import { syncToStorage } from "../utils/persist-state.js";

export type EditorMode = "navigate" | "edit";
export type PanelSide = "left" | "right" | "none";

interface SelectedElement {
  element: HTMLElement;
  source: SourceLocation | null;
  rect: DOMRect;
  className: string;
  tagName: string;
  iframeRef?: HTMLIFrameElement;
}

interface EditorState {
  // Mode
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;

  // Selection
  selectedElement: SelectedElement | null;
  hoveredElement: HTMLElement | null;
  selectElement: (el: SelectedElement | null) => void;
  setHoveredElement: (el: HTMLElement | null) => void;

  // Panels
  propertiesOpen: boolean;
  paletteOpen: boolean;
  toggleProperties: () => void;
  togglePalette: () => void;

  // Command bar
  commandBarOpen: boolean;
  setCommandBarOpen: (open: boolean) => void;

  // Context menu
  contextMenu: { x: number; y: number; element: HTMLElement; source: SourceLocation | null } | null;
  setContextMenu: (menu: { x: number; y: number; element: HTMLElement; source: SourceLocation | null } | null) => void;

  // Canvas feedback (undo/redo flash on element)
  toast: { message: string; id: number } | null;
  showToast: (message: string) => void;
  elementFlash: boolean;
  triggerElementFlash: () => void;

  // Connection
  connected: boolean;
  setConnected: (connected: boolean) => void;

  // Active toolbar
  toolbarVisible: boolean;
  setToolbarVisible: (visible: boolean) => void;

  // Refresh selected element from live DOM (after mutations/HMR)
  refreshSelection: () => void;

  // Breakpoint viewport
  breakpoint: number;
  setBreakpoint: (bp: number) => void;

  // Pending changes (version-based save model)
  version: number;
  savedVersion: number;
  pendingCount: number; // Derived: version - savedVersion (kept for backward compat)
  incrementPending: () => void;
  clearPending: () => void;
  decrementPending: () => void;
}

// Read persisted state synchronously so the first render is correct
const _persisted = (() => {
  try {
    const raw = localStorage.getItem("local-canvas:editor");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();

export const useEditorStore = create<EditorState>((set) => ({
  mode: _persisted.mode === "edit" ? "edit" : "navigate",
  setMode: (mode) => set({ mode }),

  selectedElement: null,
  hoveredElement: null,
  selectElement: (el) =>
    set({ selectedElement: el, propertiesOpen: el !== null }),
  setHoveredElement: (el) => set({ hoveredElement: el }),

  propertiesOpen: false,
  paletteOpen: false,
  toggleProperties: () =>
    set((s) => ({ propertiesOpen: !s.propertiesOpen })),
  togglePalette: () =>
    set((s) => ({ paletteOpen: !s.paletteOpen })),

  commandBarOpen: false,
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),

  contextMenu: null,
  setContextMenu: (menu) => set({ contextMenu: menu }),

  toast: null,
  showToast: (message) => {
    const id = Date.now();
    set({ toast: { message, id } });
    setTimeout(() => {
      const current = useEditorStore.getState().toast;
      if (current?.id === id) set({ toast: null });
    }, 1500);
  },

  elementFlash: false,
  triggerElementFlash: () => {
    set({ elementFlash: true });
    setTimeout(() => set({ elementFlash: false }), 400);
  },

  connected: false,
  setConnected: (connected) => set({ connected }),

  toolbarVisible: true,
  setToolbarVisible: (visible) => set({ toolbarVisible: visible }),

  // Breakpoint viewport — ResponsiveFrame constrains #root width in-place
  breakpoint: _persisted.breakpoint || DEFAULT_BREAKPOINT,
  setBreakpoint: (bp) => set({ breakpoint: bp }),

  // Refresh selected element from live DOM.
  // After HMR, the old DOM node may be disconnected — re-find via source attributes.
  refreshSelection: () =>
    set((s) => {
      const sel = s.selectedElement;
      if (!sel) return {};
      let el = sel.element;

      // Search in both the main document and any iframe document (breakpoint mode)
      const getTargetDocuments = (): Document[] => {
        const docs: Document[] = [document];
        const host = document.getElementById("local-canvas-host");
        const shadow = host?.shadowRoot;
        const iframe = shadow?.querySelector("iframe") as HTMLIFrameElement | null;
        if (iframe?.contentDocument) docs.push(iframe.contentDocument);
        return docs;
      };

      // If element was disconnected by HMR, try to re-find it
      if (!el.isConnected && sel.source) {
        let found = false;
        for (const doc of getTargetDocuments()) {
          const candidates = doc.querySelectorAll(
            `[data-source-file="${sel.source.filePath}"][data-source-line="${sel.source.line}"]`
          );
          if (candidates.length > 0) {
            el = candidates[0] as HTMLElement;
            found = true;
            break;
          }
        }
        if (!found) {
          return { selectedElement: null, propertiesOpen: false };
        }
      } else if (!el.isConnected) {
        return { selectedElement: null, propertiesOpen: false };
      }

      const newClass = typeof el.className === "string" ? el.className : "";
      return {
        selectedElement: {
          ...sel,
          element: el,
          className: newClass,
          rect: el.getBoundingClientRect(),
        },
      };
    }),

  // Version-based change tracking:
  // - version increments on each mutation, decrements on undo
  // - savedVersion is set to version on save
  // - pendingCount = abs(version - savedVersion) for the UI badge
  // This correctly shows unsaved state after: save → undo, or save → undo → redo
  version: 0,
  savedVersion: 0,
  pendingCount: 0,
  incrementPending: () => set((s) => {
    const version = s.version + 1;
    return { version, pendingCount: Math.abs(version - s.savedVersion) };
  }),
  decrementPending: () => set((s) => {
    // Don't decrement below savedVersion — nothing to undo past the save point
    if (s.version <= s.savedVersion) return {};
    const version = s.version - 1;
    return { version, pendingCount: Math.abs(version - s.savedVersion) };
  }),
  clearPending: () => set((s) => ({ savedVersion: s.version, pendingCount: 0 })),
}));

// Persist selected keys to localStorage
syncToStorage(useEditorStore, ["mode", "breakpoint"], "editor", 300);
