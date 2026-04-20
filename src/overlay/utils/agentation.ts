/**
 * Lightweight client for the agentation-mcp HTTP API (default port 4747).
 *
 * Shared between the "Ask AI..." flow in ContextMenu and the AnnotationPins
 * overlay so both use the same session and stay in sync.
 */

import { getEditorIframe } from "./iframe-events.js";

const AGENTATION_PORT = 6967;
const BASE = `http://localhost:${AGENTATION_PORT}`;

export interface AnnotationThreadEntry {
  role: string;
  content: string;
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
  status?: "pending" | "resolved" | "dismissed";
  x?: number;
  y?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  resolvedSummary?: string;
  /** Conversation history with the agent — populated by the agentation server. */
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

let _sessionId: string | null = null;
let _sessionUrl: string | null = null;
let _sessionPromise: Promise<string> | null = null;

/** Identity key for a page — origin + path only. Intentionally ignores
 *  hash and query params so in-page anchor clicks, tab-state query strings,
 *  and routed SPAs don't each spawn a new session for every micro-navigation.
 *  Without this, posting an annotation goes to session A while the history
 *  popover polls session B, and the user sees an empty list even though the
 *  server has their annotation. */
function sessionKey(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Get the current session id, or create one for the current page.
 *  Requests in flight share the same in-flight promise so rapid-fire callers
 *  (AnnotationPins + AskAIHistory mounting at the same time, a click handler
 *  racing a poll tick) don't each open their own session against the server. */
export async function getOrCreateSession(): Promise<string> {
  const key = sessionKey();
  if (_sessionId && _sessionUrl === key) return _sessionId;
  if (_sessionPromise) return _sessionPromise;
  _sessionPromise = (async () => {
    const res = await fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: key }),
    });
    if (!res.ok) throw new Error(`agentation: ${res.status}`);
    const session = await res.json();
    _sessionId = session.id;
    _sessionUrl = key;
    return session.id;
  })().finally(() => { _sessionPromise = null; });
  return _sessionPromise;
}

/** Returns the current session id without creating one. */
export function currentSessionId(): string | null {
  return _sessionId;
}

export async function postAnnotation(opts: PostAnnotationOpts): Promise<Annotation> {
  const sessionId = await getOrCreateSession();
  const res = await fetch(`${BASE}/sessions/${sessionId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      comment: opts.comment,
      element: opts.element,
      elementPath: opts.elementPath,
      // Only include elementPaths for actual groups so single-element
      // annotations stay wire-compatible with the old payload shape.
      ...(opts.elementPaths && opts.elementPaths.length > 1
        ? { elementPaths: opts.elementPaths }
        : {}),
      cssClasses: opts.cssClasses,
      intent: opts.intent || "change",
      severity: "important",
      url: window.location.href,
      timestamp: Date.now(),
      // NOT NULL constraints on the server
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      boundingBox: opts.boundingBox ?? { x: 0, y: 0, width: 0, height: 0 },
    }),
  });
  if (!res.ok) throw new Error(`agentation: ${res.status}`);
  const annotation = await res.json() as Annotation;
  // Let the pin layer and history popover know so they can refresh immediately
  // instead of waiting for their next poll tick (up to 3s delay otherwise).
  window.dispatchEvent(new CustomEvent("canvas:annotation-posted", {
    detail: { annotation },
  }));
  return annotation;
}

/** List annotations for the current session. */
export async function listAnnotations(): Promise<Annotation[]> {
  if (!_sessionId) return [];
  const res = await fetch(`${BASE}/sessions/${_sessionId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.annotations) ? data.annotations : [];
}

// ── Local "hidden" set ──
// The agentation HTTP API doesn't expose delete/dismiss endpoints (only the
// MCP server does), so we keep a localStorage-backed set of annotation IDs the
// user has chosen to hide from their queue.
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
 *  the single primary elementPath. The elementPaths field is the canonical
 *  source, but we also accept a comma-joined string in elementPath as a
 *  fallback for servers that strip unknown fields (the agentation-mcp HTTP
 *  schema doesn't know about elementPaths yet). Empty array if neither is
 *  set. */
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

/** Toggle the toolbar Ask AI history popover (for the `g h` keyboard chord). */
export function dispatchToggleAIHistory() {
  window.dispatchEvent(new CustomEvent("canvas:toggle-ai-history"));
}

// ── Agent-undo (snapshot + restore for agent-driven edits) ──
// These talk to the local-canvas editor server (same origin as the overlay),
// not the agentation HTTP API.

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

/** Dev-only: pretend an agent just edited the file an annotation targets.
 *  The server snapshots the current content, then prepends a visible marker
 *  line so the user can watch Undo restore it. */
export async function simulateAgentEdit(annotationId: string, filePath: string): Promise<boolean> {
  try {
    const res = await fetch("/__canvas/agent-simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotationId, filePath }),
    });
    return res.ok;
  } catch {
    return false;
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
