import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X } from "./icons.js";
import { THEME } from "../theme.js";
import { popoverEmerge } from "../utils/motion-presets.js";
import { EASE, DURATION } from "../utils/easings.js";
import {
  listAnnotations,
  postAnnotation,
  currentSessionId,
  getOrCreateSession,
  getHiddenAnnotationIds,
  hideAnnotation,
  findElementForAnnotation,
  scrollToAndOpenAnnotation,
  type Annotation,
  type PinNavDirection,
} from "../utils/agentation.js";
import { useEditorStore } from "../stores/editor-store.js";
import { measureText } from "../utils/style-cache.js";
import { getEditorIframe } from "../utils/iframe-events.js";

const C = THEME;

// Yellow to match the AI/sparkles badge in the toolbar
const PIN_YELLOW = "#ffb800";
const PIN_YELLOW_DARK = "#e0a200";
const PIN_GREEN = "#14ae5c";
const PIN_GREEN_DARK = "#0f9a4d";
const PIN_GREY = "#6b6b6b";
const PIN_GREY_DARK = "#555";
const PIN_SIZE = 20;
const CLUSTER_DISTANCE = PIN_SIZE * 1.5;

interface PinPosition {
  annotation: Annotation;
  x: number; // viewport coords (pin center)
  y: number;
  elementRect: { left: number; top: number; width: number; height: number };
  tagName: string;
}

/** Pick the corner with most empty space around it to avoid covering content. */
function pickBestCorner(
  elRect: { left: number; top: number; width: number; height: number },
  existingPins: PinPosition[],
): { x: number; y: number } {
  const pad = PIN_SIZE / 2 + 4;
  const corners = [
    { x: elRect.left + elRect.width + pad,  y: elRect.top - pad },           // top-right (default)
    { x: elRect.left - pad,                  y: elRect.top - pad },           // top-left
    { x: elRect.left + elRect.width + pad,  y: elRect.top + elRect.height + pad }, // bottom-right
    { x: elRect.left - pad,                  y: elRect.top + elRect.height + pad }, // bottom-left
  ];

  let best = corners[0];
  let bestScore = -Infinity;

  for (const c of corners) {
    // Prefer corners inside the viewport
    let score = 0;
    if (c.x > PIN_SIZE && c.x < window.innerWidth - PIN_SIZE) score += 50;
    if (c.y > PIN_SIZE && c.y < window.innerHeight - PIN_SIZE) score += 50;

    // Penalise proximity to existing pins
    for (const p of existingPins) {
      const dist = Math.hypot(p.x - c.x, p.y - c.y);
      if (dist < CLUSTER_DISTANCE * 2) score -= (CLUSTER_DISTANCE * 2 - dist);
    }

    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Compute the pin position (viewport coords) for an element. */
function computePinPosition(el: HTMLElement, a: Annotation, existingPins: PinPosition[]): PinPosition | null {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  // If element lives in iframe, translate coords to parent viewport.
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  const iframe = getEditorIframe();
  if (iframe && iframe.contentDocument && el.ownerDocument === iframe.contentDocument) {
    const ir = iframe.getBoundingClientRect();
    const naturalW = parseInt(iframe.style.width) || ir.width;
    scale = ir.width / naturalW;
    offsetX = ir.left;
    offsetY = ir.top;
  }

  const left = rect.left * scale + offsetX;
  const top = rect.top * scale + offsetY;
  const width = rect.width * scale;
  const height = rect.height * scale;
  const elRect = { left, top, width, height };

  const { x, y } = pickBestCorner(elRect, existingPins);

  return { annotation: a, x, y, elementRect: elRect, tagName: el.tagName.toLowerCase() };
}

/** Get pin colors based on annotation status. */
function pinColors(status: string | undefined): { bg: string; bgHover: string } {
  if (status === "resolved") return { bg: PIN_GREEN, bgHover: PIN_GREEN_DARK };
  if (status === "dismissed") return { bg: PIN_GREY, bgHover: PIN_GREY_DARK };
  return { bg: PIN_YELLOW, bgHover: PIN_YELLOW_DARK };
}

interface PinProps {
  position: PinPosition;
  number: number;
  isOpen: boolean;
  isNew: boolean;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
  onDismiss: () => void;
  isHovered: boolean;
}

const Pin = React.memo(function Pin({ position, number, isOpen, isNew, onClick, onHover, onDismiss, isHovered }: PinProps) {
  const status = position.annotation.status;
  const colors = pinColors(status);

  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: "fixed",
        left: position.x - PIN_SIZE / 2,
        top: position.y - PIN_SIZE / 2,
        width: PIN_SIZE, height: PIN_SIZE,
        borderRadius: "50%",
        background: isHovered || isOpen ? colors.bgHover : colors.bg,
        border: "none",
        color: "#000",
        fontSize: 10, fontWeight: 700, fontFamily: C.font,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)",
        zIndex: 2147483646,
        transition: `background ${DURATION.small}ms ${EASE.snappy}, transform ${DURATION.small}ms ${EASE.snappy}`,
        transform: isHovered ? "scale(1.08)" : "scale(1)",
        pointerEvents: "auto",
        padding: 0,
        animation: isNew ? "canvasPinPulse 2s ease-out" : undefined,
      }}
      title={`${position.annotation.comment}\nRight-click to dismiss`}
    >
      {isHovered ? <Pencil size={10} /> : number}
    </button>
  );
});

