import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X } from "./icons.js";
import { THEME } from "../theme.js";
import {
  listAnnotations,
  postAnnotation,
  currentSessionId,
  getHiddenAnnotationIds,
  findElementForAnnotation,
  scrollToAndOpenAnnotation,
  type Annotation,
  type PinNavDirection,
} from "../utils/agentation.js";
import { useEditorStore } from "../stores/editor-store.js";

const C = THEME;

// Yellow to match the AI/sparkles badge in the toolbar
const PIN_YELLOW = "#ffb800";
const PIN_YELLOW_DARK = "#e0a200";
const PIN_SIZE = 20;

interface PinPosition {
  annotation: Annotation;
  x: number; // viewport coords (pin center)
  y: number;
  elementRect: { left: number; top: number; width: number; height: number };
  tagName: string;
}

/** Get the iframe element in the overlay shadow DOM, if present. */
function getIframe(): HTMLIFrameElement | null {
  const host = document.getElementById("local-canvas-host");
  const shadow = host?.shadowRoot;
  return (shadow?.querySelector("#responsive-frame-container iframe") ??
    shadow?.querySelector("iframe")) as HTMLIFrameElement | null;
}

/** Compute the pin position (viewport coords) for an element. */
function computePinPosition(el: HTMLElement, a: Annotation): PinPosition | null {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  // If element lives in iframe, translate coords to parent viewport.
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  const iframe = getIframe();
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

  // Anchor pin to the top-right corner, slightly outside the element
  const x = left + width - PIN_SIZE / 2 + 6;
  const y = top - PIN_SIZE / 2 - 4;

  return {
    annotation: a,
    x, y,
    elementRect: { left, top, width, height },
    tagName: el.tagName.toLowerCase(),
  };
}

interface PinProps {
  position: PinPosition;
  number: number;
  isOpen: boolean;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
  isHovered: boolean;
}

const Pin = React.memo(function Pin({ position, number, isOpen, onClick, onHover, isHovered }: PinProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: "fixed",
        left: position.x - PIN_SIZE / 2,
        top: position.y - PIN_SIZE / 2,
        width: PIN_SIZE, height: PIN_SIZE,
        borderRadius: "50%",
        background: isHovered || isOpen ? PIN_YELLOW_DARK : PIN_YELLOW,
        border: "none",
        color: "#000",
        fontSize: 10, fontWeight: 700, fontFamily: C.font,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)",
        zIndex: 2147483646,
        transition: "background 0.12s ease, transform 0.12s ease",
        transform: isHovered ? "scale(1.08)" : "scale(1)",
        pointerEvents: "auto",
        padding: 0,
      }}
      title={position.annotation.comment}
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

const PinPopover = React.memo(function PinPopover({ position, onClose, onSent }: PinPopoverProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    const prompt = text.trim();
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
      useEditorStore.getState().showToast("Sent to agent");
      onSent();
    } catch {
      useEditorStore.getState().showToast("Send failed");
    } finally {
      setSending(false);
    }
  }, [text, sending, position, onSent]);

  const popoverWidth = 260;
  const popoverHeight = 150;
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
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.12 }}
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
        display: "flex", alignItems: "center", gap: 5, marginBottom: 6,
        fontSize: 11, color: "rgba(255,255,255,0.55)",
      }}>
        <span style={{ fontWeight: 600 }}>{position.tagName}:</span>
        <span style={{
          flex: 1, fontStyle: "italic", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={position.annotation.comment}>
          "{position.annotation.comment}"
        </span>
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
          onClick={send}
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
          {sending ? "Sending\u2026" : "Add"}
        </button>
      </div>
    </motion.div>
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

  // Poll annotations from server every 3s
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!currentSessionId()) return;
      try {
        const list = await listAnnotations();
        if (cancelled) return;
        // Only show pending annotations on the current page
        const filtered = list.filter(a =>
          (a.status === "pending" || !a.status) &&
          a.url === window.location.href
        );
        setAnnotations(filtered);
      } catch { /* ignore */ }
    }
    refresh();
    const id = setInterval(refresh, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Sync with localStorage hidden-set (updated from toolbar history rows)
  useEffect(() => {
    function onChange() { setHiddenIds(getHiddenAnnotationIds()); }
    window.addEventListener("canvas:hidden-annotations-changed", onChange);
    return () => window.removeEventListener("canvas:hidden-annotations-changed", onChange);
  }, []);

  // Recompute pin positions every frame (cheap for small N)
  useEffect(() => {
    let raf = 0;
    function tick() {
      const next: PinPosition[] = [];
      for (const a of annotations) {
        if (hiddenIds.has(a.id)) continue;
        const el = findElementForAnnotation(a);
        if (!el) continue;
        const pos = computePinPosition(el, a);
        if (pos) next.push(pos);
      }
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
    // Refresh now so the new annotation shows up immediately
    listAnnotations().then(list => {
      const filtered = list.filter(a =>
        (a.status === "pending" || !a.status) && a.url === window.location.href
      );
      setAnnotations(filtered);
    }).catch(() => {});
  }, []);

  const openPosition = openId ? positions.find(p => p.annotation.id === openId) : null;

  return (
    <>
      {/* Click-outside backdrop when popover is open */}
      {openId && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2147483644, pointerEvents: "auto" }}
          onClick={() => setOpenId(null)}
        />
      )}

      {/* Highlight outline on the targeted element when hovering or open */}
      {positions.map((p, i) => {
        const isHover = hoveredId === p.annotation.id;
        const isOpen = openId === p.annotation.id;
        if (!isHover && !isOpen) return null;
        return <PinHighlight key={`hl-${p.annotation.id}`} rect={p.elementRect} />;
      })}

      {/* Pins */}
      {positions.map((p, i) => (
        <Pin
          key={p.annotation.id}
          position={p}
          number={i + 1}
          isOpen={openId === p.annotation.id}
          onClick={() => setOpenId(openId === p.annotation.id ? null : p.annotation.id)}
          onHover={(h) => setHoveredId(h ? p.annotation.id : null)}
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
