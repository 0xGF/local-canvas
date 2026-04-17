import { useEffect, useCallback, useRef, useState } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { getBreakpointPrefix } from "../../shared/breakpoints.js";
import { TW_PX, TW_NAMES } from "./constants.js";
import { attachToDocumentAndIframe, bind } from "../utils/iframe-events.js";
import { markDragEnd } from "../utils/drag-state.js";
import { sourceStyleHasProperty } from "../utils/inline-style-source.js";

export type HandlePosition = "top" | "right" | "bottom" | "left" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface ResizeHandle {
  x: number;
  y: number;
  w: number;
  h: number;
  position: HandlePosition;
  cursor: string;
}

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;

function pxToTw(px: number): string {
  if (px <= 0) return "0";
  const rounded = Math.round(px);
  const idx = TW_PX.indexOf(rounded);
  if (idx >= 0) return TW_NAMES[idx];
  return `[${rounded}px]`;
}

/**
 * Compute resize handle positions from a selection rect.
 */
export function computeHandles(rect: DOMRect, iframeOffset: { x: number; y: number; scale: number }): ResizeHandle[] {
  const x = rect.left * iframeOffset.scale + iframeOffset.x;
  const y = rect.top * iframeOffset.scale + iframeOffset.y;
  const w = rect.width * iframeOffset.scale;
  const h = rect.height * iframeOffset.scale;
  const midX = x + w / 2;
  const midY = y + h / 2;

  return [
    // Edge handles
    { x: midX - HANDLE_HALF, y: y - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "top", cursor: "ns-resize" },
    { x: x + w - HANDLE_HALF, y: midY - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "right", cursor: "ew-resize" },
    { x: midX - HANDLE_HALF, y: y + h - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "bottom", cursor: "ns-resize" },
    { x: x - HANDLE_HALF, y: midY - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "left", cursor: "ew-resize" },
    // Corner handles
    { x: x - HANDLE_HALF, y: y - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "top-left", cursor: "nwse-resize" },
    { x: x + w - HANDLE_HALF, y: y - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "top-right", cursor: "nesw-resize" },
    { x: x - HANDLE_HALF, y: y + h - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "bottom-right", cursor: "nwse-resize" },
    { x: x + w - HANDLE_HALF, y: y + h - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE, position: "bottom-left", cursor: "nesw-resize" },
  ];
}

/**
 * Draw resize handles on the canvas.
 */
