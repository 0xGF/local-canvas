import { create } from "zustand";

export interface ChangeEntry {
  id: string;
  timestamp: number;
  type: string;
  filePath: string;
  line: number;
  description: string;
  diff?: string;
  status: "pending" | "applied" | "failed";
}

interface ChangesState {
  changes: ChangeEntry[];
  panelOpen: boolean;
  addChange: (change: Omit<ChangeEntry, "id" | "timestamp">) => string;
  removeChange: (id: string) => void;
  updateChange: (id: string, update: Partial<ChangeEntry>) => void;
  clearChanges: () => void;
  togglePanel: () => void;
}

export const useChangesStore = create<ChangesState>((set) => ({
  changes: [],
  panelOpen: false,

  addChange: (change) => {
    const id = crypto.randomUUID();
    const entry: ChangeEntry = {
      ...change,
      id,
      timestamp: Date.now(),
    };
    set((s) => {
      // Collapse: if a change for the same file+line already exists, replace it
      const existing = s.changes.findIndex(
        (c) => c.filePath === change.filePath && c.line === change.line
      );
      if (existing >= 0) {
        const updated = [...s.changes];
        updated[existing] = entry;
        return { changes: updated };
      }
      return { changes: [entry, ...s.changes].slice(0, 50) };
    });
    return id;
  },

  removeChange: (id) =>
    set((s) => ({ changes: s.changes.filter((c) => c.id !== id) })),

  updateChange: (id, update) =>
    set((s) => ({
      changes: s.changes.map((c) =>
        c.id === id ? { ...c, ...update } : c
      ),
    })),

  clearChanges: () => set({ changes: [] }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));
