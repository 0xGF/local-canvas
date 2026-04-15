import { useEffect, useCallback, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { deepElementFromPoint } from "../utils/element-picker.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { attachToDocumentAndIframe } from "../utils/iframe-events.js";
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

function isClickInsideOverlay(e: MouseEvent): boolean {
  // Don't use composedPath — the canvas covers the viewport so it always
  // includes local-canvas-host. Instead check what shadow DOM element is
  // under the cursor and whether it's interactive (pointerEvents: auto).
  const host = document.getElementById(OVERLAY_HOST_ID);
  const shadow = host?.shadowRoot;
  if (!shadow) return false;

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
 * Get the iframe element if present (edit mode).
 */
function getIframe(): HTMLIFrameElement | null {
  const host = document.getElementById("local-canvas-host");
  const shadow = host?.shadowRoot;
  return shadow?.querySelector("iframe") as HTMLIFrameElement | null;
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
function elementAtPoint(clientX: number, clientY: number): { target: HTMLElement | null; fromIframe: boolean; iframe: HTMLIFrameElement | null } {
  // Try main document first
  const mainTarget = deepElementFromPoint(clientX, clientY, document);
  if (mainTarget) {
    const snapped = snapToChildMargin(mainTarget, clientX, clientY);
    return { target: snapped, fromIframe: false, iframe: null };
  }

  // Try iframe document (translate coords)
  const iframe = getIframe();
  if (iframe?.contentDocument) {
    const ir = iframe.getBoundingClientRect();
    const iframeX = clientX - ir.left;
    const iframeY = clientY - ir.top;
    if (iframeX >= 0 && iframeY >= 0 && iframeX <= ir.width && iframeY <= ir.height) {
      // Account for zoom: the iframe is scaled via CSS transform
      const naturalW = parseInt(iframe.style.width) || ir.width;
      const scale = ir.width / naturalW;
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
      if (useEditorStore.getState().editingText) return;
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
        // Anchor menu to the top of the element (not cursor). Translate to
        // screen space when the element lives in the iframe.
        let menuX = rect.left, menuY = rect.top;
        if (fromIframe && iframe) {
          const ir = iframe.getBoundingClientRect();
          const naturalW = parseInt(iframe.style.width) || ir.width;
          const scale = ir.width / naturalW;
          menuX = rect.left * scale + ir.left;
          menuY = rect.top * scale + ir.top;
        }
        // Offset slightly above the element so it doesn't cover the top edge
        setContextMenu({ x: menuX, y: menuY - 6, element: target, source });
        return;
      }

      // Annotate tool: when active, plain click on any element opens the
      // Ask AI prompt directly. Doesn't touch Ctrl/Cmd-click or right-click.
      if (useEditorStore.getState().annotateMode) {
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
        let menuX = rect.left, menuY = rect.top;
        if (fromIframe && iframe) {
          const ir = iframe.getBoundingClientRect();
          const naturalW = parseInt(iframe.style.width) || ir.width;
          const scale = ir.width / naturalW;
          menuX = rect.left * scale + ir.left;
          menuY = rect.top * scale + ir.top;
        }
        setContextMenu({ x: menuX, y: menuY - 6, element: target, source, initialMode: "ai-prompt" });
        // Drop back to normal selection after one annotation so the user
        // isn't stuck in annotate mode forever.
        useEditorStore.getState().setAnnotateMode(false);
        return;
      }

      const { target, fromIframe, iframe } = elementAtPoint(e.clientX, e.clientY);
      if (!target) return;

      // If clicking in the margin/padding zone of the selected element (target is parent),
      // don't change selection — user is interacting with spacing, not selecting parent
      const sel = useEditorStore.getState().selectedElement;
      if (sel?.element && target !== sel.element && target.contains(sel.element)) {
        // Clicked on an ancestor of the selected element — likely in the margin zone
        // Only skip if the click is near the selected element's edges
        const sr = sel.element.getBoundingClientRect();
        const pad = 20; // proximity threshold
        const nearSelected = e.clientX >= sr.left - pad && e.clientX <= sr.right + pad &&
                            e.clientY >= sr.top - pad && e.clientY <= sr.bottom + pad;
        if (nearSelected) return;
      }

      e.preventDefault();
      e.stopPropagation();

      // If clicking an ancestor of the selected element, only keep the child
      // selected if the click is near the child (within margin + small buffer).
      // Clicking far away on the parent should select the parent normally.
      const currentSel = useEditorStore.getState().selectedElement;
      if (currentSel?.element && currentSel.element.isConnected && target !== currentSel.element) {
        if (target.contains(currentSel.element)) {
          const cr = currentSel.element.getBoundingClientRect();
          const cs = getCachedStyle(currentSel.element);
          const buf = 10; // extra buffer beyond margin
          const outerBox = {
            left: cr.left - (parseFloat(cs.marginLeft) || 0) - buf,
            top: cr.top - (parseFloat(cs.marginTop) || 0) - buf,
            right: cr.right + (parseFloat(cs.marginRight) || 0) + buf,
            bottom: cr.bottom + (parseFloat(cs.marginBottom) || 0) + buf,
          };
          if (e.clientX >= outerBox.left && e.clientX <= outerBox.right &&
              e.clientY >= outerBox.top && e.clientY <= outerBox.bottom) {
            return; // Near child's spacing zone — keep child selected
          }
          // Click is far from child — allow selecting the parent
        }
      }

      const source = resolveSource(target);
      const rect = target.getBoundingClientRect();

      selectElement({
        element: target,
        source,
        rect,
        className: typeof target.className === "string" ? target.className : "",
        tagName: target.tagName.toLowerCase(),
        iframeRef: fromIframe && iframe ? iframe : undefined,
      });
    },
    [mode, selectElement, setContextMenu]
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      if (mode !== "edit") return;
      // Always block native context menu in edit mode
      e.preventDefault();
      e.stopPropagation();

      if (isClickInsideOverlay(e)) return;

      // Try elementAtPoint first (works for parent doc events).
      // If nothing found, try iframe directly (event may have iframe-local coords).
      let result = elementAtPoint(e.clientX, e.clientY);
      if (!result.target) {
        const iframe = getIframe();
        if (iframe?.contentDocument) {
          const t = deepElementFromPoint(e.clientX, e.clientY, iframe.contentDocument);
          if (t) result = { target: t, fromIframe: true, iframe };
        }
      }
      const { target, fromIframe, iframe } = result;
      if (!target) return;

      const source = resolveSource(target);
      const rect = target.getBoundingClientRect();

      selectElement({
        element: target,
        source,
        rect,
        className: typeof target.className === "string" ? target.className : "",
        tagName: target.tagName.toLowerCase(),
        iframeRef: fromIframe && iframe ? iframe : undefined,
      });

      // Anchor to the top of the element (screen space — translate if in iframe)
      let menuX = rect.left, menuY = rect.top;
      if (fromIframe && iframe) {
        const ir = iframe.getBoundingClientRect();
        const naturalW = parseInt(iframe.style.width) || ir.width;
        const scale = ir.width / naturalW;
        menuX = rect.left * scale + ir.left;
        menuY = rect.top * scale + ir.top;
      }
      setContextMenu({ x: menuX, y: menuY - 6, element: target, source });
    },
    [mode, selectElement, setContextMenu]
  );

  // Block text selection and native drag in edit mode
  const blockSelection = useCallback((e: Event) => {
    if (useEditorStore.getState().editingText) return;
    if (isClickInsideOverlay(e as MouseEvent)) return;
    e.preventDefault();
  }, []);

  const blockMouseDown = useCallback((e: MouseEvent) => {
    if (mode !== "edit") return;
    if (useEditorStore.getState().editingText) return;
    if (isClickInsideOverlay(e)) return;
    e.preventDefault();
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit") return;
    const cleanup = attachToDocumentAndIframe([
      { event: "mousemove", handler: handleMouseMove },
      { event: "click", handler: handleClick },
      { event: "contextmenu", handler: handleContextMenu },
      { event: "mousedown", handler: blockMouseDown as any },
      { event: "selectstart", handler: blockSelection as any },
      { event: "dragstart", handler: blockSelection as any },
    ]);
    return cleanup;
  }, [mode, handleMouseMove, handleClick, handleContextMenu, blockMouseDown, blockSelection]);
}
