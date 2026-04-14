import { create } from "zustand";
import type { ScannedComponent } from "../../core/scanner/types.js";

const STORAGE_KEY = "local-canvas-view-mode";

function loadViewMode(): "page" | "component" {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === "component") return "component";
  } catch {}
  return "page";
}

interface ComponentViewState {
  viewMode: "page" | "component";
  setViewMode: (mode: "page" | "component") => void;

  components: ScannedComponent[];
  setComponents: (components: ScannedComponent[]) => void;
  isScanning: boolean;
  setIsScanning: (v: boolean) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;

  activeComponent: ScannedComponent | null;
  setActiveComponent: (c: ScannedComponent | null) => void;

  propValues: Record<string, any>;
  setPropValue: (name: string, value: any) => void;
  resetPropValues: () => void;
}

export const useComponentViewStore = create<ComponentViewState>((set) => ({
  viewMode: loadViewMode(),
  setViewMode: (mode) => {
    try { sessionStorage.setItem(STORAGE_KEY, mode); } catch {}
    set({ viewMode: mode });
  },

  components: [],
  setComponents: (components) => set({ components }),
  isScanning: false,
  setIsScanning: (v) => set({ isScanning: v }),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  activeComponent: null,
  setActiveComponent: (c) => set({ activeComponent: c, propValues: {} }),

  propValues: {},
  setPropValue: (name, value) =>
    set((s) => ({ propValues: { ...s.propValues, [name]: value } })),
  resetPropValues: () => set({ propValues: {} }),
}));
