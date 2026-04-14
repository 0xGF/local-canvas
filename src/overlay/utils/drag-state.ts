/**
 * Global drag state — prevents click handlers from firing after a drag ends.
 * Any drag hook sets lastDragEnd on mouseup. Click handlers check it to
 * skip selection changes that would deselect the dragged element.
 */
let lastDragEnd = 0;

/** Call this when any drag operation ends (mouseup after move). */
export function markDragEnd(): void {
  lastDragEnd = performance.now();
}

/** Returns true if a drag ended within the given ms window (default 200ms). */
export function wasDragRecent(withinMs = 200): boolean {
  return performance.now() - lastDragEnd < withinMs;
}
