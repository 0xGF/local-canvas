import { useEffect, useCallback, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { deepElementFromPoint } from "../utils/element-picker.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { attachToDocumentAndIframe, bind, getEditorIframe, getIframeOffset, iframeRectToScreen, iframeRectToScreenBox } from "../utils/iframe-events.js";
import { getCachedStyle } from "../utils/style-cache.js";
import { wasDragRecent } from "../utils/drag-state.js";

/**
 * Watch the selected element's class attribute for HMR changes.
 * Triggers refreshSelection immediately when className is updated externally.
 */
function useClassObserver() {
  const observerRef = useRef<MutationObserver | null>(null);
  const observedElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const unsub = useEditorStore.subscribe((state) => {
      const el = state.selectedElement?.element;

      if (el === observedElRef.current) return;
      observedElRef.current = el || null;

      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!el || !el.isConnected) return;

      // Watch for class attribute changes (HMR updates)
      observerRef.current = new MutationObserver(() => {
        useEditorStore.getState().refreshSelection();
      });
      observerRef.current.observe(el, { attributes: true, attributeFilter: ["class"] });
    });

    return () => {
      unsub();
      observerRef.current?.disconnect();
    };
  }, []);
}

const OVERLAY_HOST_ID = "local-canvas-host";

export function isClickInsideOverlay(e: MouseEvent): boolean {
  // Don't use composedPath — the canvas covers the viewport so it always
  // includes local-canvas-host. Instead check what shadow DOM element is
  // under the cursor and whether it's interactive (pointerEvents: auto).
  const host = document.getElementById(OVERLAY_HOST_ID);
  const shadow = host?.shadowRoot;
  if (!shadow) return false;

  // Events from inside the iframe arrive with iframe-local coordinates, not
  // viewport coordinates. Feeding those into shadow.elementFromPoint lands
  // somewhere random in the viewport (often the LayersPanel at top-left),
  // which falsely reports the click as overlay chrome and blocks annotate
  // clicks on iframe content. Overlay chrome lives in the main document's
  // shadow root — iframe content can never be overlay chrome — so short-
  // circuit to false for iframe-originated events.
  const targetDoc = (e.target as Node | null)?.ownerDocument;
  if (targetDoc && targetDoc !== document) return false;

  if (!isFinite(e.clientX) || !isFinite(e.clientY)) return false;
  const el = shadow.elementFromPoint(e.clientX, e.clientY);
  if (!el) return false;
  // Canvas and mount container are non-interactive — clicks pass through
  if (el.tagName === "CANVAS") return false;
  if (el === shadow.getElementById("local-canvas-mount")) return false;
  if (el.getRootNode() !== shadow) return false;

  // Walk up to check for interactive overlay elements (toolbar, panel, etc.)
  let node: Element | null = el;
  while (node instanceof HTMLElement) {
    if (node.style.pointerEvents === "none") return false;
    if (node.style.pointerEvents === "auto") return true;
    node = node.parentElement;
  }
  return true;
}

/**
 * True when the cursor is inside the Layers panel. The panel sets
 * `hoveredElement` on row hover so the canvas can mirror-highlight the
 * corresponding DOM element. Without this guard the mousemove handler
 * would clear `hoveredElement` the instant the cursor entered the panel,
 * defeating the hover-mirror feature entirely.
 *
 * Exported so we don't duplicate the shadow-DOM walk in the hover path.
 */
