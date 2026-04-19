import { create } from "zustand";

/**
 * Tracks which `style={{}}` properties the source-writer has refused to
 * mutate on a given element — template-literal values, ternaries,
 * identifier values, object spreads without a literal portion, etc.
 *
 * Populated from `modify-style` mutation failures so the PropertiesPanel
 * can flag the element as partially read-only without needing its own
 * server round-trip. Session-only; cleared on reload.
 */
interface ReadonlyStyleState {
  // key = `${filePath}:${line}:${property}`
  entries: Record<string, string>; // value = error message
  mark: (filePath: string, line: number, property: string, error: string) => void;
  clear: (filePath: string, line: number) => void;
  hasEntriesFor: (filePath: string, line: number) => boolean;
}

export const useReadonlyStyleStore = create<ReadonlyStyleState>((set, get) => ({
  entries: {},
  mark: (filePath, line, property, error) => {
    const key = `${filePath}:${line}:${property}`;
    set((s) => ({ entries: { ...s.entries, [key]: error } }));
  },
  clear: (filePath, line) => {
    const prefix = `${filePath}:${line}:`;
    set((s) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.entries)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return { entries: next };
    });
  },
  hasEntriesFor: (filePath, line) => {
    const prefix = `${filePath}:${line}:`;
    return Object.keys(get().entries).some((k) => k.startsWith(prefix));
  },
}));
