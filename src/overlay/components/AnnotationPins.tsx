import React, { useEffect, useRef, useState, useCallback } from "react";
import { PopFade } from "../utils/motion-presets.js";
import { Pen, X, Check } from "./icons.js";
import { THEME, hexToRgba } from "../theme.js";
import { EASE, DURATION } from "../utils/easings.js";
import {
  listAnnotations,
  appendAnnotationThread,
  updateAnnotationStatus,
  getHiddenAnnotationIds,
  hideAnnotation,
  findElementForAnnotation,
  findAllElementsForAnnotation,
  annotationPaths,
  scrollToAndOpenAnnotation,
  scrollToAndFocusAnnotation,
  type Annotation,
  type PinNavDirection,
} from "../utils/annotations.js";
import { useEditorStore } from "../stores/editor-store.js";
import { measureText } from "../utils/style-cache.js";
import { getEditorIframe, getIframeOffset } from "../utils/iframe-events.js";

const C = THEME;

// Pin palette — all values read from the theme so the pin disc, history-row
// dot, popover chip, and anything else status-coloured move together. Do
// not introduce hex literals here; edit theme.ts.
const PIN_YELLOW = C.warning;
const PIN_YELLOW_DARK = C.warningHover;
const PIN_GREEN = C.success;
const PIN_GREEN_DARK = C.successHover;
const PIN_GREY = C.neutral;
const PIN_GREY_DARK = C.neutralHover;
const PIN_BLUE = C.accent;
const PIN_BLUE_DARK = C.accentHover;
const PIN_SIZE = 20;
const CLUSTER_DISTANCE = PIN_SIZE * 1.5;

// Staggered reveal when the preview frame first uncovers. Capped so dense
// pages don't hold the last pin back past half a second.
const PIN_REVEAL_STAGGER_MS = 55;
const PIN_REVEAL_MAX_DELAY_MS = 440;
const PIN_REVEAL_DURATION_MS = 260;

interface PinPosition {
  annotation: Annotation;
  x: number; // viewport coords (pin center)
  y: number;
  elementRect: { left: number; top: number; width: number; height: number };
  tagName: string;
  /** Set on group annotations (elementPaths.length > 1). `elementRect` is the
   *  union box, `memberRects` are the per-element rects so hovering the pin
   *  can outline every member individually. */
  memberRects?: { left: number; top: number; width: number; height: number }[];
  memberCount?: number;
  /** Shared key for pins that target the same element. Pins with the same
   *  stackKey render at the same corner as a visual stack, and fan apart on
   *  hover so each is individually clickable. */
  stackKey: string;
  /** Index of this pin within its stack (0 = first placed). Used to compute
   *  the cascade offset at rest and the fan-out vector on hover. */
  stackIndex: number;
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

/** Translate a DOM element's bounding rect from its owner document's
 *  coordinate space into the parent viewport, accounting for the responsive
 *  iframe transform. */
function elementRectInViewport(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  let scale = 1, offsetX = 0, offsetY = 0;
  const iframe = getEditorIframe();
  if (iframe && iframe.contentDocument && el.ownerDocument === iframe.contentDocument) {
    const off = getIframeOffset(iframe);
    scale = off.scale;
    offsetX = off.x;
    offsetY = off.y;
  }
  return {
    left: r.left * scale + offsetX,
    top: r.top * scale + offsetY,
    width: r.width * scale,
    height: r.height * scale,
    zero: r.width === 0 && r.height === 0,
  };
}

/** Compute the pin position (viewport coords) for a single-element annotation. */
/** Cascade offset between pins that share an element — small so the stack
 *  reads as a single marker at rest, but enough that the count-of-pins is
 *  visible peripherally. Multiplied by stackIndex in computePinPosition. */
const STACK_OFFSET_PX = 3;

function computePinPosition(el: HTMLElement, a: Annotation, existingPins: PinPosition[]): PinPosition | null {
  const r = elementRectInViewport(el);
  if (r.zero) return null;

  const elRect = { left: r.left, top: r.top, width: r.width, height: r.height };

  // If another pin already targets the same elementPath, share its corner
  // instead of picking a new one. This keeps annotations for the same
  // element visually clustered (stacked at the same corner) rather than
  // scattered to opposite sides of the element by pickBestCorner's
  // "avoid other pins" scoring.
  const myPath = a.elementPath;
  const sameElementPins = myPath
    ? existingPins.filter(p => p.annotation.elementPath === myPath)
    : [];
  const corner = sameElementPins.length > 0
    ? { x: sameElementPins[0].x - STACK_OFFSET_PX * sameElementPins.length,
        y: sameElementPins[0].y + STACK_OFFSET_PX * sameElementPins.length }
    : pickBestCorner(elRect, existingPins);

  return {
    annotation: a,
    x: corner.x,
    y: corner.y,
    elementRect: elRect,
    tagName: el.tagName.toLowerCase(),
    stackKey: myPath || a.id,
    stackIndex: sameElementPins.length,
  };
}

/** Compute the pin position for a group annotation — union bounding box,
 *  single anchor, per-member rects retained for hover outlines. */
function computeGroupPinPosition(els: HTMLElement[], a: Annotation, existingPins: PinPosition[]): PinPosition | null {
  if (els.length < 2) return null;
  const rects = els.map(elementRectInViewport).filter(r => !r.zero);
  if (rects.length === 0) return null;

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
  }
  const elRect = { left, top, width: right - left, height: bottom - top };
  const corner = pickBestCorner(elRect, existingPins);

