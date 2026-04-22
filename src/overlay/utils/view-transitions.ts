import { getIframeDocument } from "./iframe-events.js";

// A scoped name keeps the animation on the mutated element. Without it, the
// browser falls back to the root group (whole-doc cross-fade), which reads as
// a flash across unrelated content during small edits. The counter ensures
// overlapping transitions on different elements don't collide (view-transition-
// name must be unique per document).
let vtCounter = 0;
const vtNameFor = () => `canvas-mutation-${++vtCounter}`;

export function viewTransitionsSupported(): boolean {
  const doc = getIframeDocument();
  return typeof doc?.startViewTransition === "function";
}

/**
 * Wrap a DOM-mutating async action in the iframe document's view transition.
 * `mutate` must resolve only after the target DOM state has landed (typically
 * after HMR applies). The browser snapshots before the call, runs `mutate`,
 * snapshots after, and cross-fades between them.
 *
 * Falls through to a plain `mutate()` when:
 *   - the iframe document doesn't support the API
 *   - the target element isn't supplied (no safe way to scope the transition)
 */
export async function withViewTransition<T>(
  targetEl: HTMLElement | null,
  mutate: () => Promise<T>,
): Promise<T> {
  const iframeDoc = getIframeDocument();
  if (typeof iframeDoc?.startViewTransition !== "function" || !targetEl || !targetEl.isConnected) {
    return mutate();
  }

  const prevName = targetEl.style.getPropertyValue("view-transition-name");
  targetEl.style.setProperty("view-transition-name", vtNameFor());

  let result: T;
  let mutateError: unknown;
  try {
    const transition = iframeDoc.startViewTransition(async () => {
      try {
        result = await mutate();
      } catch (err) {
        mutateError = err;
      }
    });
    await transition.finished.catch(() => {
      // Transition was skipped (e.g. another VT started); mutate still ran.
    });
  } finally {
    if (prevName) {
      targetEl.style.setProperty("view-transition-name", prevName);
    } else {
      targetEl.style.removeProperty("view-transition-name");
    }
  }

  if (mutateError) throw mutateError;
  return result!;
}
