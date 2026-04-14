import { create } from "zustand";

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  pushUndo: () => void;
  didUndo: () => void;
  didRedo: () => void;
  reset: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,

  pushUndo: () =>
    set((s) => ({
      undoCount: s.undoCount + 1,
      canUndo: true,
      redoCount: 0,
      canRedo: false,
    })),

  didUndo: () =>
    set((s) => ({
      undoCount: Math.max(0, s.undoCount - 1),
      canUndo: s.undoCount > 1,
      redoCount: s.redoCount + 1,
      canRedo: true,
    })),

  didRedo: () =>
    set((s) => ({
      redoCount: Math.max(0, s.redoCount - 1),
      canRedo: s.redoCount > 1,
      undoCount: s.undoCount + 1,
      canUndo: true,
    })),

  reset: () =>
    set({
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      redoCount: 0,
    }),
}));