export function paintHandles(ctx: CanvasRenderingContext2D, handles: ResizeHandle[], _dpr: number) {
  // Note: ctx already has setTransform(dpr, ...) from paintFrame — don't scale again
  ctx.save();
  for (const handle of handles) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#06B6FF";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(handle.x + handle.w / 2, handle.y + handle.h / 2, (handle.w / 2) * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

interface DragState {
  handle: ResizeHandle;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  moved: boolean;
  // Snapshotted at mousedown so we don't confuse the drag's own preview
  // updates on `el.style` with state that was really in source.
  hadInlineWidthAtStart: boolean;
  hadInlineHeightAtStart: boolean;
}

/**
 * Hook for resize handles: drag to change w- and h- Tailwind classes.
 */
export function useResizeHandles(handlesRef: React.MutableRefObject<ResizeHandle[]>) {
  const { sendMutation } = useWebSocket();
  const incrementPending = useEditorStore((s) => s.incrementPending);
  const dragRef = useRef<DragState | null>(null);
  const [resizeTooltip, setResizeTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tooltipRafRef = useRef(0);

  const commitSize = useCallback((property: "w" | "h", pxValue: number) => {
    const sel = useEditorStore.getState().selectedElement;
    if (!sel?.source) return;
    const twVal = pxToTw(pxValue);
    const classes = (sel.className || "").split(/\s+/).filter(Boolean);
    const bp = getBreakpointPrefix(useEditorStore.getState().breakpoint);
    const prefix = property;

    // Inline width/height wins against utility classes — route through
    // modify-style so the resize actually changes rendered size. Uses the
    // drag-start snapshot so we don't mistake our own preview updates for
    // real source state.
    const inlineKey = property === "w" ? "width" : "height";
    const hadInline = property === "w"
      ? dragRef.current?.hadInlineWidthAtStart
      : dragRef.current?.hadInlineHeightAtStart;
    if (hadInline) {
      sendMutation({
        type: "modify-style",
        source: sel.source,
        property: inlineKey,
        value: pxValue > 0 ? `${pxValue}px` : "",
      }).then(() => incrementPending());
      return;
    }

    let old: string | undefined;
    if (bp) {
      old = classes.find((c) => c === `${bp}:${prefix}` || c.startsWith(`${bp}:${prefix}-`) || c.startsWith(`${bp}:${prefix}-[`));
    }
    if (!old) {
      old = classes.find((c) => c === prefix || c.startsWith(prefix + "-") || c.startsWith(prefix + "-["));
    }

    const bare = twVal !== "0" ? `${prefix}-${twVal}` : "";
    const next = bare && bp ? `${bp}:${bare}` : bare;

    sendMutation({
      type: "modify-class",
      source: sel.source,
      remove: old ? [old] : undefined,
      add: next ? [next] : undefined,
    }).then(() => incrementPending());
  }, [sendMutation, incrementPending]);

  useEffect(() => {
    function hitTestHandle(x: number, y: number): ResizeHandle | null {
      // Slightly larger hit area for easier grabbing
      const tolerance = 4;
      for (const handle of handlesRef.current) {
        if (x >= handle.x - tolerance && x <= handle.x + handle.w + tolerance &&
            y >= handle.y - tolerance && y <= handle.y + handle.h + tolerance) {
          return handle;
        }
      }
      return null;
    }

    function onMouseDown(e: MouseEvent) {
      const handle = hitTestHandle(e.clientX, e.clientY);
      if (!handle) return;

      const sel = useEditorStore.getState().selectedElement;
      if (!sel?.element) return;

      e.preventDefault();
      e.stopPropagation();

      const cs = getComputedStyle(sel.element);
      dragRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: parseFloat(cs.width) || sel.rect.width,
        startHeight: parseFloat(cs.height) || sel.rect.height,
        moved: false,
        hadInlineWidthAtStart: sourceStyleHasProperty(sel.element, "width"),
        hadInlineHeightAtStart: sourceStyleHasProperty(sel.element, "height"),
      };
      document.body.style.cursor = handle.cursor;
    }

    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) {
        // Cursor hint
        const handle = hitTestHandle(e.clientX, e.clientY);
        if (handle) {
          document.body.style.cursor = handle.cursor;
        }
        return;
      }

      const zoom = useViewportStore.getState().zoom;
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;

      const sel = useEditorStore.getState().selectedElement;
      if (!sel?.element) return;

      let newW = drag.startWidth;
      let newH = drag.startHeight;
      const pos = drag.handle.position;

      // Compute new dimensions based on handle position
      if (pos === "right" || pos === "top-right" || pos === "bottom-right") {
        newW = Math.max(0, drag.startWidth + dx);
      }
      if (pos === "left" || pos === "top-left" || pos === "bottom-left") {
        newW = Math.max(0, drag.startWidth - dx);
      }
      if (pos === "bottom" || pos === "bottom-left" || pos === "bottom-right") {
        newH = Math.max(0, drag.startHeight + dy);
      }
      if (pos === "top" || pos === "top-left" || pos === "top-right") {
        newH = Math.max(0, drag.startHeight - dy);
      }

      // Shift: preserve aspect ratio (corners only — edges only change one axis)
      const isCorner = pos.includes("-");
      if (e.shiftKey && isCorner && drag.startWidth > 0 && drag.startHeight > 0) {
        const aspect = drag.startWidth / drag.startHeight;
        // Pick the axis that moved the most (in absolute terms) as the driver
        const wDelta = Math.abs(newW - drag.startWidth);
        const hDelta = Math.abs(newH - drag.startHeight);
        if (wDelta / drag.startWidth > hDelta / drag.startHeight) {
          newH = newW / aspect;
        } else {
          newW = newH * aspect;
        }
      }

      newW = Math.round(newW);
      newH = Math.round(newH);

      // Inline style preview
      const affectsW = pos.includes("left") || pos.includes("right") || (e.shiftKey && isCorner);
      const affectsH = pos.includes("top") || pos.includes("bottom") || (e.shiftKey && isCorner);
      if (affectsW) sel.element.style.width = newW + "px";
      if (affectsH) sel.element.style.height = newH + "px";

      // Throttled tooltip
      cancelAnimationFrame(tooltipRafRef.current);
      const cx = e.clientX, cy = e.clientY;
      const text = e.shiftKey && isCorner ? `${newW} × ${newH} (locked)` : `${newW} × ${newH}`;
      tooltipRafRef.current = requestAnimationFrame(() => {
        setResizeTooltip({ x: cx, y: cy, text });
      });
    }

    function suppressClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      document.removeEventListener("click", suppressClick, true);
    }

    function onMouseUp() {
      const drag = dragRef.current;
      if (!drag) return;

      cancelAnimationFrame(tooltipRafRef.current);
      if (drag.moved) {
        const sel = useEditorStore.getState().selectedElement;
        if (sel?.element) {
          const cs = getComputedStyle(sel.element);
          const pos = drag.handle.position;
          const el = sel.element;
          const didW = pos.includes("left") || pos.includes("right");
          const didH = pos.includes("top") || pos.includes("bottom");

          if (didW) {
            const finalW = Math.round(parseFloat(cs.width) || 0);
            commitSize("w", finalW);
          }
          if (didH) {
            const finalH = Math.round(parseFloat(cs.height) || 0);
            commitSize("h", finalH);
          }

          // Keep inline-style preview until HMR actually applies the new
          // class, then clear. Without this you get a flash back to the old
          // size while the mutation is written to disk + HMR reloads.
          if (didW || didH) {
            const observer = new MutationObserver(() => {
              if (didW) el.style.width = "";
              if (didH) el.style.height = "";
              observer.disconnect();
            });
            observer.observe(el, { attributes: true, attributeFilter: ["class"] });
            // Safety fallback: if no class change observed within 2s, clear anyway
            setTimeout(() => { observer.disconnect(); if (didW) el.style.width = ""; if (didH) el.style.height = ""; }, 2000);
          }
        }

        markDragEnd();
        document.addEventListener("click", suppressClick, true);
        setTimeout(() => document.removeEventListener("click", suppressClick, true), 200);
      }

      dragRef.current = null;
      setResizeTooltip(null);
      document.body.style.cursor = "";
    }

    return attachToDocumentAndIframe([
      bind("mousedown", onMouseDown),
      bind("mousemove", onMouseMove),
      bind("mouseup", onMouseUp),
    ], { translateCoords: true });
  }, [commitSize, handlesRef]);

  return { resizeTooltip };
}
