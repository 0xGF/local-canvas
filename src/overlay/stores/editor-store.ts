import { create } from "zustand";
import type { SourceLocation } from "../../core/source-map/types.js";
import { DEFAULT_BREAKPOINT } from "../../shared/breakpoints.js";
import { syncToStorage } from "../utils/persist-state.js";
import { getIframeDocument } from "../utils/iframe-events.js";

export type EditorMode = "navigate" | "edit";
export type PanelSide = "left" | "right" | "none";

export interface SelectedElement {
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
  multiSelection: SelectedElement[];
  hoveredElement: HTMLElement | null;
  selectElement: (el: SelectedElement | null) => void;
  addToSelection: (el: SelectedElement) => void;
  clearMultiSelection: () => void;
  setHoveredElement: (el: HTMLElement | null) => void;

  // Panels
  propertiesOpen: boolean;
  paletteOpen: boolean;
  layersOpen: boolean;
  layersWidth: number;
  toggleProperties: () => void;
  togglePalette: () => void;
  toggleLayers: () => void;
  setLayersWidth: (w: number) => void;

  // Command bar
  commandBarOpen: boolean;
  setCommandBarOpen: (open: boolean) => void;

  // Context menu
  contextMenu: {
    x: number;
    y: number;
    element: HTMLElement;
    source: SourceLocation | null;
    /** When set, open the menu directly into a specific sub-state. */
    initialMode?: "ai-prompt";
  } | null;
  setContextMenu: (
    menu: {
      x: number;
      y: number;
      element: HTMLElement;
      source: SourceLocation | null;
      initialMode?: "ai-prompt";
    } | null,
  ) => void;

  // Annotate tool — when true, clicks in Edit mode open Ask AI on the
  // clicked element instead of selecting it. Ctrl/Cmd-click keeps its
  // usual "open context menu" behaviour regardless of this flag.
  annotateMode: boolean;
  setAnnotateMode: (on: boolean) => void;

  // Marquee selection rect (Alt+drag)
  marqueeRect: { x: number; y: number; w: number; h: number } | null;
  setMarqueeRect: (rect: { x: number; y: number; w: number; h: number } | null) => void;

  // Inline text editing
  editingText: boolean;
  setEditingText: (editing: boolean) => void;

  // Canvas feedback (undo/redo flash on element)
  toast: { message: string; id: number } | null;
  showToast: (message: string) => void;
  elementFlash: boolean;
  triggerElementFlash: () => void;

  // Connection
  connected: boolean;
  setConnected: (connected: boolean) => void;

  // True once the preview frame's halftone cover has started fading. Used to
  // suppress element-anchored chrome (annotation pins, etc.) during the
  // initial load so pins don't flash at pre-measure coordinates.
  frameRevealed: boolean;
  setFrameRevealed: (revealed: boolean) => void;

  // Animation pause — freezes CSS animations and transitions in the target page
  animationsPaused: boolean;
  setAnimationsPaused: (paused: boolean) => void;
  toggleAnimationsPaused: () => void;

  // Interactive mode — temporarily passes pointer events through to the app
  interacting: boolean;
  setInteracting: (on: boolean) => void;

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
  multiSelection: [],
  hoveredElement: null,
  selectElement: (el) =>
    set({ selectedElement: el, multiSelection: [], propertiesOpen: el !== null }),
  addToSelection: (el) =>
    set((s) => {
      // If nothing selected yet, just select it normally
      if (!s.selectedElement) {
        return { selectedElement: el, multiSelection: [], propertiesOpen: true };
      }

      // Build the current set: if multiSelection is empty, start from selectedElement
      const current = s.multiSelection.length > 0
        ? s.multiSelection
        : [s.selectedElement];

      // Check if already in the set
      const exists = current.some(e => e.element === el.element);
      if (exists) {
        // Toggle off — remove it
        const filtered = current.filter(e => e.element !== el.element);
        if (filtered.length === 0) return { selectedElement: null, multiSelection: [], propertiesOpen: false };
        if (filtered.length === 1) return { selectedElement: filtered[0], multiSelection: [], propertiesOpen: true };
        return { selectedElement: filtered[0], multiSelection: filtered };
      }

      // Add to the set
      const multi = [...current, el];
      return { selectedElement: s.selectedElement, multiSelection: multi, propertiesOpen: true };
    }),
  clearMultiSelection: () => set({ multiSelection: [] }),
  setHoveredElement: (el) => set({ hoveredElement: el }),

  propertiesOpen: false,
  paletteOpen: false,
  layersOpen: !!_persisted.layersOpen,
  layersWidth: clampLayersWidth(_persisted.layersWidth) ?? 260,
  toggleProperties: () =>
    set((s) => ({ propertiesOpen: !s.propertiesOpen })),
  togglePalette: () =>
    set((s) => ({ paletteOpen: !s.paletteOpen })),
  toggleLayers: () =>
    set((s) => ({ layersOpen: !s.layersOpen })),
  setLayersWidth: (w) => set({ layersWidth: clampLayersWidth(w) ?? 260 }),

  commandBarOpen: false,
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),

  contextMenu: null,
  setContextMenu: (menu) => set({ contextMenu: menu }),

  annotateMode: false,
  setAnnotateMode: (on) => set({ annotateMode: on }),

  marqueeRect: null,
  setMarqueeRect: (rect) => set({ marqueeRect: rect }),

  editingText: false,
  setEditingText: (editing) => set({ editingText: editing }),

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

  frameRevealed: false,
  setFrameRevealed: (revealed) => set({ frameRevealed: revealed }),

  animationsPaused: !!_persisted.animationsPaused,
  setAnimationsPaused: (paused) => set({ animationsPaused: paused }),
  toggleAnimationsPaused: () => set((s) => ({ animationsPaused: !s.animationsPaused })),

  interacting: false,
  setInteracting: (on) => set({ interacting: on }),

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
        const iframeDoc = getIframeDocument();
        if (iframeDoc) docs.push(iframeDoc);
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

// Clamp layers panel width to a sane range — protects against stale localStorage
function clampLayersWidth(w: number | undefined): number | null {
  if (typeof w !== "number" || !isFinite(w)) return null;
  return Math.max(180, Math.min(520, w));
}

// Persist selected keys to localStorage
syncToStorage(
  useEditorStore,
  ["mode", "breakpoint", "animationsPaused", "layersOpen", "layersWidth"],
  "editor",
  300,
);