interface PinHighlightProps {
  rect: { left: number; top: number; width: number; height: number };
}

const PinHighlight = React.memo(function PinHighlight({ rect }: PinHighlightProps) {
  return (
    <div style={{
      position: "fixed",
      left: rect.left, top: rect.top,
      width: rect.width, height: rect.height,
      border: `1px solid ${PIN_YELLOW}`,
      borderRadius: 3,
      background: "rgba(255, 184, 0, 0.06)",
      pointerEvents: "none",
      zIndex: 2147483645,
    }} />
  );
});

interface PinPopoverProps {
  position: PinPosition;
  onClose: () => void;
  onSent: () => void;
}

interface ThreadEntry { role: string; content: string; timestamp?: number }

/** Colour for a status badge / thread message bubble. */
function statusColor(status: string | undefined) {
  if (status === "resolved") return { bg: "rgba(50,205,110,0.18)", fg: "#6dd58a" };
  if (status === "dismissed") return { bg: "rgba(255,255,255,0.08)", fg: "rgba(255,255,255,0.55)" };
  return { bg: "rgba(255,184,0,0.18)", fg: PIN_YELLOW };
}

const PinPopover = React.memo(function PinPopover({ position, onClose, onSent }: PinPopoverProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const status = position.annotation.status ?? "pending";
  const isResolved = status === "resolved" || status === "dismissed";
  const thread = ((position.annotation as unknown as { thread?: ThreadEntry[] }).thread) || [];

  useEffect(() => {
    if (!isResolved) inputRef.current?.focus();
  }, [isResolved]);

  const send = useCallback(async (opts: { reopen?: boolean } = {}) => {
    const prompt = opts.reopen
      ? `Re-opening: ${position.annotation.comment}`
      : text.trim();
    if (!prompt || sending) return;
    setSending(true);
    try {
      await postAnnotation({
        comment: prompt,
        element: position.annotation.element,
        elementPath: position.annotation.elementPath,
        cssClasses: position.annotation.cssClasses,
        intent: "change",
        x: Math.round(position.elementRect.left + position.elementRect.width / 2),
        y: Math.round(position.elementRect.top + position.elementRect.height / 2),
        boundingBox: {
          x: Math.round(position.elementRect.left),
          y: Math.round(position.elementRect.top),
          width: Math.round(position.elementRect.width),
          height: Math.round(position.elementRect.height),
        },
      });
      useEditorStore.getState().showToast(opts.reopen ? "Re-opened" : "Sent to agent");
      onSent();
    } catch {
      useEditorStore.getState().showToast("Send failed");
    } finally {
      setSending(false);
    }
  }, [text, sending, position, onSent]);

  const popoverWidth = 260;

  // Header fits: tag chip + comment + (optional) status badge + close button.
  // Budget for the comment text is the popover's inner width minus everything
  // else. pretext lets us measure the comment without hitting the DOM so we
  // can both size the popover correctly up-front and know whether to clamp.
  const HEADER_HORIZONTAL_PAD = 8 * 2;                  // popover padding
  const HEADER_LEADING_GAP = 8 + 6 + 5;                 // "h1:" + gaps
  const HEADER_TRAILING_GAP = 11 + 4 + (isResolved ? 58 : 0); // close + badge
  const commentMaxWidth = Math.max(60, popoverWidth - HEADER_HORIZONTAL_PAD - HEADER_LEADING_GAP - HEADER_TRAILING_GAP);
  const HEADER_FONT = "italic 11px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
  const HEADER_LINE_HEIGHT = 15;
  const quoted = `"${position.annotation.comment}"`;
  const measured = measureText(quoted, HEADER_FONT, commentMaxWidth, HEADER_LINE_HEIGHT);
  const HEADER_MAX_LINES = 2;
  const clamped = measured.lineCount > HEADER_MAX_LINES;
  const headerTextLines = Math.min(measured.lineCount, HEADER_MAX_LINES);
  const headerTextHeight = headerTextLines * HEADER_LINE_HEIGHT;

  // Rough height budget for the rest of the popover (thread bubbles, textarea
  // or Re-open row, action buttons). Don't need to be exact — only used for
  // flipping the popover above/below the element when there isn't room.
  const threadHeight = thread.length > 0 ? Math.min(160, thread.length * 44) + 6 : 0;
  const bodyHeight = isResolved ? 32 : 48 /* textarea */ + 24 /* action row */;
  const popoverHeight = 8 /* top padding */ + headerTextHeight + 6 /* gap */ + threadHeight + bodyHeight + 8 /* bottom padding */;

  // Position below the element by default; if no room, above
  const elemBottom = position.elementRect.top + position.elementRect.height;
  let popX = position.elementRect.left;
  let popY = elemBottom + 12;
  if (popY + popoverHeight > window.innerHeight - 8) {
    popY = Math.max(8, position.elementRect.top - popoverHeight - 12);
  }
  if (popX + popoverWidth > window.innerWidth - 8) {
    popX = Math.max(8, window.innerWidth - popoverWidth - 8);
  }

  return (
    <motion.div
      initial={popoverEmerge.initial}
      animate={popoverEmerge.animate}
      exit={popoverEmerge.exit}
      transition={popoverEmerge.transition}
      style={{
        position: "fixed",
        left: popX, top: popY,
        width: popoverWidth,
        background: "#1a1a1a",
        border: "none",
        borderRadius: 8,
        boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        zIndex: 2147483647,
        padding: 8,
        fontFamily: C.font,
        pointerEvents: "auto",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 6,
        fontSize: 11, lineHeight: `${HEADER_LINE_HEIGHT}px`,
        color: "rgba(255,255,255,0.55)",
      }}>
        <span style={{ fontWeight: 600, flexShrink: 0 }}>{position.tagName}:</span>
        <span style={{
          flex: 1, fontStyle: "italic",
          // pretext told us whether the text actually overflows at this width.
          // If it does, clamp to 2 lines with ellipsis; if not, let it render
          // naturally (no unnecessary CSS ellipsis computation).
          display: clamped ? "-webkit-box" : "block",
          WebkitBoxOrient: clamped ? "vertical" : undefined,
          WebkitLineClamp: clamped ? HEADER_MAX_LINES : undefined,
          overflow: clamped ? "hidden" : "visible",
          overflowWrap: "break-word",
          wordBreak: "break-word",
        } as React.CSSProperties} title={clamped ? position.annotation.comment : undefined}>
          {quoted}
        </span>
        {isResolved && (() => {
          const c = statusColor(status);
          return (
            <span style={{
              background: c.bg, color: c.fg,
              fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
              padding: "1px 6px", borderRadius: 8,
              textTransform: "uppercase", flexShrink: 0,
            }}>
              {status}
            </span>
          );
        })()}
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.5)",
            cursor: "pointer", padding: 0, display: "flex",
          }}
        >
          <X size={11} />
        </button>
      </div>

      {thread.length > 0 && (
        <div style={{
          maxHeight: 160, overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 4,
          marginBottom: 6,
        }}>
          {thread.map((entry, i) => {
            const isAgent = entry.role === "agent";
            return (
              <div key={i} style={{
                alignSelf: isAgent ? "flex-start" : "flex-end",
                maxWidth: "88%",
                background: isAgent ? "rgba(109,213,138,0.12)" : "rgba(255,255,255,0.08)",
                color: isAgent ? "#cfeeda" : "rgba(255,255,255,0.85)",
                fontSize: 10, lineHeight: 1.4,
                padding: "4px 8px", borderRadius: 6,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                <div style={{ fontSize: 8, opacity: 0.6, marginBottom: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {isAgent ? "agent" : entry.role}
                </div>
                {entry.content}
              </div>
            );
          })}
        </div>
      )}

      {isResolved ? (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 2 }}>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none",
              color: "rgba(255,255,255,0.55)", fontSize: 10,
              padding: "3px 8px", borderRadius: 4, cursor: "pointer",
              fontFamily: C.font,
            }}
          >
            Close
          </button>
          <button
            onClick={() => send({ reopen: true })}
            disabled={sending}
            style={{
              background: sending ? "rgba(255,255,255,0.08)" : PIN_YELLOW,
              color: sending ? "rgba(255,255,255,0.4)" : "#000",
              border: "none", borderRadius: 4,
              padding: "3px 12px", fontSize: 10, fontWeight: 700,
              cursor: sending ? "default" : "pointer",
              fontFamily: C.font,
            }}
            title="Post a new annotation referencing this one"
          >
            {sending ? "Re-opening…" : "Re-open"}
          </button>
        </div>
      ) : (
        <>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                e.preventDefault();
                send();
              }
              if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            placeholder="Add a follow-up..."
            rows={2}
            style={{
              width: "100%",
              minHeight: 48,
              background: "#262626",
              border: "none",
              borderRadius: 5,
              color: "#fff", fontSize: 11, fontFamily: C.font,
              padding: "6px 8px", outline: "none", boxSizing: "border-box",
              resize: "vertical", lineHeight: 1.35,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6 }}>
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "none",
                color: "rgba(255,255,255,0.55)", fontSize: 10,
                padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                fontFamily: C.font,
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => send()}
              disabled={!text.trim() || sending}
              style={{
                background: text.trim() && !sending ? PIN_YELLOW : "rgba(255,255,255,0.08)",
                color: text.trim() && !sending ? "#000" : "rgba(255,255,255,0.4)",
                border: "none", borderRadius: 4,
                padding: "3px 12px", fontSize: 10, fontWeight: 700,
                cursor: text.trim() && !sending ? "pointer" : "default",
                fontFamily: C.font,
              }}
            >
              {sending ? "Sending…" : "Add"}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
});