  return {
    annotation: a,
    x: corner.x,
    y: corner.y,
    elementRect: elRect,
    tagName: els[0].tagName.toLowerCase(),
    memberRects: rects.map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height })),
    memberCount: els.length,
    // Group annotations aren't stacked — each group is its own entity.
    stackKey: a.id,
    stackIndex: 0,
  };
}

/** Get pin colors based on annotation status. */
function pinColors(status: string | undefined): { bg: string; bgHover: string } {
  if (status === "resolved") return { bg: PIN_GREEN, bgHover: PIN_GREEN_DARK };
  if (status === "dismissed") return { bg: PIN_GREY, bgHover: PIN_GREY_DARK };
  if (status === "in_progress") return { bg: PIN_BLUE, bgHover: PIN_BLUE_DARK };
  if (status === "needs_input") return { bg: C.attention, bgHover: C.attentionHover };
  return { bg: PIN_YELLOW, bgHover: PIN_YELLOW_DARK };
}

interface PinProps {
  position: PinPosition;
  isOpen: boolean;
  isFocused: boolean;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
  onDismiss: () => void;
  isHovered: boolean;
  /** Stagger delay (ms) for the initial reveal; -1 disables the animation. */
  revealDelay: number;
  /** Size of the stack this pin belongs to. 1 → solo pin (small, no label).
   *  2+ → group pin (normal size, count label). */
  stackSize: number;
}

const Pin = React.memo(function Pin({ position, isOpen, isFocused, onClick, onHover, onDismiss, isHovered, revealDelay, stackSize }: PinProps) {
  const status = position.annotation.status;
  const colors = pinColors(status);
  const isInProgress = position.annotation.status === "in_progress";
  const isResolved = position.annotation.status === "resolved";
  // Every pin shows the number of annotations on its element: solo → "1",
  // group → "N". One size across the board so "1" and "12" read at the
  // same weight.
  const pinSize = PIN_SIZE;

  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: "fixed",
        left: position.x - pinSize / 2,
        top: position.y - pinSize / 2,
        width: pinSize, height: pinSize,
        borderRadius: "50%",
        background: isHovered || isOpen ? colors.bgHover : colors.bg,
        border: "none",
        color: "#fff",
        fontSize: 10, fontWeight: 700, fontFamily: C.font,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        // Two-layer shadow: soft drop + subtle inner highlight. No focus
        // rings — outline:none kills the browser default.
        boxShadow: "0 1px 2px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
        outline: "none",
        zIndex: 2147483644,
        transition: `background ${DURATION.small}ms ${EASE.snappy}, transform ${DURATION.small}ms ${EASE.snappy}, width 120ms ${EASE.snappy}, height 120ms ${EASE.snappy}`,
        transform: isHovered ? "scale(1.08)" : "scale(1)",
        pointerEvents: "auto",
        padding: 0,
        animation: [
          revealDelay >= 0
            ? `canvasPinReveal ${PIN_REVEAL_DURATION_MS}ms ease-out ${revealDelay}ms both`
            : null,
          isInProgress ? "canvasPinWorking 1.6s ease-in-out infinite" : null,
        ].filter(Boolean).join(", ") || undefined,
        // Sits below the canvas overlay layer (z: 2147483646) so hover/select
        // highlights paint over pins. Canvas has pointer-events: none, so
        // clicks still land on the pin.
      }}
      title={`${position.annotation.comment}\nRight-click to dismiss`}
    >
      {isHovered
        ? <Pen size={9} />
        : isResolved
          ? <Check size={12} />
          : stackSize}
    </button>
  );
});

