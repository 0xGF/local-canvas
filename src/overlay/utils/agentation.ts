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
  cssClasses?: string;
  intent?: "fix" | "change" | "question" | "undo";
  x?: number;
  y?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

let _sessionId: string | null = null;
let _sessionUrl: string | null = null;

/** Get the current session id, or create one for the current page URL. */
export async function getOrCreateSession(): Promise<string> {
  if (_sessionId && _sessionUrl === window.location.href) return _sessionId;
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: window.location.href }),
  });
  if (!res.ok) throw new Error(`agentation: ${res.status}`);
  const session = await res.json();
  _sessionId = session.id;
  _sessionUrl = window.location.href;
  return session.id;
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
