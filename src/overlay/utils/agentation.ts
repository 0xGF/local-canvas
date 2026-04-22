/**
 * Client for the annotations API, served same-origin by the local-canvas
 * editor server at `/__canvas/annotations/*`. Replaces the former
 * agentation-mcp HTTP bridge on :6967 — annotation storage now lives in a
 * per-project sqlite file and is owned by the editor process directly.
 *
 * The public surface (post/list/hide/nav helpers) is preserved so the
 * overlay components didn't all need to change at once. The "session"
 * concept is now a no-op kept for API compat with consumers that still
 * call `getOrCreateSession()` / `currentSessionId()`.
 */

import { getEditorIframe } from "./iframe-events.js";

const BASE = "/__canvas/annotations";

export interface AnnotationThreadEntry {
  role: string;
  content: string;
  at?: number;
}

export interface Annotation {
  id: string;
  comment: string;
  element: string;
  elementPath: string;
  /** Populated when the annotation targets a group of elements (multi-select).
   *  The primary elementPath is still the first entry for back-compat with
   *  consumers that only read elementPath.
   *
   *  Agent-side convention:
   *    - If the change is per-element (e.g. "give each card the same radius"),
   *      fan out one mutation per path — reading each element's own file:line.
   *    - If the change is structural (e.g. "wrap these in a grid"), treat the
   *      paths as an ordered group and operate on the common parent / range.
   *    - Resolving one annotation should still resolve it for the entire
   *      group — don't create per-path resolution entries. */
  elementPaths?: string[];
  cssClasses?: string;
  intent?: string;
  severity?: string;
  url: string;
  timestamp: number;
  /** Epoch ms of the last server-side update — flip to resolved, thread append, etc. */
  updatedAt?: number;
  status?: "pending" | "in_progress" | "resolved" | "dismissed";
  x?: number;
  y?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  resolvedSummary?: string;
  /** Conversation history with the agent — populated server-side when an
   *  agent replies or the user adds a follow-up comment. */
  thread?: AnnotationThreadEntry[];
}

export interface PostAnnotationOpts {
  comment: string;
  element: string;
  elementPath: string;
  /** Supply when the annotation spans multiple elements — server stores the
   *  full list alongside the primary elementPath and boundingBox. */
  elementPaths?: string[];
  cssClasses?: string;
  intent?: "fix" | "change" | "question" | "undo";
  x?: number;
  y?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

/** Identity key for a page — origin + path only. Kept for history-popover
 *  use (filter "show only current-page annotations"); in-page anchor clicks
 *  and query-param tab state don't change it. */
function pageKey(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

// ── Session-concept shim ──────────────────────────────────────────────────
// The old agentation-mcp model had one session per URL. The new storage is
// project-wide and tags each annotation with its page URL directly, so the
// "session id" is synthetic — a stable token we hand out so pre-existing
// consumers (AnnotationPins, etc.) can keep their `if (!currentSessionId())
// await getOrCreateSession()` guards without a rewrite. It has no bearing
// on server state.
let _sessionId: string | null = null;

export async function getOrCreateSession(): Promise<string> {
  if (!_sessionId) _sessionId = `page_${Math.random().toString(36).slice(2, 10)}`;
  return _sessionId;
}

export function currentSessionId(): string | null {
  return _sessionId;
}

export async function postAnnotation(opts: PostAnnotationOpts): Promise<Annotation> {
  await getOrCreateSession();
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      comment: opts.comment,
      element: opts.element,
      elementPath: opts.elementPath,
      ...(opts.elementPaths && opts.elementPaths.length > 1
        ? { elementPaths: opts.elementPaths }
        : {}),
      cssClasses: opts.cssClasses,
      intent: opts.intent || "change",
      severity: "important",
      url: window.location.href,
      timestamp: Date.now(),
      // Server now treats these as optional; passing them through when known
      // keeps pins accurate.
      ...(opts.x !== undefined ? { x: opts.x } : {}),
      ...(opts.y !== undefined ? { y: opts.y } : {}),
      ...(opts.boundingBox ? { boundingBox: opts.boundingBox } : {}),
    }),
  });
  if (!res.ok) throw new Error(`annotations: ${res.status}`);
  const annotation = await res.json() as Annotation;
  // Let the pin layer and history popover know so they can refresh immediately
  // instead of waiting for their next poll tick (up to 3s delay otherwise).
  window.dispatchEvent(new CustomEvent("canvas:annotation-posted", {
    detail: { annotation },
  }));
  return annotation;
}

