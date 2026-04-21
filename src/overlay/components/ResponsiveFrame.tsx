import React, { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { deepElementFromPoint } from "../utils/element-picker.js";
import { wasDragRecent } from "../utils/drag-state.js";
import { getIframeOffset } from "../utils/iframe-events.js";
import { HAS_DRAW_ELEMENT, COL } from "../canvas/constants.js";
import { BREAKPOINT_PRESETS } from "../../shared/breakpoints.js";
import { THEME } from "../theme.js";
import { HalftoneLoader } from "./ui/halftone-loader.js";

const C = THEME;

function getBreakpointLabel(width: number): string {
  const preset = BREAKPOINT_PRESETS.find(bp => bp.width === width);
  if (!preset || !preset.prefix) return "Editing base styles";
  return `Editing ${preset.prefix}: styles (${width}px+)`;
}

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

  // key forces full remount on breakpoint change
  const iframeKey = `page-${breakpoint}`;

  return <BreakpointIframe key={iframeKey} width={breakpoint} />;
});

// ── Iframe for breakpoint preview ──────────────────────────────────────────

const BreakpointIframe = React.memo(function BreakpointIframe({ width }: { width: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Needs a non-zero default so scrollHeight measurement works for
  // vh-based layouts (at iframe height 0, `100vh` sections collapse to 0
  // and scrollHeight returns bogus values). 1000 is a reasonable viewport
  // that most pages will either match or grow beyond.
  const heightRef = useRef(1000);
  const measuredRef = useRef(false);
  const [height, setHeight] = useState(1000);
  const [loaded, setLoaded] = useState(false);
  // Flips true the first time we read a real scrollHeight from the iframe.
  // The visible frame stays at opacity 0 until then, so the user never
  // sees it morph from the 1000px placeholder to the real page height —
  // a fullscreen halftone covers the viewport and fades out only after
  // the frame is sized correctly and fitToPage has run.
  const [measured, setMeasured] = useState(false);
  const [loaderMounted, setLoaderMounted] = useState(true);
  const [wiping, setWiping] = useState(false);
  const selectElement = useEditorStore((s) => s.selectElement);
  const setHoveredElement = useEditorStore((s) => s.setHoveredElement);

  const frameUrl = `${location.origin}${location.pathname}?__canvas_no_overlay`;

  // Reveal sequence once the iframe's real height is known:
  //   1. fitToPage — zoom/pan to fit the real frame size.
  //   2. Next frame: fade frame in, start halftone wipe.
  //   3. Unmount halftone after fade completes.
  // fitToPage is intentionally NOT called on mount anymore — fitting to
  // the 1000px placeholder before the real height lands makes the frame
  // appear to grow past the initial viewport when it resizes.
  useEffect(() => {
    if (!measured) { setLoaderMounted(true); setWiping(false); return; }
    requestAnimationFrame(() => useViewportStore.getState().fitToPage());
    const fadeStart = setTimeout(() => setWiping(true), 120);
    const unmount = setTimeout(() => setLoaderMounted(false), 560);
    return () => {
      clearTimeout(fadeStart);
      clearTimeout(unmount);
    };
  }, [measured]);

  // Safety: if the iframe never reports a positive scrollHeight (blocked
  // load, cross-origin hiccup, empty page), reveal with the 1000px default
  // after 3s rather than trapping the user behind the halftone forever.
  useEffect(() => {
    if (measured) return;
    const t = setTimeout(() => {
      if (!measuredRef.current) {
        measuredRef.current = true;
        setMeasured(true);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [measured]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let ro: ResizeObserver | null = null;
    let heightPoll: number | null = null;
    let cleanupListeners: (() => void) | null = null;

    function onLoad() {
      const doc = iframe!.contentDocument;
      if (!doc) return;
      setLoaded(true);

      // Remove height constraints + disable scrolling + prevent text selection in edit mode.
      // `.h-screen` / `.min-h-screen` overrides are critical: without them, any
      // layout using 100vh traps scrollHeight at the iframe's current viewport
      // height, so the frame can never grow to the page's natural size.
      const style = doc.createElement("style");
      style.textContent = [
        "html, body { overflow: hidden !important; height: auto !important; min-height: 0 !important; max-height: none !important; }",
        "#root, #__next, #app, main { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; }",
        ".h-screen, .min-h-screen, [class*=':h-screen'], [class*=':min-h-screen'] { height: auto !important; min-height: 0 !important; max-height: none !important; }",
        "*, *::before, *::after { user-select: none !important; -webkit-user-select: none !important; }",
      ].join("\n");
      doc.head.appendChild(style);

      // Also block selectstart events
      doc.addEventListener("selectstart", (e) => e.preventDefault(), true);

      // Dynamic height. First valid read also flips `measured`, which
      // triggers fitToPage + the halftone fade reveal.
      const updateHeight = () => {
        void doc.body.offsetHeight;
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, doc.body.offsetHeight);
        if (h > 0 && h !== heightRef.current) { heightRef.current = h; setHeight(h); }
        if (h > 0 && !measuredRef.current) {
          measuredRef.current = true;
          setMeasured(true);
        }
      };
      setTimeout(updateHeight, 100);
      ro = new ResizeObserver(updateHeight);
      ro.observe(doc.body);
      ro.observe(doc.documentElement);
      // Polling fallback — ResizeObserver can miss layout changes driven by
      // HMR or ancestor size constraints (e.g. when a padded element grows
      // inside an absolutely-positioned parent). Re-read every 300ms so any
      // missed growth is reflected on the canvas + wrap without a reload.
      heightPoll = window.setInterval(updateHeight, 300);

      // Zoom/pan: forward wheel events from iframe to viewport store
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        // e.clientX/Y are iframe-doc coords; scale by viewport.zoom (source
        // of truth) + iframe origin to get outer screen coords. The previous
        // `iframeRect.width / width` formula was wrong in components mode
        // where effectiveWidth != width.
        const { x, y, scale } = getIframeOffset(iframe!);
        const cx = x + e.clientX * scale;
        const cy = y + e.clientY * scale;
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
        // While the user is holding Space (interact mode) we must let the
        // underlying app receive its own clicks. Bail out *before* calling
        // preventDefault — otherwise buttons/links in the iframe go dead.
        if (useEditorStore.getState().interacting) return;
        e.preventDefault();
        e.stopPropagation();
        // Skip if a drag just ended (margin/resize/spacing)
        if (wasDragRecent(300)) return;
        // Shift+click is handled by useSelection's addToSelection — don't interfere
        // Alt+click comes from marquee select release — don't wipe multi-selection
        if (e.shiftKey || e.altKey) return;

        // Annotate tool: plain click in annotate mode opens the Ask-AI
        // prompt centred over the clicked element. Must run here (not in
        // useSelection) because iframe clicks arrive with iframe-local
        // coords, which useSelection.elementAtPoint can't decode.
        if (useEditorStore.getState().annotateMode && !e.ctrlKey && !e.metaKey) {
          const target = deepElementFromPoint(e.clientX, e.clientY, doc);
          if (!target) return;
          const source = resolveSource(target);
          const rect = target.getBoundingClientRect();
          const { x: ox, y: oy, scale } = getIframeOffset(iframe!);
          selectElement({
            element: target,
            source,
            rect,
            className: typeof target.className === "string" ? target.className : "",
            tagName: target.tagName.toLowerCase(),
            iframeRef: iframe!,
          });
          // Anchor centred over the element (screen space).
          const menuX = (rect.left + rect.width / 2) * scale + ox;
          const menuY = rect.top * scale + oy;
          useEditorStore.getState().setContextMenu({
            x: menuX, y: menuY - 6,
            element: target, source,
            initialMode: "ai-prompt",
          });
          return;
        }
        const target = deepElementFromPoint(e.clientX, e.clientY, doc);
        if (!target) return;

        const source = resolveSource(target);

        // Ctrl+Click or Meta+Click — open context menu
        if (e.ctrlKey || e.metaKey) {
          selectElement({
            element: target,
            source,
            rect: target.getBoundingClientRect(),
            className: typeof target.className === "string" ? target.className : "",
            tagName: target.tagName.toLowerCase(),
            iframeRef: iframe!,
          });
          const { x: ox, y: oy, scale } = getIframeOffset(iframe!);
          useEditorStore.getState().setContextMenu({
            x: e.clientX * scale + ox,
            y: e.clientY * scale + oy,
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
        if (useEditorStore.getState().interacting) {
          setHoveredElement(null);
          return;
        }
        const target = deepElementFromPoint(e.clientX, e.clientY, doc);
        setHoveredElement(target || null);
      };

      const onMouseLeave = () => {
        setHoveredElement(null);
      };

      // Forward mouse events from iframe to main document with translated coordinates
      // so spacing drag, resize handles, and cursor hints work on the canvas overlay
      const toScreen = (e: MouseEvent) => {
        const { x, y, scale } = getIframeOffset(iframe!);
        return { clientX: e.clientX * scale + x, clientY: e.clientY * scale + y };
      };
      const forwardMouseDown = (e: MouseEvent) => {
        if (useEditorStore.getState().interacting) return;
        const c = toScreen(e);
        document.dispatchEvent(new MouseEvent("mousedown", { clientX: c.clientX, clientY: c.clientY, button: e.button, bubbles: true, cancelable: true, altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey }));
      };
      const forwardMouseMove = (e: MouseEvent) => {
        if (useEditorStore.getState().interacting) return;
        const c = toScreen(e);
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: c.clientX, clientY: c.clientY, bubbles: true, altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey }));
      };
      const forwardMouseUp = (e: MouseEvent) => {
        if (useEditorStore.getState().interacting) return;
        const c = toScreen(e);
        document.dispatchEvent(new MouseEvent("mouseup", { clientX: c.clientX, clientY: c.clientY, bubbles: true, altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey }));
      };

      // Right-click context menu
      const onContextMenu = (e: MouseEvent) => {
        // Same reasoning as onClick — during interact mode the app owns the event.
        if (useEditorStore.getState().interacting) return;
        e.preventDefault();
        e.stopPropagation();
        const target = deepElementFromPoint(e.clientX, e.clientY, doc);
        if (!target) return;
        const source = resolveSource(target);
        // Preserve multi-selection if right-clicking an element that's in the set
        const multi = useEditorStore.getState().multiSelection;
        const isInMulti = multi.length > 1 && multi.some(s => s.element === target);
        if (!isInMulti) {
          selectElement({
            element: target,
            source,
            rect: target.getBoundingClientRect(),
            className: typeof target.className === "string" ? target.className : "",
            tagName: target.tagName.toLowerCase(),
            iframeRef: iframe!,
          });
        }
        const c = toScreen(e);
        useEditorStore.getState().setContextMenu({
          x: c.clientX,
          y: c.clientY,
          element: target,
          source,
        });
      };

      // Prevent native drag on links/images (only in edit mode — interact mode
      // lets the app use its own drag & drop).
      const blockDrag = (e: Event) => {
        if (useEditorStore.getState().interacting) return;
        e.preventDefault();
      };

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
      if (heightPoll !== null) window.clearInterval(heightPoll);
      cleanupListeners?.();
    };
  }, [selectElement, setHoveredElement]);

  return (
    <>
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
        // Hidden until the real height lands + viewport fits. Prevents any
        // visible morph from the 1000px placeholder default.
        opacity: measured ? 1 : 0,
        transition: "opacity 260ms ease-out",
      }}
    >
      {/* Label */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        marginBottom: 12, userSelect: "none",
      }}>
        <span style={{ fontSize: 10, color: "#874EFF", fontFamily: C.mono, fontWeight: 500 }}>
          {getBreakpointLabel(width)}
        </span>
        <span style={{ fontSize: 11, color: "#666", fontFamily: C.mono }}>
          {width}px
        </span>
      </div>

      {/* Frame-and-overlay wrapper — creates a relative-positioned box
          the canvas can absolute-position inside. The canvas MUST be a
          sibling of the iframe's *parent* (not the iframe itself) —
          iframes create their own compositing layer that stubbornly
          paints on top of absolutely-positioned sibling elements even
          with higher z-index. Hoisting the canvas up one level above
          the iframe's frame-div works. */}
      <div
        style={{
          width,
          height,
          position: "relative",
        }}
      >
        {/* Frame — holds the iframe. A fullscreen halftone covers the
            viewport during load (see sibling below), so the iframe fades
            in at the correct size along with the container, with no
            in-frame loader to coordinate. Card shadow fades in on load. */}
        <div
          className={[
            "absolute inset-0 overflow-hidden rounded-lg",
            "transition-[background-color,box-shadow] duration-[350ms] ease-out",
            loaded
              ? "bg-white shadow-[0_4px_32px_rgba(0,0,0,0.4)]"
              : "bg-transparent shadow-none",
          ].join(" ")}
          style={{ width, height }}
        >
          <iframe
            ref={iframeRef}
            src={frameUrl}
            scrolling="no"
            className="block border-0 overflow-hidden"
            style={{ width, height }}
            title={`${width}px preview`}
          />
        </div>

        {/* Overlay canvas — sibling of the frame-div (not the iframe),
            so it composites above the iframe. Shares the same CSS
            transform chain as the iframe via the outer container, so
            canvas draws at iframe-doc coords land on the right iframe
            pixels without JS sub-pixel math.
            `layoutsubtree` opts its HTML children into html-in-canvas
            layout (Chromium `drawElementImage`). */}
        <canvas
          data-canvas-overlay-target="true"
          {...(HAS_DRAW_ELEMENT ? { layoutsubtree: "" } : {})}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            pointerEvents: "none",
            // Canvas visibility is driven by the container's opacity fade
            // (gated on `measured`) — no separate transition needed here.
          }}
        >
          {HAS_DRAW_ELEMENT && (
            <>
              <div data-canvas-template="hover-outline" style={{
                position: "absolute",
                left: -99999,
                top: -99999,
                pointerEvents: "none",
                boxSizing: "border-box",
                border: `1.5px dashed ${COL.blueDim}`,
                background: "rgba(6, 182, 255, 0.06)",
                borderRadius: 2,
              }} />
              <div data-canvas-template="hover-outline-annotate" style={{
                position: "absolute",
                left: -99999,
                top: -99999,
                pointerEvents: "none",
                boxSizing: "border-box",
                border: `2px solid ${COL.annotate}`,
                background: "rgba(255, 184, 0, 0.08)",
                borderRadius: 2,
              }} />
              <div data-canvas-template="select-outline" style={{
                position: "absolute",
                left: -99999,
                top: -99999,
                pointerEvents: "none",
                boxSizing: "border-box",
                border: `2px solid ${COL.blue}`,
                borderRadius: 2,
              }} />
            </>
          )}
        </canvas>
      </div>
    </div>
    {/* Fullscreen halftone cover — sits outside the transformed
        responsive-frame-container so `position: fixed` behaves correctly
        (CSS transforms on ancestors turn fixed into absolute). Covers the
        viewport while the iframe's real height is being measured + the
        viewport is fit, then fades out revealing the already-sized frame
        underneath. No size morph visible to the user. */}
    {loaderMounted && (
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10,
          pointerEvents: wiping ? "none" : "auto",
        }}
      >
        <HalftoneLoader wiping={wiping} rounded="" />
      </div>
    )}
    </>
  );
});
