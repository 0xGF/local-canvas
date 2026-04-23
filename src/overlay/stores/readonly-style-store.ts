import { create } from "zustand";

/**
 * Tracks which edits the source-writer has refused on a given element:
 *   - Per-property style entries: `${filePath}:${line}:${property}` →
 *     error. Caught from `modify-style` failures on template-literal
 *     values, ternaries, identifier values, spreads without a literal
 *     portion, etc.
 *   - Whole-element className read-only: `${filePath}:${line}` in
 *     `classReadonly`. Caught from `modify-class` failures when the
 *     className expression is dynamic (interpolating template literal,
 *     plain identifier, ternary, function call without a string arg).
 *
 * Populated on the fly from WS mutation-result failures so the
 * PropertiesPanel can surface the element as read-only without a
 * separate round-trip. Session-only; cleared on reload.
 */
interface ReadonlyStyleState {
  entries: Record<string, string>; // property-level: key = `${filePath}:${line}:${property}`
  classReadonly: Record<string, string>; // whole-className: key = `${filePath}:${line}` → error msg
  mark: (filePath: string, line: number, property: string, error: string) => void;
  markClassReadonly: (filePath: string, line: number, error: string) => void;
  clear: (filePath: string, line: number) => void;
  hasEntriesFor: (filePath: string, line: number) => boolean;
  isClassReadonly: (filePath: string, line: number) => boolean;
  classReadonlyError: (filePath: string, line: number) => string | undefined;
}

export const useReadonlyStyleStore = create<ReadonlyStyleState>((set, get) => ({
  entries: {},
  classReadonly: {},
  mark: (filePath, line, property, error) => {
    const key = `${filePath}:${line}:${property}`;
    set((s) => ({ entries: { ...s.entries, [key]: error } }));
  },
  markClassReadonly: (filePath, line, error) => {
    const key = `${filePath}:${line}`;
    set((s) => ({ classReadonly: { ...s.classReadonly, [key]: error } }));
  },
  clear: (filePath, line) => {
    const propPrefix = `${filePath}:${line}:`;
    const classKey = `${filePath}:${line}`;
    set((s) => {
      const nextEntries: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.entries)) {
        if (!k.startsWith(propPrefix)) nextEntries[k] = v;
      }
      const nextClass = { ...s.classReadonly };
      delete nextClass[classKey];
      return { entries: nextEntries, classReadonly: nextClass };
    });
  },
  hasEntriesFor: (filePath, line) => {
    const prefix = `${filePath}:${line}:`;
    return Object.keys(get().entries).some((k) => k.startsWith(prefix));
  },
  isClassReadonly: (filePath, line) => {
    return Boolean(get().classReadonly[`${filePath}:${line}`]);
  },
  classReadonlyError: (filePath, line) => {
    return get().classReadonly[`${filePath}:${line}`];
  },
}));
