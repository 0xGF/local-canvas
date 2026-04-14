import React, { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { deepElementFromPoint } from "../utils/element-picker.js";
import { wasDragRecent } from "../utils/drag-state.js";
import { THEME } from "../theme.js";

const C = THEME;

/**
 * Always renders a single iframe at the current breakpoint width.
 * Every breakpoint works identically — same iframe, same canvas overlay,
 * same zoom/pan, same selection.
 */
export const ResponsiveFrame = React.memo(function ResponsiveFrame() {
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const mode = useEditorStore((s) => s.mode);

  // Hide #root — the iframe replaces it
  useEffect(() => {
    if (mode !== "edit") return;
    const appRoot = document.getElementById("root");
    if (appRoot) appRoot.style.display = "none";
    return () => {
      if (appRoot) appRoot.style.display = "";
    };
  }, [mode]);

  if (mode !== "edit") return null;

  // key forces full remount on breakpoint change so iframe reloads at new width
  return <BreakpointIframe key={breakpoint} width={breakpoint} />;
});

// ── Iframe for breakpoint preview ──────────────────────────────────────────

const BreakpointIframe = React.memo(function BreakpointIframe({ width }: { width: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const heightRef = useRef(900);
  const [height, setHeight] = useState(900);
  const [loaded, setLoaded] = useState(false);
  const selectElement = useEditorStore((s) => s.selectElement);
  const setHoveredElement = useEditorStore((s) => s.setHoveredElement);

  const frameUrl = `${location.origin}${location.pathname}?__canvas_no_overlay`;

  // Fit to page after mount
  useEffect(() => {
    requestAnimationFrame(() => useViewportStore.getState().fitToPage());
  }, [width]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let ro: ResizeObserver | null = null;
    let cleanupListeners: (() => void) | null = null;

    function onLoad() {
      const doc = iframe!.contentDocument;
      if (!doc) return;
      setLoaded(true);

      // Remove height constraints + disable scrolling + prevent text selection in edit mode
      const style = doc.createElement("style");
      style.textContent = [
        "html, body { overflow: hidden !important; height: auto !important; min-height: 0 !important; max-height: none !important; }",
        "#root, #__next, #app, main { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; }",
        "*, *::before, *::after { user-select: none !important; -webkit-user-select: none !important; }",
      ].join("\n");
      doc.head.appendChild(style);

      // Also block selectstart events
      doc.addEventListener("selectstart", (e) => e.preventDefault(), true);

      // Dynamic height
      const updateHeight = () => {
        void doc.body.offsetHeight;
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, doc.body.offsetHeight);
        if (h > 0) { heightRef.current = h; setHeight(h); }
      };
      setTimeout(updateHeight, 100);
      ro = new ResizeObserver(updateHeight);
      ro.observe(doc.body);

      // Zoom/pan: forward wheel events from iframe to viewport store
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const iframeRect = iframe!.getBoundingClientRect();
        const cx = iframeRect.left + e.clientX * (iframeRect.width / width);
        const cy = iframeRect.top + e.clientY * (iframeRect.height / heightRef.current);
        const vp = useViewportStore.getState();
        if (e.ctrlKey || e.metaKey) {
          const sens = Math.abs(e.deltaY) < 10 ? 0.02 : 0.08;
          const d = e.deltaY > 0 ? -sens : sens;
          vp.setZoom(vp.zoom + d * vp.zoom, cx, cy);
        } else {
          vp.setPan(vp.panX - e.deltaX, vp.panY - e.deltaY);
        }
      };
      doc.addEventListener("wheel", onWheel, { passive: false, capture: true });

      // Selection — CanvasOverlayLayer handles the highlight
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Skip if a drag just ended (margin/resize/spacing)
        if (wasDragRecent(300)) return;
        const target = deepElementFromPoint(e.clientX, e.clientY, doc);
        if (!target) return;

        const source = resolveSource(target);

        // Ctrl+Click or Meta+Click — open context menu
        if (e.ctrlKey || e.metaKey) {
          // Select the element first
          selectElement({
            element: target,
            source,
            rect: target.getBoundingClientRect(),
            className: typeof target.className === "string" ? target.className : "",
            tagName: target.tagName.toLowerCase(),
            iframeRef: iframe!,
          });
          // Translate click coords to screen space for menu positioning
          const ir = iframe!.getBoundingClientRect();
          const naturalW = parseInt(iframe!.style.width) || ir.width;
          const scale = ir.width / naturalW;
          useEditorStore.getState().setContextMenu({
            x: e.clientX * scale + ir.left,
            y: e.clientY * scale + ir.top,
            element: target,
            source,
          });
          return;
        }

        // If clicking an ancestor of the current selection, only keep the child
        // selected if the click is near the child's edges (margin/padding zone).
        const sel = useEditorStore.getState().selectedElement;
        if (sel?.element && target !== sel.element && target.contains(sel.element)) {
          const cr = sel.element.getBoundingClientRect();
          const pad = 30;
          const nearChild = e.clientX >= cr.left - pad && e.clientX <= cr.right + pad &&
                            e.clientY >= cr.top - pad && e.clientY <= cr.bottom + pad;
          if (nearChild) return;
        }
        // Close any open context menu on regular click
        useEditorStore.getState().setContextMenu(null);
        selectElement({
          element: target,
          source,
          rect: target.getBoundingClientRect(),
          className: typeof target.className === "string" ? target.className : "",
          tagName: target.tagName.toLowerCase(),
          iframeRef: iframe!,
        });
      };

      // Hover — CanvasOverlayLayer reads from store
      const onMouseMove = (e: MouseEvent) => {
        const target = deepElementFromPoint(e.clientX, e.clientY, doc);
        setHoveredElement(target || null);
      };

      const onMouseLeave = () => {
        setHoveredElement(null);
      };

      // Forward mouse events from iframe to main document with translated coordinates
      // so spacing drag, resize handles, and cursor hints work on the canvas overlay
      const toScreen = (e: MouseEvent) => {
        const ir = iframe!.getBoundingClientRect();
        const naturalW = parseInt(iframe!.style.width) || ir.width;
        const scale = ir.width / naturalW;
        return { clientX: e.clientX * scale + ir.left, clientY: e.clientY * scale + ir.top };
      };
      const forwardMouseDown = (e: MouseEvent) => {
        const c = toScreen(e);
        document.dispatchEvent(new MouseEvent("mousedown", { clientX: c.clientX, clientY: c.clientY, button: e.button, bubbles: true, cancelable: true }));
      };
      const forwardMouseMove = (e: MouseEvent) => {
        const c = toScreen(e);
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: c.clientX, clientY: c.clientY, bubbles: true }));
      };
      const forwardMouseUp = (e: MouseEvent) => {
        const c = toScreen(e);
        document.dispatchEvent(new MouseEvent("mouseup", { clientX: c.clientX, clientY: c.clientY, bubbles: true }));
      };

      // Right-click context menu
      const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const target = deepElementFromPoint(e.clientX, e.clientY, doc);
        if (!target) return;
        const source = resolveSource(target);
        selectElement({
          element: target,
          source,
          rect: target.getBoundingClientRect(),
          className: typeof target.className === "string" ? target.className : "",
          tagName: target.tagName.toLowerCase(),
          iframeRef: iframe!,
        });
        const c = toScreen(e);
        useEditorStore.getState().setContextMenu({
          x: c.clientX,
          y: c.clientY,
          element: target,
          source,
        });
      };

      // Prevent native drag on links/images
      const blockDrag = (e: Event) => e.preventDefault();

      doc.addEventListener("click", onClick, true);
      doc.addEventListener("contextmenu", onContextMenu, true);
      doc.addEventListener("mousemove", onMouseMove, true);
      doc.addEventListener("mousedown", forwardMouseDown, true);
      doc.addEventListener("mousemove", forwardMouseMove, true);
      doc.addEventListener("mouseup", forwardMouseUp, true);
      doc.addEventListener("mouseleave", onMouseLeave);
      doc.addEventListener("dragstart", blockDrag, true);
      cleanupListeners = () => {
        doc.removeEventListener("wheel", onWheel, true);
        doc.removeEventListener("click", onClick, true);
        doc.removeEventListener("contextmenu", onContextMenu, true);
        doc.removeEventListener("mousemove", onMouseMove, true);
        doc.removeEventListener("mousedown", forwardMouseDown, true);
        doc.removeEventListener("mousemove", forwardMouseMove, true);
        doc.removeEventListener("mouseup", forwardMouseUp, true);
        doc.removeEventListener("mouseleave", onMouseLeave);
        doc.removeEventListener("dragstart", blockDrag, true);
      };
    }

    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      ro?.disconnect();
      cleanupListeners?.();
    };
  }, [selectElement, setHoveredElement]);

  return (
    <div
      id="responsive-frame-container"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 40,
        pointerEvents: "auto",
      }}
    >
      {/* Label */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        marginBottom: 12, userSelect: "none",
      }}>
        <span style={{ fontSize: 11, color: "#666", fontFamily: C.mono }}>
          {width}px
        </span>
      </div>

      {/* Frame */}
      <div style={{
        width,
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 4px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
        overflow: "hidden",
        position: "relative",
      }}>
        <iframe
          ref={iframeRef}
          src={frameUrl}
          scrolling="no"
          style={{
            width,
            height,
            border: "none",
            display: "block",
            overflow: "hidden",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.3s",
          }}
          title={`${width}px preview`}
        />

        {!loaded && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#666", fontSize: 12, fontFamily: C.mono,
          }}>
            Loading...
          </div>
        )}
      </div>
    </div>
  );
});
