import React, { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { useComponentViewStore } from "../stores/component-view-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import { HAS_DRAW_ELEMENT, COL, FONT, BADGE_CSS, LABEL_CSS } from "../canvas/constants.js";
import type { BadgeHit, TagBadgeHit } from "../canvas/constants.js";
import { paintFrame, shouldRepaint } from "../canvas/paint-frame.js";
import type { PaintContext } from "../canvas/paint-frame.js";
import { useSpacingDrag } from "../canvas/use-spacing-drag.js";
import { useTextEdit } from "../hooks/useTextEdit.js";
import { computeHandles, paintHandles, useResizeHandles } from "../canvas/use-resize-handles.js";
import { attachToDocumentAndIframe } from "../utils/iframe-events.js";
import type { ResizeHandle } from "../canvas/use-resize-handles.js";

const SPACING_KEYS = ["margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left"];

export const CanvasOverlayLayer = React.memo(function CanvasOverlayLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const badgeHitsRef = useRef<BadgeHit[]>([]);
  const tagBadgeHitRef = useRef<TagBadgeHit | null>(null);

  // drawElementImage refs
  const tagBadgeRef = useRef<HTMLSpanElement>(null);
  const dimsBadgeRef = useRef<HTMLSpanElement>(null);
  const hoverBadgeRef = useRef<HTMLSpanElement>(null);
  const spacingBadgeRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  // Editing state (double-click input)
  const [editBadge, setEditBadge] = useState<BadgeHit | null>(null);
  const [editValue, setEditValue] = useState("");
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const prevMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const resizeHandlesRef = useRef<ResizeHandle[]>([]);
  const { dragTooltip, reorderRef, commitSpacing, spacingDragRef } = useSpacingDrag(badgeHitsRef, tagBadgeHitRef);
  const { editState: textEditState, editRef: textEditRef, closeEdit: closeTextEdit } = useTextEdit();
  const { resizeTooltip } = useResizeHandles(resizeHandlesRef);

  // ── Commit badge text edit ──
  const commitEdit = useCallback(() => {
    if (!editBadge) return;
    const num = parseInt(editValue);
    if (isNaN(num) || num < 0) return;
    commitSpacing(editBadge.prefix, num);
  }, [editBadge, editValue, commitSpacing]);

  // ── Paint loop with dirty-checking ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function frame() {
      const editorState = useEditorStore.getState();
      const editor = {
        selectedElement: editorState.selectedElement,
        hoveredElement: editorState.hoveredElement,
      };
      const viewport = useViewportStore.getState();

      // Dirty-check: skip repaint if nothing changed
      const isDragging = spacingDragRef.current?.moved;
      // Check if mouse moved (needed for notch hover badges)
      const mp = mousePosRef.current;
      const pmp = prevMousePosRef.current;
      const mouseMoved = mp && (!pmp || mp.x !== pmp.x || mp.y !== pmp.y);
      if (mouseMoved) prevMousePosRef.current = mp ? { ...mp } : null;
      // Repaint if: dragging, mouse moved with selection, or state changed
      const hasSelection = !!editorState.selectedElement;
      if (!isDragging && !(mouseMoved && hasSelection) && !shouldRepaint(editor, viewport)) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Build paint context for component badges + change indicators
      const components = useComponentViewStore.getState().components;
      const changes = useChangesStore.getState().changes;
      const changedFiles = new Set(changes.map(c => `${c.filePath}:${c.line}`));
      const paintCtx: PaintContext = { components, changedFiles };

      // Compute iframe offset from shadow DOM — works for hover (no selection) too.
      let iframeOffset = { x: 0, y: 0, scale: 1 };
      const host = document.getElementById("local-canvas-host");
      const shadow = host?.shadowRoot;
      const iframeEl = shadow?.querySelector("#responsive-frame-container iframe") as HTMLIFrameElement | null;
      if (iframeEl) {
        const ir = iframeEl.getBoundingClientRect();
        const naturalW = parseInt(iframeEl.style.width) || ir.width;
        const scale = ir.width / naturalW;
        iframeOffset = { x: ir.left, y: ir.top, scale };
      }

      // Pass active drag state so spacing zones update in real-time during drag
      const sd = spacingDragRef.current;
      const activeDrag = sd?.moved ? { prefix: sd.badge.prefix, value: sd.lastPx } : null;

      const result = paintFrame(ctx!, canvas!, editor, viewport, iframeOffset, paintCtx, activeDrag, mousePosRef.current);

      // Draw drag boundary line during active spacing drag
      if (sd?.moved && editorState.selectedElement) {
        const sel = editorState.selectedElement;
        const rawRect = sel.element.getBoundingClientRect();
        const ifs2 = iframeOffset.scale ?? 1;
        const ox2 = iframeOffset.x, oy2 = iframeOffset.y;
        const sr = {
          left: rawRect.left * ifs2 + ox2, top: rawRect.top * ifs2 + oy2,
          width: rawRect.width * ifs2, height: rawRect.height * ifs2,
        };
        const dragPx = sd.lastPx * viewport.zoom;
        const side = sd.badge.side;
        const isPadding = sd.badge.type === "padding";
        const color = isPadding ? COL.padding : COL.margin;

        ctx!.save();
        ctx!.setLineDash([4, 4]);
        ctx!.strokeStyle = color;
        ctx!.lineWidth = 2;
        ctx!.beginPath();

        if (side === "top") {
          const lineY = isPadding ? sr.top + dragPx : sr.top - dragPx;
          ctx!.moveTo(sr.left, lineY);
          ctx!.lineTo(sr.left + sr.width, lineY);
        } else if (side === "bottom") {
          const lineY = isPadding ? sr.top + sr.height - dragPx : sr.top + sr.height + dragPx;
          ctx!.moveTo(sr.left, lineY);
          ctx!.lineTo(sr.left + sr.width, lineY);
        } else if (side === "left") {
          const lineX = isPadding ? sr.left + dragPx : sr.left - dragPx;
          ctx!.moveTo(lineX, sr.top);
          ctx!.lineTo(lineX, sr.top + sr.height);
        } else {
          const lineX = isPadding ? sr.left + sr.width - dragPx : sr.left + sr.width + dragPx;
          ctx!.moveTo(lineX, sr.top);
          ctx!.lineTo(lineX, sr.top + sr.height);
        }

        ctx!.stroke();
        ctx!.setLineDash([]);
        ctx!.restore();
      }

      // Reorder insertion line
      const ro = reorderRef.current;
      if (ro && ro.insertionRect) {
        ctx!.save();
        ctx!.fillStyle = COL.blue;
        ctx!.fillRect(ro.insertionRect.left, ro.insertionRect.top - 2, ro.insertionRect.width, 3);
        ctx!.restore();
      }

      badgeHitsRef.current = result.badges;
      tagBadgeHitRef.current = result.tagHit;

      // Undo/redo flash — bright pulse on the selected element
      if (editorState.selectedElement && useEditorStore.getState().elementFlash) {
        const flashEl = editorState.selectedElement.element;
        if (flashEl.isConnected) {
          const fr = flashEl.getBoundingClientRect();
          const ifs2 = iframeOffset.scale ?? 1;
          const fx = fr.left * ifs2 + iframeOffset.x;
          const fy = fr.top * ifs2 + iframeOffset.y;
          const fw = fr.width * ifs2;
          const fh = fr.height * ifs2;
          ctx!.save();
          ctx!.fillStyle = "rgba(6, 182, 255, 0.15)";
          ctx!.fillRect(fx, fy, fw, fh);
          ctx!.strokeStyle = "#06B6FF";
          ctx!.lineWidth = 3;
          ctx!.strokeRect(fx, fy, fw, fh);
          ctx!.restore();
        }
      }

      // Populate resize handle hit zones for useResizeHandles hook
      if (editorState.selectedElement?.element?.isConnected) {
        const rr = editorState.selectedElement.element.getBoundingClientRect();
        const ifs2 = iframeOffset.scale ?? 1;
        const sx = rr.left * ifs2 + iframeOffset.x;
        const sy = rr.top * ifs2 + iframeOffset.y;
        const sw = rr.width * ifs2;
        const sh = rr.height * ifs2;
        const HS = 14; // hit zone size
        resizeHandlesRef.current = [
          { x: sx + sw - HS, y: sy + sh - HS, w: HS, h: HS, position: "bottom-right" as const, cursor: "nwse-resize" },
        ];
      } else {
        resizeHandlesRef.current = [];
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    // Track mouse position for hover-aware drawing (zero-edge indicators)
    function onMouseMove(e: MouseEvent) {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    }
    document.addEventListener("mousemove", onMouseMove, true);

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("mousemove", onMouseMove, true);
    };
  }, [reorderRef]);

  // ── Double-click to edit badge value ──
  useEffect(() => {
    function onDblClick(e: MouseEvent) {
      for (const hit of badgeHitsRef.current) {
        if (e.clientX >= hit.x && e.clientX <= hit.x + hit.w && e.clientY >= hit.y && e.clientY <= hit.y + hit.h) {
          e.preventDefault();
          e.stopPropagation();
          setEditValue(String(Math.round(hit.value)));
          setEditBadge(hit);
          return;
        }
      }
    }

    return attachToDocumentAndIframe(
      [{ event: "dblclick", handler: onDblClick }],
      { translateCoords: true },
    );
  }, []);

  const setSpacingRef = useCallback((key: string) => (el: HTMLSpanElement | null) => { spacingBadgeRefs.current[key] = el; }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        {...(HAS_DRAW_ELEMENT ? { layoutsubtree: "" } : {})}
        style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2147483646 }}
      >
        {HAS_DRAW_ELEMENT && (
          <>
            <span ref={tagBadgeRef} style={{ ...LABEL_CSS, background: COL.blue }} />
            <span ref={dimsBadgeRef} style={{ ...BADGE_CSS, background: "rgba(6,182,255,0.85)" }} />
            <span ref={hoverBadgeRef} style={{ ...LABEL_CSS, background: COL.blue }} />
            {SPACING_KEYS.map(key => <span key={key} ref={setSpacingRef(key)} style={{ ...BADGE_CSS, background: key.startsWith("margin") ? COL.margin : COL.padding }} />)}
          </>
        )}
      </canvas>

      {/* Floating input for badge editing */}
      {editBadge && (
        <div style={{ position: "fixed", left: editBadge.x + editBadge.w / 2 - 22, top: editBadge.y + editBadge.h / 2 - 11, zIndex: 2147483647, pointerEvents: "auto" }} data-canvas-overlay="true">
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => { commitEdit(); setEditBadge(null); }}
            onKeyDown={e => { if (e.key === "Enter") { commitEdit(); setEditBadge(null); } if (e.key === "Escape") setEditBadge(null); }}
            style={{ width: 52, height: 22, fontSize: 10, fontWeight: 600, fontFamily: FONT, color: "#fff", background: editBadge.type === "padding" ? COL.padding : COL.margin, border: "2px solid #fff", borderRadius: 4, textAlign: "center", outline: "none", padding: 0, boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
          />
        </div>
      )}

      {/* Drag tooltip */}
      {/* Drag tooltip removed — the notch pill already shows the live value */}
      {false && dragTooltip && (
        <div style={{ position: "fixed", left: dragTooltip.x + 12, top: dragTooltip.y - 10, zIndex: 2147483647, pointerEvents: "none", background: dragTooltip.color, color: "#fff", fontSize: 10, fontWeight: 600, fontFamily: FONT, padding: "2px 6px", borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
          {dragTooltip.value}px
        </div>
      )}

      {/* Resize tooltip */}
      {resizeTooltip && (
        <div style={{ position: "fixed", left: resizeTooltip.x + 12, top: resizeTooltip.y - 10, zIndex: 2147483647, pointerEvents: "none", background: "#06B6FF", color: "#fff", fontSize: 10, fontWeight: 600, fontFamily: FONT, padding: "2px 6px", borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
          {resizeTooltip.text}
        </div>
      )}

      {/* Inline text editing overlay */}
      {textEditState && (
        <div
          data-canvas-overlay="true"
          style={{
            position: "fixed",
            left: textEditState.rect.left - 2,
            top: textEditState.rect.top - 2,
            minWidth: textEditState.rect.width + 4,
            minHeight: textEditState.rect.height + 4,
            zIndex: 2147483647,
            pointerEvents: "auto",
          }}
        >
          <div
            ref={textEditRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={closeTextEdit}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); closeTextEdit(); }
              if (e.key === "Escape") { closeTextEdit(); }
            }}
            style={{
              minWidth: textEditState.rect.width,
              minHeight: textEditState.rect.height,
              padding: 2,
              fontSize: getComputedStyle(textEditState.element).fontSize,
              fontFamily: getComputedStyle(textEditState.element).fontFamily,
              fontWeight: getComputedStyle(textEditState.element).fontWeight,
              lineHeight: getComputedStyle(textEditState.element).lineHeight,
              color: getComputedStyle(textEditState.element).color,
              background: "rgba(12,140,233,0.08)",
              border: "2px solid rgba(12,140,233,0.6)",
              borderRadius: 2,
              outline: "none",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
            }}
          >
            {textEditState.originalText}
          </div>
        </div>
      )}
      {/* Canvas action feedback (undo/redo) */}
      <CanvasToast />
    </>
  );
});

/** Brief centered label on the canvas that fades out */
const CanvasToast = React.memo(function CanvasToast() {
  const toast = useEditorStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 2147483647,
        pointerEvents: "none",
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        padding: "8px 20px",
        borderRadius: 8,
        animation: "canvasToastFade 1.5s ease-out forwards",
      }}
    >
      {toast.message}
      <style>{`
        @keyframes canvasToastFade {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
        }
      `}</style>
    </div>
  );
});