/** List annotations for the current page (filtered by origin + pathname).
 *  The server stores every annotation with its full URL; we filter client-side
 *  so the history popover can expose cross-page annotations later without a
 *  schema change. */
export async function listAnnotations(): Promise<Annotation[]> {
  const key = pageKey();
  const res = await fetch(`${BASE}?url=${encodeURIComponent(key)}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  // Server's `url` column is the exact URL at post time (with hash/query),
  // but we filtered by `origin + pathname`, so any hash/query variants of
  // the current page are already included.
  return data.filter((a: Annotation) =>
    `${new URL(a.url).origin}${new URL(a.url).pathname}` === key
  );
}

// ── Local "hidden" set ──
// Non-destructive hide — kept client-only so users can un-hide without a
// server round-trip. Destructive delete uses `clearAllAnnotations()` below
// or the per-row delete endpoint (not currently wired in the UI).
const HIDDEN_KEY = "canvas:hidden-annotations";

function readHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function writeHidden(set: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
    window.dispatchEvent(new CustomEvent("canvas:hidden-annotations-changed"));
  } catch { /* quota / disabled */ }
}

export function getHiddenAnnotationIds(): Set<string> {
  return readHidden();
}

export function hideAnnotation(id: string) {
  const set = readHidden();
  set.add(id);
  writeHidden(set);
}

export function unhideAnnotation(id: string) {
  const set = readHidden();
  set.delete(id);
  writeHidden(set);
}

/**
 * Hide every currently-listed annotation. Non-destructive — entries remain
 * on the server and can be brought back via `unhideAnnotation`. Returns the
 * number of annotations hidden.
 */
export async function hideAllAnnotations(): Promise<number> {
  const list = await listAnnotations();
  if (list.length === 0) return 0;
  const set = readHidden();
  for (const a of list) set.add(a.id);
  writeHidden(set);
  return list.length;
}

/** Clear the hidden set — makes previously-hidden annotations visible again. */
export function unhideAllAnnotations() {
  writeHidden(new Set());
}

/**
 * Append a message to an existing annotation's thread. Used by the pin
 * popover's follow-up input + the "Re-open" action — both are follow-ups
 * to an existing annotation, not new annotations, so they land as thread
 * entries instead of duplicating the row.
 *
 * Returns the updated annotation (with the new thread entry appended) or
 * null on failure.
 */
export async function appendAnnotationThread(
  id: string,
  content: string,
  role: "user" | "agent" = "user",
): Promise<Annotation | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/thread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
    if (!res.ok) return null;
    const updated = await res.json() as Annotation;
    window.dispatchEvent(new CustomEvent("canvas:annotation-posted", {
      detail: { annotation: updated },
    }));
    return updated;
  } catch {
    return null;
  }
}

/**
 * Flip an annotation's status server-side. Returns the updated annotation,
 * or null on failure. Used by the history popover's Dismiss / Re-open row
 * actions and by any other surface that wants to change status without
 * posting a thread reply.
 */
export async function updateAnnotationStatus(
  id: string,
  status: "pending" | "in_progress" | "resolved" | "dismissed",
  resolvedSummary?: string,
): Promise<Annotation | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(resolvedSummary ? { resolvedSummary } : {}) }),
    });
    if (!res.ok) return null;
    return await res.json() as Annotation;
  } catch {
    return null;
  }
}

/**
 * Destructive: delete every annotation in the project's sqlite store.
 * Clears the local hidden-IDs set too (those IDs are gone server-side, no
 * point tracking them). Returns the count deleted, or null on failure.
 */
export async function clearAllAnnotations(): Promise<{ deleted: number } | null> {
  try {
    const res = await fetch(BASE, { method: "DELETE" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    writeHidden(new Set());
    return { deleted: data.deleted ?? 0 };
  } catch {
    return null;
  }
}

/** @deprecated Use clearAllAnnotations. Kept as a shim so callers in flight
 *  during the agentation→annotations rename don't break. */
export async function clearAllAgentationSessions(): Promise<{ deletedAnnotations: number; sessions: number } | null> {
  const res = await clearAllAnnotations();
  if (!res) return null;
  return { deletedAnnotations: res.deleted, sessions: 0 };
}

// ── Cross-component event: open a pin's popover ──
export function dispatchOpenAnnotationPin(annotationId: string) {
  window.dispatchEvent(new CustomEvent("canvas:open-annotation-pin", {
    detail: { annotationId },
  }));
}

// ── DOM helpers shared across annotation surfaces ──

/**
 * Resolve an annotation's elementPath ("src/foo.tsx:23") to a live DOM
 * element. Searches both the test-app iframe (if present) and the host
 * document, in that order.
 */
/** All element paths an annotation targets — group paths if present, else
 *  the single primary elementPath. */
export function annotationPaths(a: Pick<Annotation, "elementPath" | "elementPaths">): string[] {
  if (a.elementPaths && a.elementPaths.length > 0) return a.elementPaths;
  if (a.elementPath && a.elementPath.includes(",")) {
    const parts = a.elementPath.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  return a.elementPath ? [a.elementPath] : [];
}

/** Resolve every elementPath on a group annotation to a live DOM element.
 *  Missing elements are skipped (the callee decides how to handle a partial
 *  result — e.g. still render a pin if at least one member is present). */
export function findAllElementsForAnnotation(
  a: Pick<Annotation, "elementPath" | "elementPaths">,
): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const p of annotationPaths(a)) {
    const el = findElementForAnnotation({ elementPath: p });
    if (el) out.push(el);
  }
  return out;
}

export function findElementForAnnotation(a: Pick<Annotation, "elementPath">): HTMLElement | null {
  if (!a.elementPath) return null;
  const lastColon = a.elementPath.lastIndexOf(":");
  if (lastColon < 0) return null;
  const file = a.elementPath.slice(0, lastColon);
  const line = a.elementPath.slice(lastColon + 1);
  const sel = `[data-source-file="${CSS.escape(file)}"][data-source-line="${CSS.escape(line)}"]`;

  const iframe = getEditorIframe();
  const docs: Document[] = [];
  if (iframe?.contentDocument) docs.push(iframe.contentDocument);
  docs.push(document);

  for (const doc of docs) {
    try {
      const el = doc.querySelector(sel) as HTMLElement | null;
      if (el) return el;
    } catch { /* ignore invalid selectors */ }
  }
  return null;
}

/**
 * Scroll the annotation's target element into view (centered) and open its
 * pin popover. No-op if the element can't be found on the current page.
 */
export function scrollToAndOpenAnnotation(a: Pick<Annotation, "id" | "elementPath">) {
  const el = findElementForAnnotation(a);
  if (el) {
    try { el.scrollIntoView({ behavior: "smooth", block: "center" }); }
    catch { el.scrollIntoView(); }
  }
  // Dispatch even if element wasn't found — AnnotationPins will pick it up
  // on the next position tick if it becomes available.
  dispatchOpenAnnotationPin(a.id);
}

/**
 * Scroll the annotation's target element into view and focus (highlight) the
 * pin without opening the popover. Used by keyboard navigation.
 */
export function scrollToAndFocusAnnotation(a: Pick<Annotation, "id" | "elementPath">) {
  const el = findElementForAnnotation(a);
  if (el) {
    try { el.scrollIntoView({ behavior: "smooth", block: "center" }); }
    catch { el.scrollIntoView(); }
  }
  window.dispatchEvent(new CustomEvent("canvas:focus-annotation-pin", {
    detail: { annotationId: a.id },
  }));
}

// ── Keyboard-triggered navigation + popover toggles ──

export type PinNavDirection = "prev" | "next" | "first" | "last";

/**
 * Ask the AnnotationPins layer to jump to another pin on the current page.
 * "prev"/"next" move relative to the currently-open pin, or pick first/last
 * if no pin is open.
 */
export function dispatchNavigatePin(direction: PinNavDirection) {
  window.dispatchEvent(new CustomEvent("canvas:navigate-pin", {
    detail: { direction },
  }));
}

/** Toggle the toolbar Ask AI history popover (bound to the `h` shortcut). */
export function dispatchToggleAIHistory() {
  window.dispatchEvent(new CustomEvent("canvas:toggle-ai-history"));
}

// ── Agent-undo (snapshot + restore for agent-driven edits) ──
// These talk to the local-canvas editor server (same origin as the overlay),
// not the annotations API.

export interface AgentUndoEntry {
  annotationId: string;
  createdAt: string;
  summary?: string;
  files: string[];
}

/** List snapshots the editor server currently holds, newest first. */
export async function listAgentUndoEntries(): Promise<AgentUndoEntry[]> {
  try {
    const res = await fetch("/__canvas/agent-undo");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Restore the files for a given annotation. Returns the restored path list
 *  on success, or null if no snapshot exists / the request failed. */
export async function undoAgentChange(annotationId: string): Promise<{ restored: string[]; summary?: string } | null> {
  try {
    const res = await fetch("/__canvas/agent-undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotationId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return { restored: data.restored, summary: data.summary };
  } catch {
    return null;
  }
}
