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
  const selectElement = useEditorStore((s) => s.selectElement);
  const setHoveredElement = useEditorStore((s) => s.setHoveredElement);

  // Hide #root — the iframe replaces it
  useEffect(() => {
    if (mode !== "edit") return;
    const appRoot = document.getElementById("root");
    if (appRoot) appRoot.style.display = "none";
    return () => {
      if (appRoot) appRoot.style.display = "";
    };
  }, [mode]);

  // Clear selection + hover on breakpoint change — the iframe remounts with
  // a fresh DOM, so any carried-over selection refers to a stale element.
  // Without this, the overlay paints resize handles in the top-left corner
  // of the newly-loading frame (element rect collapses to 0,0).
  useEffect(() => {
    selectElement(null);
    setHoveredElement(null);
  }, [breakpoint, selectElement, setHoveredElement]);

  if (mode !== "edit") return null;

  // key forces full remount on breakpoint change
  const iframeKey = `page-${breakpoint}`;

  return <BreakpointIframe key={iframeKey} width={breakpoint} />;
});

// ── Iframe for breakpoint preview ──────────────────────────────────────────

const BreakpointIframe = React.memo(function BreakpointIframe({ width }: { width: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Start at 0 — the frame unfurls from 0 to the iframe's measured
  // scrollHeight on load. The injected `.h-screen` / `.min-h-screen`
  // override (see onLoad below) prevents vh-based layouts from
  // collapsing to 0 at this viewport, so scrollHeight still reports
  // the real natural content size from the very first measurement.
  const heightRef = useRef(0);
  const measuredRef = useRef(false);
  // True once the initial 0→real transition has completed. Subsequent
  // height changes (padding updates, HMR) snap instead of animating,
  // so the canvas doesn't replay a long transition every measurement.
  const settledRef = useRef(false);
  const [height, setHeight] = useState(0);
  const [settled, setSettled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Flips true the first time we read a real scrollHeight from the iframe.
  // The halftone fade only starts after this, so the reveal never lands
  // on the 1000px placeholder height.
  const [measured, setMeasured] = useState(false);
  const [loaderMounted, setLoaderMounted] = useState(true);
  const [wiping, setWiping] = useState(false);
  const selectElement = useEditorStore((s) => s.selectElement);
  const setHoveredElement = useEditorStore((s) => s.setHoveredElement);
  const setFrameRevealed = useEditorStore((s) => s.setFrameRevealed);

  const frameUrl = `${location.origin}${location.pathname}?__canvas_no_overlay`;

  // Before the frame is measured, park the viewport at the top — otherwise
  // a persisted panY (from a previous session that fit a tall frame) leaves
  // the label centered vertically, so the 0-height frame unfurls from the
  // middle of the viewport instead of from the top. Runs once on mount.
  useEffect(() => {
    const vp = useViewportStore.getState();
    vp.setPan(vp.panX, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reveal sequence once the iframe's real height has landed:
  //   1. fitToPage — zoom/pan to fit the real frame size.
  //   2. Height transitions 0 → real over 500ms (single smooth unfurl).
  //   3. After the transition completes, freeze further transitions so
  //      subsequent polling measurements snap instead of re-animating.
  //   4. Halftone fades out after the transition settles.
  //   5. Unmount halftone after fade completes.
  useEffect(() => {
    if (!measured) {
      setLoaderMounted(true);
      setWiping(false);
      setSettled(false);
      settledRef.current = false;
      setFrameRevealed(false);
      return;
    }
    requestAnimationFrame(() => useViewportStore.getState().fitToPage());
    // Freeze the transition shortly after it should have finished so later
    // scrollHeight nudges (images loading, HMR) don't restart the animation.
    const lock = setTimeout(() => {
      settledRef.current = true;
      setSettled(true);
    }, 560);
    const fadeStart = setTimeout(() => {
      setWiping(true);
      setFrameRevealed(true);
    }, 560);
    const unmount = setTimeout(() => setLoaderMounted(false), 1120);
    return () => {
      clearTimeout(lock);
      clearTimeout(fadeStart);
      clearTimeout(unmount);
    };
  }, [measured, setFrameRevealed]);

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
      //
      // Why so many measurements: Chromium has a long-standing quirk where
      // `scrollHeight` on a flex/grid column container excludes trailing
      // `padding-bottom` of the container (content + top padding only). A page
      // whose body/root is `flex flex-col py-48 …` will report scrollHeight
      // short by 192px, cropping the frame and clipping the overlay. BCR bottom
      // and offsetHeight both include the padding, so we take the max.
      const updateHeight = () => {
        void doc.body.offsetHeight;
        const bodyBcr = doc.body.getBoundingClientRect().bottom;
        const docBcr = doc.documentElement.getBoundingClientRect().bottom;
        const h = Math.max(
          doc.body.scrollHeight,
          doc.documentElement.scrollHeight,
          doc.body.offsetHeight,
          doc.documentElement.offsetHeight,
          bodyBcr,
          docBcr,
        );
        if (h > 0 && h !== heightRef.current) {
          const grew = h > heightRef.current;
          heightRef.current = h;
          setHeight(h);
          // During the initial settle window the first measurement often
          // lands before Tailwind + React hydration finish pushing the
          // layout to its real height (common symptom: `pb-16` on the
          // outer page doesn't make it into the initial fit, so the
          // bottom padding ends up off-screen beneath the toolbar).
          // fitToPage normally only runs once on `measured`; re-run it
          // while we're still settling so the viewport keeps up with the
          // post-measure growth. Once `settledRef` flips true (see the
          // lock timer keyed on `measured`), user zoom/pan is respected.
          if (grew && !settledRef.current && measuredRef.current) {
            requestAnimationFrame(() => useViewportStore.getState().fitToPage());
          }
        }
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
          // No selectElement here — annotate mode is its own tool and the
          // properties panel / spacing handles / selection outline shouldn't
          // come along when the user just wanted to drop an annotation.
          // ContextMenu reads the target directly from the menu payload.
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
        // Hide the frame (and its label) until the iframe has reported its
        // real height AND fitToPage has applied — otherwise the container
        // paints once at the restored-from-localStorage transform, then
        // jumps to the fitted transform the next frame. The user sees that
        // jump as a flicker-to-center then snap-to-top before the unfurl
        // animation starts. The halftone inside the frame still runs so the
        // loading state is visible; it just lives in its final position.
        opacity: measured ? 1 : 0,
        transition: measured ? "opacity 160ms ease-out" : undefined,
      }}
    >
      {/* Label */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        marginBottom: 12, userSelect: "none",
      }}>
        <span style={{ fontSize: 10, color: COL.purple, fontFamily: C.mono, fontWeight: 500 }}>
          {getBreakpointLabel(width)}
        </span>
        <span style={{ fontSize: 11, color: C.fgDim, fontFamily: C.mono }}>
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
          transition: settled ? undefined : "height 500ms cubic-bezier(0.22, 0.8, 0.2, 1)",
        }}
      >
        {/* Frame — holds the iframe. The loading halftone is layered on
            top as a sibling below, scoped to this same rect, so the cover
            + reveal effect stays inside the canvas area instead of bleeding
            across the editor chrome. A 1px ring delineates the canvas
            boundary against the dark editor background. */}
        {/* Frame card sizes purely via `absolute inset-0` so it tracks the
             wrap's transitioning height exactly. Setting inline height here
             would override `bottom: 0` and snap the card to its final size
             while the wrap is still animating, exposing iframe content below
             the halftone cover during the unfurl. */}
        <div
          className={[
            "absolute inset-0 overflow-hidden rounded-lg",
            "ring-1 ring-white/10",
            "transition-[background-color,box-shadow] duration-[350ms] ease-out",
            loaded
              ? "bg-white shadow-[0_4px_32px_rgba(0,0,0,0.4)]"
              : "bg-transparent shadow-none",
          ].join(" ")}
        >
          <iframe
            ref={iframeRef}
            src={frameUrl}
            scrolling="no"
            className="block border-0 overflow-hidden"
            style={{
              width,
              height,
              transition: settled ? undefined : "height 500ms cubic-bezier(0.22, 0.8, 0.2, 1)",
            }}
            title={`${width}px preview`}
          />
        </div>

        {/* Frame-scoped halftone cover — sits on top of the iframe and
            beneath the overlay canvas, so the loading/reveal effect only
            fills the canvas (iframe) rect rather than the whole viewport.
            Fades out via `wiping` once the iframe has measured. */}
        {loaderMounted && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              pointerEvents: wiping ? "none" : "auto",
              overflow: "hidden",
              borderRadius: 8,
            }}
          >
            <HalftoneLoader wiping={wiping} rounded="" />
          </div>
        )}

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
            // Hide overlay drawings (selection handles, hover outlines,
            // badges) while the halftone covers the frame — otherwise on
            // breakpoint change the re-mounted iframe's stale element refs
            // paint resize handles in the top-left corner before the
            // halftone has revealed. Fades in with the wipe.
            opacity: loaderMounted ? 0 : 1,
            transition: "opacity 220ms ease-out",
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
    </>
  );
});