export function isInsideLayersPanel(e: MouseEvent): boolean {
  const host = document.getElementById(OVERLAY_HOST_ID);
  const shadow = host?.shadowRoot;
  if (!shadow) return false;
  // Iframe-originated events have iframe-local coords — they can't be "over
  // the layers panel" in viewport space. Bail out early.
  const targetDoc = (e.target as Node | null)?.ownerDocument;
  if (targetDoc && targetDoc !== document) return false;
  if (!isFinite(e.clientX) || !isFinite(e.clientY)) return false;
  const el = shadow.elementFromPoint(e.clientX, e.clientY);
  if (!el) return false;
  let node: Element | null = el;
  while (node) {
    if (node instanceof HTMLElement && node.dataset.canvasLayerPanel === "true") return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * When the cursor lands on an ancestor (because it's inside a child's margin
 * zone rather than the child itself), snap to the child whose margin box
 * contains the point. Returns the original target if no child matches.
 *
 * Docs are the document relevant to this check (iframe doc or main doc) —
 * coords are in that document's own viewport (iframe-local if in iframe).
 */
function snapToChildMargin(target: HTMLElement, docX: number, docY: number): HTMLElement {
  let best: HTMLElement = target;
  let bestDist = Infinity;
  for (const child of Array.from(target.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const r = child.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getCachedStyle(child);
    const ml = parseFloat(cs.marginLeft) || 0;
    const mr = parseFloat(cs.marginRight) || 0;
    const mt = parseFloat(cs.marginTop) || 0;
    const mb = parseFloat(cs.marginBottom) || 0;
    const left = r.left - ml;
    const right = r.right + mr;
    const top = r.top - mt;
    const bottom = r.bottom + mb;
    if (docX >= left && docX <= right && docY >= top && docY <= bottom) {
      // Score: prefer the child whose box-edge is closest to the cursor
      // so overlapping siblings pick the one you're "pointing at"
      const dx = Math.max(0, Math.max(r.left - docX, docX - r.right));
      const dy = Math.max(0, Math.max(r.top - docY, docY - r.bottom));
      const dist = dx + dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = child;
      }
    }
  }
  return best;
}

/**
 * Find element at viewport coordinates. Checks both main document and iframe.
 * Returns the element and whether it was found inside the iframe.
 */
export function elementAtPoint(clientX: number, clientY: number): { target: HTMLElement | null; fromIframe: boolean; iframe: HTMLIFrameElement | null } {
  // Try main document first.
  // The overlay's shadow host covers the viewport, so document.elementFromPoint
  // will almost always return it when the user clicks anywhere visible. Treat
  // it (and anything inside the shadow tree) as "no hit" so we fall through
  // to iframe detection — otherwise annotate-clicks target overlay chrome.
  const host = document.getElementById(OVERLAY_HOST_ID);
  const mainTarget = deepElementFromPoint(clientX, clientY, document);
  const isOverlayHit =
    mainTarget === host ||
    (host?.shadowRoot && mainTarget?.getRootNode() === host.shadowRoot);
  if (mainTarget && !isOverlayHit) {
    const snapped = snapToChildMargin(mainTarget, clientX, clientY);
    return { target: snapped, fromIframe: false, iframe: null };
  }

  // Try iframe document (translate coords)
  const iframe = getEditorIframe();
  if (iframe?.contentDocument) {
    const ir = iframe.getBoundingClientRect();
    const iframeX = clientX - ir.left;
    const iframeY = clientY - ir.top;
    if (iframeX >= 0 && iframeY >= 0 && iframeX <= ir.width && iframeY <= ir.height) {
      // Account for zoom: the iframe is scaled via CSS transform
      const { scale } = getIframeOffset(iframe);
      const localX = iframeX / scale;
      const localY = iframeY / scale;
      const target = deepElementFromPoint(localX, localY, iframe.contentDocument);
      if (target) {
        const snapped = snapToChildMargin(target, localX, localY);
        return { target: snapped, fromIframe: true, iframe };
      }
    }
  }

  return { target: null, fromIframe: false, iframe: null };
}

export function useSelection() {
  const mode = useEditorStore((s) => s.mode);
  const selectElement = useEditorStore((s) => s.selectElement);
  const setHoveredElement = useEditorStore((s) => s.setHoveredElement);
  const setContextMenu = useEditorStore((s) => s.setContextMenu);
  const lastHoveredRef = useRef<HTMLElement | null>(null);
  const rafPending = useRef(false);

  // Watch selected element for class attribute changes (HMR)
  useClassObserver();

  // RAF-throttled mousemove handler
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (mode !== "edit") return;
      if (useEditorStore.getState().interacting) return;
      // Iframe-origin mousemove events arrive here with iframe-local
      // clientX/Y. `elementAtPoint` below assumes outer-screen/viewport coords
      // and would re-translate them as if they were screen coords — landing
      // on a totally different element in the iframe-doc (worse at zoom != 1).
      // Symptom: hovering main content highlights an element in the sidebar.
      // ResponsiveFrame's onMouseMove (attached directly to the iframe doc)
      // already handles hover for iframe events with the correct iframe-local
      // pick, so just bail out here.
      const targetDoc = (e.target as Node | null)?.ownerDocument;
      if (targetDoc && targetDoc !== document) return;
      // Layers panel owns hover state when the cursor is inside it — row
      // mouseEnter sets `hoveredElement` so the canvas can mirror-highlight
      // the corresponding DOM element. Don't touch it here.
      if (isInsideLayersPanel(e)) return;
      if (isClickInsideOverlay(e)) {
        if (lastHoveredRef.current !== null) {
          lastHoveredRef.current = null;
          setHoveredElement(null);
        }
        return;
      }

      if (rafPending.current) return;
      rafPending.current = true;

      const clientX = e.clientX;
      const clientY = e.clientY;

      requestAnimationFrame(() => {
        rafPending.current = false;
        const { target } = elementAtPoint(clientX, clientY);
        if (target === lastHoveredRef.current) return;
        lastHoveredRef.current = target;
        setHoveredElement(target);
      });
    },
    [mode, setHoveredElement]
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (mode !== "edit") return;
      if (useEditorStore.getState().interacting) return;
      if (useEditorStore.getState().editingText) return;

      // Shift+click: add to multi-selection. Checked early so
      // isClickInsideOverlay (unreliable with iframe coords) doesn't block it.
      if (e.shiftKey) {
        const iframeEl = getEditorIframe();
        let target: HTMLElement | null = null;
        let fromIframe = false;

        if (iframeEl?.contentDocument) {
          const eventDoc = (e.target as Node)?.ownerDocument;
          if (eventDoc === iframeEl.contentDocument) {
            target = deepElementFromPoint(e.clientX, e.clientY, iframeEl.contentDocument);
            fromIframe = true;
          } else {
            return; // parent handler — let iframe handler do it
          }
        } else {
          target = deepElementFromPoint(e.clientX, e.clientY, document);
        }
        if (!target) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const source = resolveSource(target);
        const rect = target.getBoundingClientRect();
        useEditorStore.getState().addToSelection({
          element: target, source, rect,
          className: typeof target.className === "string" ? target.className : "",
          tagName: target.tagName.toLowerCase(),
          iframeRef: fromIframe && iframeEl ? iframeEl : undefined,
        });
        return;
      }

      // Iframe-origin non-shift clicks: bail and let ResponsiveFrame.onClick
      // handle them. It covers annotate, ctrl/meta-click, ancestor-near-child,
      // and default selection — all with correct iframe-local coords. Running
      // elementAtPoint here on iframe-local coords re-translates them as if
      // they were outer-screen coords and selects a totally different element
      // (same root cause as the hover bug; see handleMouseMove above).
      const clickTargetDoc = (e.target as Node | null)?.ownerDocument;
      if (clickTargetDoc && clickTargetDoc !== document) return;

      // Annotate tool: when active, plain click on any element opens the
      // Ask AI prompt directly.
      //
      // We DO bail when the click lands on overlay chrome (toolbar, panel,
      // existing context menu). The previous version skipped this check on
      // the theory that isClickInsideOverlay could misread iframe coords —
      // but that check uses composedPath() and doesn't rely on coords, so
      // it's safe. Skipping it caused clicks on the toolbar to annotate
      // whatever happened to be under it, which is exactly the "selects
      // stuff behind the bar" bug.
      if (useEditorStore.getState().annotateMode && !e.ctrlKey && !e.metaKey) {
        // If the click lands on overlay chrome (toolbar, panel, menu),
        // refuse to annotate — otherwise you'd be dropping a pin on a ghost
        // target under the toolbar. elementAtPoint already skips the shadow
        // host, but this catches the interactive-element case explicitly.
        if (isClickInsideOverlay(e)) return;
        const { target, fromIframe, iframe } = elementAtPoint(e.clientX, e.clientY);
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        const source = resolveSource(target);
        const rect = target.getBoundingClientRect();
        selectElement({
          element: target, source, rect,
          className: typeof target.className === "string" ? target.className : "",
          tagName: target.tagName.toLowerCase(),
          iframeRef: fromIframe && iframe ? iframe : undefined,
        });
        // Anchor the annotate menu at the element's horizontal centre so it
        // opens OVER the element rather than at its left edge. ContextMenu
        // interprets (x, y) as a centre-anchor when initialMode is set.
        const screenBox = fromIframe && iframe
          ? iframeRectToScreenBox(rect, iframe)
          : { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        const menuX = screenBox.left + screenBox.width / 2;
        const menuY = screenBox.top;
        setContextMenu({ x: menuX, y: menuY - 6, element: target, source, initialMode: "ai-prompt" });
        // Stay in annotate mode — user stays armed until they toggle the
        // button off, press `A` again, or hit Escape (handled in
        // useKeyboard). Lets them drop multiple pins without re-arming.
        return;
      }

      if (isClickInsideOverlay(e)) return;
      // Skip selection if a drag just ended — prevents deselecting after margin/resize drag
      if (wasDragRecent(300)) return;

      // Ctrl+click (or Meta+click on non-Mac) → open context menu instead of selecting
      if (e.ctrlKey || (e.metaKey && navigator.platform.indexOf("Mac") === -1)) {
        const { target, fromIframe, iframe } = elementAtPoint(e.clientX, e.clientY);
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        const source = resolveSource(target);
        const rect = target.getBoundingClientRect();
        selectElement({
          element: target, source,
          rect,
          className: typeof target.className === "string" ? target.className : "",
          tagName: target.tagName.toLowerCase(),
          iframeRef: fromIframe && iframe ? iframe : undefined,
        });
        const { x: menuX, y: menuY } = fromIframe && iframe
          ? iframeRectToScreen(rect, iframe)
          : { x: rect.left, y: rect.top };
        setContextMenu({ x: menuX, y: menuY - 6, element: target, source });
        return;
      }

      const { target, fromIframe, iframe } = elementAtPoint(e.clientX, e.clientY);
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();

      const source = resolveSource(target);
      const rect = target.getBoundingClientRect();
      const selData = {
        element: target,
        source,
        rect,
        className: typeof target.className === "string" ? target.className : "",
        tagName: target.tagName.toLowerCase(),
        iframeRef: fromIframe && iframe ? iframe : undefined,
      };

      // If clicking in the margin/padding zone of the selected element (target is parent),
      // don't change selection — user is interacting with spacing, not selecting parent
      const sel = useEditorStore.getState().selectedElement;
      if (sel?.element && target !== sel.element && target.contains(sel.element)) {
        const sr = sel.element.getBoundingClientRect();
        const pad = 20;
        const nearSelected = e.clientX >= sr.left - pad && e.clientX <= sr.right + pad &&
                            e.clientY >= sr.top - pad && e.clientY <= sr.bottom + pad;
        if (nearSelected) return;
      }

      // If clicking an ancestor of the selected element, only keep the child
      // selected if the click is near the child (within margin + small buffer).
      const currentSel = useEditorStore.getState().selectedElement;
      if (currentSel?.element && currentSel.element.isConnected && target !== currentSel.element) {
        if (target.contains(currentSel.element)) {
          const cr = currentSel.element.getBoundingClientRect();
          const cs = getCachedStyle(currentSel.element);
          const buf = 10;
          const outerBox = {
            left: cr.left - (parseFloat(cs.marginLeft) || 0) - buf,
            top: cr.top - (parseFloat(cs.marginTop) || 0) - buf,
            right: cr.right + (parseFloat(cs.marginRight) || 0) + buf,
            bottom: cr.bottom + (parseFloat(cs.marginBottom) || 0) + buf,
          };
          if (e.clientX >= outerBox.left && e.clientX <= outerBox.right &&
              e.clientY >= outerBox.top && e.clientY <= outerBox.bottom) {
            return;
          }
        }
      }

      selectElement(selData);
    },
    [mode, selectElement, setContextMenu]
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      if (mode !== "edit") return;
      if (useEditorStore.getState().interacting) return;
      // Always block native context menu in edit mode
      e.preventDefault();
      e.stopPropagation();

      // Iframe-origin right-clicks: ResponsiveFrame.onContextMenu handles
      // them with correct iframe-local coords. Same re-translation bug as
      // plain click if we let this fall through to elementAtPoint.
      const ctxTargetDoc = (e.target as Node | null)?.ownerDocument;
      if (ctxTargetDoc && ctxTargetDoc !== document) return;

      if (isClickInsideOverlay(e)) return;

      // Try elementAtPoint first (works for parent doc events).
      // If nothing found, try iframe directly (event may have iframe-local coords).
      let result = elementAtPoint(e.clientX, e.clientY);
      if (!result.target) {
        const iframe = getEditorIframe();
        if (iframe?.contentDocument) {
          const t = deepElementFromPoint(e.clientX, e.clientY, iframe.contentDocument);
          if (t) result = { target: t, fromIframe: true, iframe };
        }
      }
      const { target, fromIframe, iframe } = result;
      if (!target) return;

      const source = resolveSource(target);
      const rect = target.getBoundingClientRect();

      // If multi-selection is active and right-clicked element is in the set,
      // keep multi-selection intact — just open the context menu.
      const multi = useEditorStore.getState().multiSelection;
      const isInMulti = multi.length > 1 && multi.some(s => s.element === target);
      if (!isInMulti) {
        selectElement({
          element: target,
          source,
          rect,
          className: typeof target.className === "string" ? target.className : "",
          tagName: target.tagName.toLowerCase(),
          iframeRef: fromIframe && iframe ? iframe : undefined,
        });
      }

      // Anchor to the top of the element (screen space — translate if in iframe)
      const { x: menuX, y: menuY } = fromIframe && iframe
        ? iframeRectToScreen(rect, iframe)
        : { x: rect.left, y: rect.top };
      setContextMenu({ x: menuX, y: menuY - 6, element: target, source });
    },
    [mode, selectElement, setContextMenu]
  );

  // Block text selection and native drag in edit mode
  const blockSelection = useCallback((e: Event) => {
    if (useEditorStore.getState().interacting) return;
    if (useEditorStore.getState().editingText) return;
    if (isClickInsideOverlay(e as MouseEvent)) return;
    e.preventDefault();
  }, []);

  const blockMouseDown = useCallback((e: MouseEvent) => {
    if (mode !== "edit") return;
    if (useEditorStore.getState().interacting) return;
    if (useEditorStore.getState().editingText) return;
    if (isClickInsideOverlay(e)) return;
    e.preventDefault();
  }, [mode]);

  // ── Marquee select (Alt+drag) ──
  const marqueeRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null);
  const setMarqueeRect = useEditorStore.getState().setMarqueeRect;

  const handleMarqueeDown = useCallback((e: MouseEvent) => {
    if (mode !== "edit" || !e.altKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    useEditorStore.getState().selectElement(null);
    marqueeRef.current = { startX: e.clientX, startY: e.clientY, active: false };
  }, [mode]);

  const handleMarqueeMove = useCallback((e: MouseEvent) => {
    const m = marqueeRef.current;
    if (!m) return;
    const dx = e.clientX - m.startX;
    const dy = e.clientY - m.startY;
    if (!m.active && Math.hypot(dx, dy) < 5) return;
    m.active = true;
    setMarqueeRect({
      x: Math.min(m.startX, e.clientX),
      y: Math.min(m.startY, e.clientY),
      w: Math.abs(dx),
      h: Math.abs(dy),
    });
  }, []);

  const handleMarqueeUp = useCallback((e: MouseEvent) => {
    const m = marqueeRef.current;
    if (!m) return;
    marqueeRef.current = null;
    if (!m.active) { setMarqueeRect(null); return; }

    const rect = {
      x: Math.min(m.startX, e.clientX),
      y: Math.min(m.startY, e.clientY),
      w: Math.abs(e.clientX - m.startX),
      h: Math.abs(e.clientY - m.startY),
    };
    setMarqueeRect(null);

    const iframe = getEditorIframe();
    const doc = iframe?.contentDocument ?? document;
    const allEls = doc.querySelectorAll("[data-source-file]");
    const iframeEl = iframe;
    let scale = 1, ox = 0, oy = 0;
    if (iframeEl) {
      const off = getIframeOffset(iframeEl);
      scale = off.scale;
      ox = off.x;
      oy = off.y;
    }

    const matched: import("../stores/editor-store.js").SelectedElement[] = [];
    for (const el of allEls) {
      const html = el as HTMLElement;
      const r = html.getBoundingClientRect();
      const elX = r.left * scale + ox;
      const elY = r.top * scale + oy;
      const elW = r.width * scale;
      const elH = r.height * scale;
      const overlapX = Math.max(0, Math.min(elX + elW, rect.x + rect.w) - Math.max(elX, rect.x));
      const overlapY = Math.max(0, Math.min(elY + elH, rect.y + rect.h) - Math.max(elY, rect.y));
      const overlapArea = overlapX * overlapY;
      const elArea = elW * elH;
      if (elArea > 0 && overlapArea / elArea > 0.5) {
        matched.push({
          element: html,
          source: resolveSource(html),
          rect: r,
          className: typeof html.className === "string" ? html.className : "",
          tagName: html.tagName.toLowerCase(),
          iframeRef: iframeEl ?? undefined,
        });
      }
    }
    if (matched.length > 0) {
      useEditorStore.setState({
        selectedElement: matched[0],
        multiSelection: matched,
        propertiesOpen: true,
      });
    }
  }, []);

  useEffect(() => {
    if (mode !== "edit") return;
    const cleanup = attachToDocumentAndIframe([
      bind("mousemove", handleMouseMove),
      bind("click", handleClick),
      bind("contextmenu", handleContextMenu),
      bind("mousedown", blockMouseDown),
      bind("selectstart", blockSelection),
      bind("dragstart", blockSelection),
    ]);

    // Marquee listeners on parent document (viewport coords)
    document.addEventListener("mousedown", handleMarqueeDown, true);
    document.addEventListener("mousemove", handleMarqueeMove, true);
    document.addEventListener("mouseup", handleMarqueeUp, true);

    return () => {
      cleanup();
      document.removeEventListener("mousedown", handleMarqueeDown, true);
      document.removeEventListener("mousemove", handleMarqueeMove, true);
      document.removeEventListener("mouseup", handleMarqueeUp, true);
    };
  }, [mode, handleMouseMove, handleClick, handleContextMenu, blockMouseDown, blockSelection, handleMarqueeDown, handleMarqueeMove, handleMarqueeUp]);

  // ── Annotate tool cursor ──
  // While the annotate tool is armed, swap the cursor in the iframe body and
  // the overlay host so the user has an unambiguous "I'm in comment mode"
  // signal. Also applies a yellow body outline on hover via a data attribute
  // the paint layer could branch on (currently just used for the cursor rule).
  const annotateMode = useEditorStore((s) => s.annotateMode);
  useEffect(() => {
    if (mode !== "edit" || !annotateMode) return;
    const cursor = ANNOTATE_CURSOR_CSS;
    const applied: Array<{ el: HTMLElement; prev: string }> = [];
    function apply(el: HTMLElement | null | undefined) {
      if (!el) return;
      applied.push({ el, prev: el.style.cursor });
      el.style.cursor = cursor;
    }
    apply(document.body);
    const iframe = getEditorIframe();
    apply(iframe?.contentDocument?.body);
    // Also poll briefly for the iframe body in case it remounts after breakpoint change
    const pollId = setInterval(() => {
      const doc = getEditorIframe()?.contentDocument?.body;
      if (doc && !applied.some(a => a.el === doc)) apply(doc);
    }, 500);
    return () => {
      clearInterval(pollId);
      for (const { el, prev } of applied) {
        try { el.style.cursor = prev; } catch { /* detached */ }
      }
    };
  }, [mode, annotateMode]);
}

/**
 * Small black `+` cursor for the annotate tool. Subtle white underlay so
 * it reads on dark backgrounds without shouting. 16×16 (half the old 24×24)
 * and a thinner stroke — matches a native system pointer's visual weight.
 * URL-encoded SVG so it works cross-origin in the iframe body.
 * Hotspot is the centre of the `+` at (8, 8).
 */
const ANNOTATE_CURSOR_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
    `<path d="M8 3v10M3 8h10" stroke="%23fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
    `<path d="M8 3v10M3 8h10" stroke="%23000" stroke-width="1.25" stroke-linecap="round" fill="none"/>` +
  `</svg>`;
const ANNOTATE_CURSOR_CSS = `url('data:image/svg+xml;utf8,${ANNOTATE_CURSOR_SVG}') 8 8, crosshair`;