// PinHighlight used to draw a yellow rect around the pin's target element
// on hover/focus/open. It's been removed — that highlight was confusing the
// "about to annotate" affordance from annotate-mode and made non-annotate
// interactions look like they were arming a new annotation. Pins carry
// enough visual weight on their own.

interface PinPopoverProps {
  position: PinPosition;
  onClose: () => void;
  onSent: () => void;
  skipAutoFocus?: boolean;
}

interface ThreadEntry { role: string; content: string; timestamp?: number }

/** Colour for a status badge / thread message bubble. Pulls the soft chip
 *  background and foreground from the theme — so updating a status hue
 *  once in theme.ts cascades here, into the pin disc, and into the
 *  history-row dot with no duplicated literals. */
function statusColor(status: string | undefined) {
  if (status === "resolved") return { bg: C.successSoft, fg: C.success };
  if (status === "dismissed") return { bg: C.neutralSoft, fg: C.neutral };
  if (status === "in_progress") return { bg: C.accentSoft, fg: C.accent };
  if (status === "needs_input") return { bg: C.attentionSoft, fg: C.attention };
  return { bg: C.warningSoft, fg: C.warning };
}

const PinPopover = React.memo(function PinPopover({ position, onClose, onSent, skipAutoFocus }: PinPopoverProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const status = position.annotation.status ?? "pending";
  const isResolved = status === "resolved" || status === "dismissed";
  const thread = ((position.annotation as unknown as { thread?: ThreadEntry[] }).thread) || [];

  useEffect(() => {
    if (!isResolved && !skipAutoFocus) inputRef.current?.focus();
  }, [isResolved]);

  const send = useCallback(async (opts: { reopen?: boolean } = {}) => {
    // Follow-up flow: append to the existing annotation's thread instead of
    // creating a new annotation. A "Re-open" on a resolved/dismissed row
    // pushes a short user message, then flips status back to `pending` so
    // the agent picks it up again on its next poll.
    const message = opts.reopen
      ? (text.trim() || `Re-opening: ${position.annotation.comment}`)
      : text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      const updated = await appendAnnotationThread(position.annotation.id, message, "user");
      if (!updated) throw new Error("append failed");
      if (opts.reopen || position.annotation.status !== "pending") {
        // New user input on a closed or in-progress annotation → re-open it.
        await updateAnnotationStatus(position.annotation.id, "pending");
      }
      useEditorStore.getState().showToast(opts.reopen ? "Re-opened" : "Sent");
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
    <PopFade
      open={true}
      // Marks this popover as overlay chrome so the document-level wheel
      // handler in useViewport bails instead of hijacking scroll/zoom —
      // otherwise scrolling a long thread scrolls the page/pans the canvas.
      data-canvas-overlay="true"
      style={{
        position: "fixed",
        left: popX, top: popY,
        width: popoverWidth,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        zIndex: 2147483647,
        fontFamily: C.font,
        pointerEvents: "auto",
        overflow: "hidden",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 6,
        padding: "10px 12px",
        borderBottom: `1px solid ${C.borderLight}`,
        fontSize: 11, lineHeight: `${HEADER_LINE_HEIGHT}px`,
        color: C.fgDim,
      }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, flexShrink: 0, marginTop: 1 }}>
          {position.tagName}
        </span>
        <span style={{
          flex: 1, fontStyle: "italic", color: C.fg,
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
              fontSize: 8, fontWeight: 700, letterSpacing: 0.4,
              padding: "1px 5px", borderRadius: 3,
              textTransform: "uppercase", flexShrink: 0, marginTop: 1,
            }}>
              {status}
            </span>
          );
        })()}
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: C.fgMuted,
            cursor: "pointer", padding: 2, display: "flex", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.fg; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.fgMuted; }}
        >
          <X size={12} />
        </button>
      </div>

      {(thread.length > 0 || status === "in_progress") && (
        <div
          // Stop wheel from bubbling up to the viewport pan/zoom handler even
          // in the rare case the data-canvas-overlay marker is stripped.
          onWheel={e => e.stopPropagation()}
          style={{
            maxHeight: 160, overflowY: "auto",
            display: "flex", flexDirection: "column", gap: 4,
            padding: "8px 12px",
            borderBottom: `1px solid ${C.borderLight}`,
          }}
        >
          {thread.map((entry, i) => {
            const isAgent = entry.role === "agent";
            return (
              <div key={i} style={{
                alignSelf: isAgent ? "flex-start" : "flex-end",
                maxWidth: "88%",
                background: isAgent ? C.accentSoft : C.bgAlt,
                color: isAgent ? C.accent : C.fg,
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
          {status === "in_progress" && (
            <div style={{
              alignSelf: "flex-start",
              background: C.accentSoft,
              color: C.accent,
              fontSize: 10, lineHeight: 1.4,
              padding: "4px 8px", borderRadius: 6,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ display: "inline-flex", gap: 3 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.accent, animation: "canvasTypingDot 1.2s ease-in-out infinite 0ms" }} />
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.accent, animation: "canvasTypingDot 1.2s ease-in-out infinite 180ms" }} />
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.accent, animation: "canvasTypingDot 1.2s ease-in-out infinite 360ms" }} />
              </span>
              <span style={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: 8, opacity: 0.8 }}>
                Working
              </span>
            </div>
          )}
        </div>
      )}

      {isResolved ? (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "8px 12px" }}>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none",
              color: C.fgDim, fontSize: 10,
              padding: "4px 10px", borderRadius: 4, cursor: "pointer",
              fontFamily: C.font,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.fg; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgDim; }}
          >
            Close
          </button>
          <button
            onClick={() => send({ reopen: true })}
            disabled={sending}
            style={{
              background: sending ? C.bgAlt : C.accent,
              color: sending ? C.fgMuted : "#fff",
              border: "none", borderRadius: 4,
              padding: "4px 10px", fontSize: 10, fontWeight: 600,
              cursor: sending ? "default" : "pointer",
              fontFamily: C.font,
            }}
            title="Post a new annotation referencing this one"
          >
            {sending ? "Re-opening…" : "Re-open"}
          </button>
        </div>
      ) : (
        <div style={{ padding: "8px 12px" }}>
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
              background: C.bgAlt,
              border: `1px solid ${C.borderLight}`,
              borderRadius: 6,
              color: C.fg, fontSize: 11, fontFamily: C.font,
              padding: "6px 8px", outline: "none", boxSizing: "border-box",
              resize: "vertical", lineHeight: 1.4,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "none",
                color: C.fgDim, fontSize: 10,
                padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                fontFamily: C.font,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.fg; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgDim; }}
            >
              Cancel
            </button>
            <button
              onClick={() => send()}
              disabled={!text.trim() || sending}
              style={{
                background: text.trim() && !sending ? C.accent : C.bgAlt,
                color: text.trim() && !sending ? "#fff" : C.fgMuted,
                border: "none", borderRadius: 4,
                padding: "4px 10px", fontSize: 10, fontWeight: 600,
                cursor: text.trim() && !sending ? "pointer" : "default",
                fontFamily: C.font,
              }}
            >
              {sending ? "Sending…" : "Add"}
            </button>
          </div>
        </div>
      )}
    </PopFade>
  );
});