// ── Clustering ──

interface Cluster {
  pins: PinPosition[];
  x: number;
  y: number;
}

/** Group pins that are within CLUSTER_DISTANCE into clusters. */
function clusterPins(pins: PinPosition[]): { singles: PinPosition[]; clusters: Cluster[] } {
  const clustered = new Set<number>();
  const clusters: Cluster[] = [];

  for (let i = 0; i < pins.length; i++) {
    if (clustered.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < pins.length; j++) {
      if (clustered.has(j)) continue;
      const close = group.some(gi => Math.hypot(pins[gi].x - pins[j].x, pins[gi].y - pins[j].y) < CLUSTER_DISTANCE);
      if (close) group.push(j);
    }
    if (group.length >= 3) {
      for (const idx of group) clustered.add(idx);
      const clusterPinsList = group.map(idx => pins[idx]);
      const cx = clusterPinsList.reduce((s, p) => s + p.x, 0) / clusterPinsList.length;
      const cy = clusterPinsList.reduce((s, p) => s + p.y, 0) / clusterPinsList.length;
      clusters.push({ pins: clusterPinsList, x: cx, y: cy });
    }
  }

  const singles = pins.filter((_, i) => !clustered.has(i));
  return { singles, clusters };
}

const ClusterPin = React.memo(function ClusterPin({ cluster, onClick, isExpanded }: {
  cluster: Cluster; onClick: () => void; isExpanded: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        left: cluster.x - PIN_SIZE / 2 - 2,
        top: cluster.y - PIN_SIZE / 2 - 2,
        width: PIN_SIZE + 4, height: PIN_SIZE + 4,
        borderRadius: "50%",
        background: hovered || isExpanded ? PIN_YELLOW_DARK : PIN_YELLOW,
        border: "2px solid rgba(0,0,0,0.15)",
        color: "#000",
        fontSize: 10, fontWeight: 800, fontFamily: C.font,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
        zIndex: 2147483646,
        transition: "all 0.12s ease",
        transform: hovered ? "scale(1.1)" : "scale(1)",
        pointerEvents: "auto",
        padding: 0,
      }}
      title={`${cluster.pins.length} annotations — click to expand`}
    >
      {cluster.pins.length}
    </button>
  );
});

