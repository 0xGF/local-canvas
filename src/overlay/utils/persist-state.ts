/**
 * Lightweight localStorage persistence for Zustand stores.
 * Avoids the built-in `persist` middleware because our stores contain
 * non-serializable DOM refs and need careful restore ordering.
 */

const PREFIX = "local-canvas:";
const activeSyncs = new Set<string>();

/**
 * Subscribe to a Zustand store and debounce-write selected keys to localStorage.
 */
export function syncToStorage<S extends object>(
  store: { getState: () => S; subscribe: (cb: (state: S) => void) => () => void },
  keys: (keyof S)[],
  storageKey: string,
  debounceMs = 300,
) {
  const fullKey = PREFIX + storageKey;
  if (activeSyncs.has(fullKey)) return;
  activeSyncs.add(fullKey);

  let timer: ReturnType<typeof setTimeout>;
  store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const state = store.getState();
        const partial: Record<string, unknown> = {};
        for (const k of keys) partial[k as string] = state[k];
        localStorage.setItem(fullKey, JSON.stringify(partial));
      } catch { /* quota exceeded or private browsing — ignore */ }
    }, debounceMs);
  });
}

/**
 * Read and parse saved state from localStorage.
 * Returns null on missing/corrupted data.
 */
export function readFromStorage<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