// ── Stacks (same-element pin grouping) ──

interface Stack {
  key: string;
  pins: PinPosition[];   // sorted newest-first
  x: number;
  y: number;
}

/** Group pins by shared stackKey. Order pins newest-first inside each stack
 *  so the top-of-stack reads as "most recent". Returns both a map (for
 *  per-pin lookups) and an array of stacks (for render order). */
function buildStacks(pins: PinPosition[]): Stack[] {
  const map = new Map<string, PinPosition[]>();
  for (const p of pins) {
    const bucket = map.get(p.stackKey);
    if (bucket) bucket.push(p);
    else map.set(p.stackKey, [p]);
  }
  const stacks: Stack[] = [];
  for (const [key, bucket] of map) {
    const sorted = [...bucket].sort((a, b) =>
      (b.annotation.timestamp || 0) - (a.annotation.timestamp || 0),
    );
    stacks.push({ key, pins: sorted, x: sorted[0].x, y: sorted[0].y });
  }
  return stacks;
}

/**
 * Renders numbered annotation pins on the page for each pending
 * annotation. Hover → pencil icon. Click → popover for follow-up.
 */
export const AnnotationPins = React.memo(function AnnotationPins() {
  // Suppress pins while the preview frame is still covered by the halftone
  // loader — element coords aren't stable until the iframe has measured, so
  // pins would briefly render at the wrong positions.
  const frameRevealed = useEditorStore((s) => s.frameRevealed);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [positions, setPositions] = useState<PinPosition[]>([]);
  // Staggered reveal window — starts the first time pins actually mount
  // after the frame uncovers (positions come from async fetches, so keying
  // purely on `frameRevealed` can expire the window before any pin renders).
  // A ref guards against re-triggering when positions flicker in and out.
  const [initialRevealDone, setInitialRevealDone] = useState(false);
  const revealStartedRef = useRef(false);
  useEffect(() => {
    if (!frameRevealed) {
      revealStartedRef.current = false;
      setInitialRevealDone(false);
      return;
    }
    if (revealStartedRef.current || positions.length === 0) return;
    revealStartedRef.current = true;
    const t = window.setTimeout(
      () => setInitialRevealDone(true),
      PIN_REVEAL_MAX_DELAY_MS + PIN_REVEAL_DURATION_MS + 50,
    );
    return () => window.clearTimeout(t);
  }, [frameRevealed, positions.length]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Hover state keyed by stack (set of same-element pins). Debounced with a
  // short mouseleave delay so moving the cursor between pins in the same
  // stack doesn't flip it off — otherwise every boundary crossing triggers
  // mouseleave→mouseenter and the task list popover flickers.
  const [hoveredStackKey, setHoveredStackKey] = useState<string | null>(null);
  const stackLeaveTimerRef = useRef<number | null>(null);
  const enterStack = useCallback((key: string) => {
    if (stackLeaveTimerRef.current !== null) {
      window.clearTimeout(stackLeaveTimerRef.current);
      stackLeaveTimerRef.current = null;
    }
    setHoveredStackKey(key);
  }, []);
  const leaveStack = useCallback(() => {
    if (stackLeaveTimerRef.current !== null) window.clearTimeout(stackLeaveTimerRef.current);
    stackLeaveTimerRef.current = window.setTimeout(() => {
      stackLeaveTimerRef.current = null;
      setHoveredStackKey(null);
    }, 120);
  }, []);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenAnnotationIds());

  // Poll annotations from server every 3s. Resolved annotations are
  // filtered out on the pin layer (they still live in the server and show
  // up in the history popover — just no pin on the canvas so the page
  // isn't cluttered with ticks after work is done). Pending, in_progress,
  // and dismissed keep their pins so the user can still see open work or
  // re-open something they dismissed.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const list = await listAnnotations();
        if (cancelled) return;
        // Drop resolved + dismissed from the canvas — both are "closed"
        // states. They're still in the history popover for the audit trail;
        // the canvas just shows open work.
        setAnnotations(list.filter(a => a.status !== "resolved" && a.status !== "dismissed"));
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

  // Recompute pin positions every frame while there are pins to track.
  // Pins render for PENDING annotations only — resolved/dismissed don't
  // get a pin but can still be opened via the history popover or nav.
  useEffect(() => {
    const visible = annotations.filter(a => !hiddenIds.has(a.id));
    if (visible.length === 0) {
      setPositions(prev => (prev.length ? [] : prev));
      return;
    }
    let raf = 0;
    // Previous signature so we can skip the React update when nothing moved.
    let prevKey = "";
    function tick() {
      const next: PinPosition[] = [];
      for (const a of visible) {
        const paths = annotationPaths(a);
        if (paths.length > 1) {
          const els = findAllElementsForAnnotation(a);
          const pos = computeGroupPinPosition(els, a, next);
          if (pos) next.push(pos);
          continue;
        }
        const el = findElementForAnnotation(a);
        if (!el) continue;
        const pos = computePinPosition(el, a, next);
        if (pos) next.push(pos);
      }
      // Sort by annotation timestamp so pin numbers are stable across frames
      next.sort((a, b) => a.annotation.timestamp - b.annotation.timestamp);
      const key = next.map(p => `${p.annotation.id}:${p.x | 0}:${p.y | 0}`).join("|");
      if (key !== prevKey) {
        prevKey = key;
        setPositions(next);
      }
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

  // Keep latest positions + focusedId in refs so the navigate listener below
  // doesn't re-attach every frame.
  const positionsRef = useRef<PinPosition[]>([]);
  const focusedIdRef = useRef<string | null>(null);
  positionsRef.current = positions;
  focusedIdRef.current = focusedId;

  // Track whether the popover was opened via keyboard nav (don't auto-focus textarea)
  const keyboardNavRef = useRef(false);

  // Listen for focus-pin events (from keyboard navigation)
  useEffect(() => {
    function onFocus(e: Event) {
      const id = (e as CustomEvent<{ annotationId: string }>).detail?.annotationId;
      if (id) {
        keyboardNavRef.current = true;
        setFocusedId(id);
        setOpenId(id);
      }
    }
    window.addEventListener("canvas:focus-annotation-pin", onFocus);
    return () => window.removeEventListener("canvas:focus-annotation-pin", onFocus);
  }, []);

  // Listen for keyboard-triggered pin navigation (`[` / `]`).
  // Focuses the pin (highlights it) instead of opening the popover.
  useEffect(() => {
    function onNavigate(e: Event) {
      const direction = (e as CustomEvent<{ direction: PinNavDirection }>).detail?.direction;
      if (!direction) return;
      const ordered = [...positionsRef.current].sort((a, b) => a.y - b.y);
      if (ordered.length === 0) return;

      let target: PinPosition | undefined;
      if (direction === "first") target = ordered[0];
      else if (direction === "last") target = ordered[ordered.length - 1];
      else {
        const currentIdx = focusedIdRef.current
          ? ordered.findIndex(p => p.annotation.id === focusedIdRef.current)
          : -1;
        if (currentIdx === -1) {
          target = direction === "next" ? ordered[0] : ordered[ordered.length - 1];
        } else {
          const nextIdx = direction === "next" ? currentIdx + 1 : currentIdx - 1;
          const wrapped = ((nextIdx % ordered.length) + ordered.length) % ordered.length;
          target = ordered[wrapped];
        }
      }
      if (target) scrollToAndFocusAnnotation(target.annotation);
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

  // Group pins that share an element into stacks. Hover is managed at the
  // stack level (one wrapper div per stack) so moving between pins in a
  // stack doesn't cause mouseleave→mouseenter flicker.
  const stacks = buildStacks(positions);
  // Quick lookup for stack size by annotation id so each Pin knows whether
  // it's solo (smaller disc, no label) or part of a group (full size + count).
  const stackSizeById = new Map<string, number>();
  for (const s of stacks) {
    for (const p of s.pins) stackSizeById.set(p.annotation.id, s.pins.length);
  }


  // Hide pins entirely while the preview frame is still loading — the
  // halftone cover owns that window and any pins rendered over it would
  // both look wrong and anchor to pre-measure rects.
  if (!frameRevealed) return null;

  return (
    <>
      <style>{`
        @keyframes canvasPinWorking {
          0%, 100% { box-shadow: 0 0 0 0 ${hexToRgba(C.accent, 0.5)}, 0 2px 8px rgba(0,0,0,0.25); }
          50%      { box-shadow: 0 0 0 7px ${hexToRgba(C.accent, 0)}, 0 2px 8px rgba(0,0,0,0.25); }
        }
        @keyframes canvasPinReveal {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes canvasTypingDot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-2px); }
        }
      `}</style>

      {/* Click-outside backdrop when popover is open */}
      {openId && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2147483644, pointerEvents: "auto" }}
          onClick={() => { setOpenId(null); }}
        />
      )}


      {/* Individual pins. Same-element pins land at the same corner (see
          computePinPosition) so they visually stack with a small cascade
          offset. Hover is managed at the stack level so moving the cursor
          between pins in a stack never flickers the task-list popover off. */}
      {positions.map((p, i) => {
        const revealDelay = initialRevealDone
          ? -1
          : Math.min(i * PIN_REVEAL_STAGGER_MS, PIN_REVEAL_MAX_DELAY_MS);
        return (
          <Pin
            key={p.annotation.id}
            position={p}
            isOpen={openId === p.annotation.id}
            isFocused={focusedId === p.annotation.id}
            revealDelay={revealDelay}
            stackSize={stackSizeById.get(p.annotation.id) ?? 1}
            onClick={() => {
              const id = p.annotation.id;
              keyboardNavRef.current = false;
              setOpenId(openId === id ? null : id);
              setFocusedId(id);
            }}
            onHover={(h) => {
              setHoveredId(h ? p.annotation.id : null);
              if (h) enterStack(p.stackKey);
              else leaveStack();
            }}
            onDismiss={() => handleDismiss(p.annotation.id)}
            isHovered={hoveredId === p.annotation.id || hoveredStackKey === p.stackKey}
          />
        );
      })}

      {/* Popover for the open pin — PopFade inside PinPopover handles enter animation. */}
      {openPosition && (
        <PinPopover
          key={openPosition.annotation.id}
          position={openPosition}
          onClose={() => { setOpenId(null); keyboardNavRef.current = false; }}
          onSent={() => { handleSent(); keyboardNavRef.current = false; }}
          skipAutoFocus={keyboardNavRef.current}
        />
      )}

      {/* Task-list popover for the hovered stack. Only shows when 2+ pins
          share an element — the chat box lists every annotation on that
          element, clicking a row opens that specific pin's popover. */}
      {!openId && hoveredStackKey && (() => {
        const stack = stacks.find(s => s.key === hoveredStackKey);
        if (!stack || stack.pins.length < 2) return null;
        return (
          <StackTaskList
            stack={stack}
            onMouseEnter={() => enterStack(stack.key)}
            onMouseLeave={leaveStack}
            onOpen={(id) => {
              setOpenId(id);
              setFocusedId(id);
              keyboardNavRef.current = false;
            }}
          />
        );
      })()}
    </>
  );
});

/** Chat-box-style popover that lists every annotation in a same-element
 *  stack. Anchored just right of the stack corner; clicking a row opens
 *  that annotation's individual pin popover. Hover is proxied back to the
 *  parent so moving from a pin onto this list doesn't close the list. */
const StackTaskList = React.memo(function StackTaskList({
  stack, onMouseEnter, onMouseLeave, onOpen,
}: {
  stack: Stack;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpen: (annotationId: string) => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        left: stack.x + PIN_SIZE / 2 + 10,
        top: stack.y - PIN_SIZE / 2,
        minWidth: 220,
        maxWidth: 320,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
        fontFamily: C.font,
        zIndex: 2147483645,
      }}
    >
      {stack.pins.map((p) => {
        const a = p.annotation;
        const meta = statusColor(a.status);
        const label =
          a.status === "resolved" ? "Resolved"
          : a.status === "dismissed" ? "Dismissed"
          : a.status === "in_progress" ? "In progress"
          : a.status === "needs_input" ? "Needs input"
          : "Pending";
        const preview = a.comment || "(no prompt)";
        return (
          <button
            key={a.id}
            onClick={(e) => { e.stopPropagation(); onOpen(a.id); }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: `1px solid ${C.borderLight}`,
              padding: "8px 10px",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: C.font,
              color: C.fg,
              outline: "none",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
              <span
                style={{
                  width: 6, height: 6, borderRadius: "50%", background: meta.fg, flexShrink: 0,
                  animation: a.status === "in_progress"
                    ? "canvasDotWorking 1.4s ease-in-out infinite"
                    : undefined,
                }}
              />
              <span
                style={{
                  flex: 1, fontSize: 11, color: C.fg, lineHeight: 1.35,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {preview}
              </span>
            </div>
            <div style={{
              fontSize: 9, color: meta.fg, fontWeight: 600, letterSpacing: 0.4,
              textTransform: "uppercase", marginLeft: 12,
            }}>
              {label}
            </div>
          </button>
        );
      })}
    </div>
  );
});