/**
 * Renders agentation-style numbered pins on the page for each pending
 * annotation. Hover → pencil icon. Click → popover for follow-up.
 */
export const AnnotationPins = React.memo(function AnnotationPins() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [positions, setPositions] = useState<PinPosition[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenAnnotationIds());
  const [expandedClusterIdx, setExpandedClusterIdx] = useState<number | null>(null);

  // Track which annotation IDs we've already seen, so new ones get a pulse
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Poll annotations from server every 3s.
  // Keep all statuses on the current page — the render loop filters to
  // pending-only for pins, but we need resolved/dismissed entries in memory
  // so history-row clicks can open their popovers with thread history.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        if (!currentSessionId()) await getOrCreateSession();
        const list = await listAnnotations();
        if (cancelled) return;
        const filtered = list;
        // Detect newly appeared annotations for the pulse effect
        const freshIds = new Set<string>();
        for (const a of filtered) {
          if (!seenIdsRef.current.has(a.id)) freshIds.add(a.id);
          seenIdsRef.current.add(a.id);
        }
        if (freshIds.size > 0) {
          setNewIds(prev => new Set([...prev, ...freshIds]));
          setTimeout(() => {
            setNewIds(prev => {
              const next = new Set(prev);
              for (const id of freshIds) next.delete(id);
              return next;
            });
          }, 2000);
        }
        setAnnotations(filtered);
      } catch { /* ignore */ }
    }
    refresh();
    const id = setInterval(refresh, 3000);
    // Refresh immediately when an annotation is posted so the pin shows up
    // without waiting for the next 3s tick.
    window.addEventListener("canvas:annotation-posted", refresh);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("canvas:annotation-posted", refresh);
    };
  }, []);

  // Sync with localStorage hidden-set (updated from toolbar history rows)
  useEffect(() => {
    function onChange() { setHiddenIds(getHiddenAnnotationIds()); }
    window.addEventListener("canvas:hidden-annotations-changed", onChange);
    return () => window.removeEventListener("canvas:hidden-annotations-changed", onChange);
  }, []);

  // Recompute pin positions every frame (cheap for small N).
  // Pins render for PENDING annotations only — resolved/dismissed don't
  // get a pin but can still be opened via the history popover or nav.
  useEffect(() => {
    let raf = 0;
    function tick() {
      const next: PinPosition[] = [];
      for (const a of annotations) {
        if (hiddenIds.has(a.id)) continue;
        const el = findElementForAnnotation(a);
        if (!el) continue;
        const pos = computePinPosition(el, a, next);
        if (pos) next.push(pos);
      }
      // Sort by annotation timestamp so pin numbers are stable across frames
      next.sort((a, b) => a.annotation.timestamp - b.annotation.timestamp);
      setPositions(next);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [annotations, hiddenIds]);

  // Listen for cross-component requests to open a pin (e.g. clicking a row
  // in the toolbar Ask AI history). If the annotation isn't currently in our
  // set of pins (e.g. resolved/dismissed, or not yet loaded), we still set
  // openId so that when the annotation appears on the next poll it opens.
  useEffect(() => {
    function onOpenRequest(e: Event) {
      const id = (e as CustomEvent<{ annotationId: string }>).detail?.annotationId;
      if (id) setOpenId(id);
    }
    window.addEventListener("canvas:open-annotation-pin", onOpenRequest);
    return () => window.removeEventListener("canvas:open-annotation-pin", onOpenRequest);
  }, []);

  // Keep latest positions + openId in refs so the navigate listener below
  // doesn't re-attach every frame.
  const positionsRef = useRef<PinPosition[]>([]);
  const openIdRef = useRef<string | null>(null);
  positionsRef.current = positions;
  openIdRef.current = openId;

  // Listen for keyboard-triggered pin navigation (`[` / `]`).
  useEffect(() => {
    function onNavigate(e: Event) {
      const direction = (e as CustomEvent<{ direction: PinNavDirection }>).detail?.direction;
      if (!direction) return;
      // Sort pins by vertical position so "next" moves down the page.
      const ordered = [...positionsRef.current].sort((a, b) => a.y - b.y);
      if (ordered.length === 0) return;

      let target: PinPosition | undefined;
      if (direction === "first") target = ordered[0];
      else if (direction === "last") target = ordered[ordered.length - 1];
      else {
        const currentIdx = openIdRef.current
          ? ordered.findIndex(p => p.annotation.id === openIdRef.current)
          : -1;
        if (currentIdx === -1) {
          // Nothing open — seed with the natural endpoint for the direction.
          target = direction === "next" ? ordered[0] : ordered[ordered.length - 1];
        } else {
          const nextIdx = direction === "next" ? currentIdx + 1 : currentIdx - 1;
          // Wrap around so repeated presses cycle.
          const wrapped = ((nextIdx % ordered.length) + ordered.length) % ordered.length;
          target = ordered[wrapped];
        }
      }
      if (target) scrollToAndOpenAnnotation(target.annotation);
    }
    window.addEventListener("canvas:navigate-pin", onNavigate);
    return () => window.removeEventListener("canvas:navigate-pin", onNavigate);
  }, []);

  const handleSent = useCallback(() => {
    setOpenId(null);
    // `postAnnotation` dispatches canvas:annotation-posted, which the poll
    // effect above listens for and refreshes on — no manual refresh needed.
  }, []);

  const handleDismiss = useCallback((id: string) => {
    hideAnnotation(id);
    setHiddenIds(getHiddenAnnotationIds());
    if (openId === id) setOpenId(null);
    useEditorStore.getState().showToast("Pin dismissed");
  }, [openId]);

  // Resolve the open popover: prefer a pin position (pending annotation),
  // otherwise look up the annotation + compute its position on demand so
  // resolved/dismissed entries clicked from the history popover still show.
  let openPosition: PinPosition | null = openId ? (positions.find(p => p.annotation.id === openId) ?? null) : null;
  if (openId && !openPosition) {
    const a = annotations.find(x => x.id === openId);
    if (a) {
      const el = findElementForAnnotation(a);
      if (el) openPosition = computePinPosition(el, a, positions);
    }
  }

  // Cluster nearby pins
  const { singles, clusters } = clusterPins(positions);

  // For expanded clusters, show their pins as singles
  const expandedPins = expandedClusterIdx !== null && clusters[expandedClusterIdx]
    ? clusters[expandedClusterIdx].pins : [];
  const allVisiblePins = [...singles, ...expandedPins];

  // Build a global numbering map from positions array order
  const pinNumberMap = new Map<string, number>();
  positions.forEach((p, i) => pinNumberMap.set(p.annotation.id, i + 1));

  return (
    <>
      <style>{`
        @keyframes canvasPinPulse {
          0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05); }
          25% { box-shadow: 0 0 0 8px rgba(255,184,0,0.4), 0 2px 8px rgba(0,0,0,0.25); }
          50% { box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05); }
          75% { box-shadow: 0 0 0 6px rgba(255,184,0,0.3), 0 2px 8px rgba(0,0,0,0.25); }
        }
      `}</style>

      {/* Click-outside backdrop when popover is open */}
      {openId && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2147483644, pointerEvents: "auto" }}
          onClick={() => { setOpenId(null); setExpandedClusterIdx(null); }}
        />
      )}

      {/* Highlight outline on the targeted element when hovering or open */}
      {allVisiblePins.map((p) => {
        const isHover = hoveredId === p.annotation.id;
        const isOpen = openId === p.annotation.id;
        if (!isHover && !isOpen) return null;
        return <PinHighlight key={`hl-${p.annotation.id}`} rect={p.elementRect} />;
      })}

      {/* Cluster pins */}
      {clusters.map((cluster, idx) => {
        if (idx === expandedClusterIdx) return null; // expanded — show individual pins instead
        return (
          <ClusterPin
            key={`cluster-${idx}`}
            cluster={cluster}
            isExpanded={false}
            onClick={() => setExpandedClusterIdx(expandedClusterIdx === idx ? null : idx)}
          />
        );
      })}

      {/* Individual pins (singles + expanded cluster) */}
      {allVisiblePins.map((p) => (
        <Pin
          key={p.annotation.id}
          position={p}
          number={pinNumberMap.get(p.annotation.id) ?? 0}
          isOpen={openId === p.annotation.id}
          isNew={newIds.has(p.annotation.id)}
          onClick={() => setOpenId(openId === p.annotation.id ? null : p.annotation.id)}
          onHover={(h) => setHoveredId(h ? p.annotation.id : null)}
          onDismiss={() => handleDismiss(p.annotation.id)}
          isHovered={hoveredId === p.annotation.id}
        />
      ))}

      {/* Popover for the open pin */}
      <AnimatePresence>
        {openPosition && (
          <PinPopover
            key={openPosition.annotation.id}
            position={openPosition}
            onClose={() => setOpenId(null)}
            onSent={handleSent}
          />
        )}
      </AnimatePresence>
    </>
  );
});
