import { useEffect, useCallback, useRef, useState } from "react";
import type { BadgeHit, TagBadgeHit } from "./constants.js";
import { COL, PREFIX_TO_CSS } from "./constants.js";
import { pxToTw } from "./draw-helpers.js";
import { useEditorStore } from "../stores/editor-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { getBreakpointPrefix } from "../../shared/breakpoints.js";
import { attachToDocumentAndIframe, bind, getIframeDocument } from "../utils/iframe-events.js";
import { markDragEnd } from "../utils/drag-state.js";
import { setStyleProp } from "../utils/dom-style.js";

/**
 * After a reorder mutation + HMR, re-select the moved element by finding the
 * parent via its data-source attributes, then grabbing parent.children[toIndex].
 * Polls for up to 2s because HMR timing varies.
 */
function reselectAfterReorder(
  parentSource: { filePath: string; line: number },
  toIndex: number,
  iframeRef: HTMLIFrameElement | undefined,
) {
  const start = performance.now();
  const attempt = () => {
    const docs: Document[] = [document];
    if (iframeRef?.contentDocument) docs.push(iframeRef.contentDocument);
    for (const doc of docs) {
      const parents = doc.querySelectorAll(
        `[data-source-file="${parentSource.filePath}"][data-source-line="${parentSource.line}"]`
      );
      for (const p of parents) {
        const newParent = p as HTMLElement;
        if (!newParent.isConnected) continue;
        const newChild = newParent.children[toIndex] as HTMLElement | undefined;
        if (newChild) {
          const childSource = resolveSource(newChild);
          useEditorStore.getState().selectElement({
            element: newChild,
            source: childSource,
            rect: newChild.getBoundingClientRect(),
            className: typeof newChild.className === "string" ? newChild.className : "",
            tagName: newChild.tagName.toLowerCase(),
            iframeRef,
          });
          return true;
        }
      }
    }
    return false;
  };
  // Try a few times as HMR rolls in
  const poll = () => {
    if (attempt()) return;
    if (performance.now() - start > 2000) return;
    setTimeout(poll, 80);
  };
  // First attempt after a tiny delay to let the initial HMR cycle fire
  setTimeout(poll, 150);
}

export function useSpacingDrag(
  badgeHitsRef: React.MutableRefObject<BadgeHit[]>,
  tagBadgeHitRef: React.MutableRefObject<TagBadgeHit | null>,
  resizeHandlesRef?: React.MutableRefObject<import("./use-resize-handles.js").ResizeHandle[]>,
) {
  const { sendMutation } = useWebSocket();
  const incrementPending = useEditorStore((s) => s.incrementPending);

  const spacingDragRef = useRef<{ badge: BadgeHit; startX: number; startY: number; startValue: number; moved: boolean; lastPx: number; isTrusted?: boolean } | null>(null);
  const reorderRef = useRef<{
    el: HTMLElement;
    startX: number; startY: number;
    moved: boolean;
    insertionIndex: number | null;
    // Insertion line in SCREEN coords (iframe-translated)
    insertionLine: { x: number; y: number; width: number } | null;
    // Drop target sibling rect in SCREEN coords (for highlighting)
    targetRect: { x: number; y: number; width: number; height: number } | null;
    // Cursor position for ghost preview
    cursorX: number; cursorY: number;
    // Size of the dragged element in screen px
    ghostW: number; ghostH: number;
  } | null>(null);
  const [dragTooltip, setDragTooltip] = useState<{ x: number; y: number; value: number; color: string } | null>(null);
  const tooltipRafRef = useRef(0);
  const [reorderLine, setReorderLine] = useState<{ left: number; top: number; width: number } | null>(null);

  const commitSpacing = useCallback((prefix: string, pxValue: number) => {
    const sel = useEditorStore.getState().selectedElement;
    if (!sel?.source) return;
    const twVal = pxToTw(pxValue);
    // Read className directly from the live DOM element, not the potentially stale store value
    const liveClassName = typeof sel.element.className === "string" ? sel.element.className : sel.className || "";
    const classes = liveClassName.split(/\s+/).filter(Boolean);
    const bp = getBreakpointPrefix(useEditorStore.getState().breakpoint);

    // Find existing class — prefer breakpoint-prefixed version
    let old: string | undefined;
    if (bp) {
      old = classes.find((c) => c === `${bp}:${prefix}` || c.startsWith(`${bp}:${prefix}-`));
    }
    if (!old) {
      old = classes.find((c) => c === prefix || c.startsWith(prefix + "-"));
    }

    // Generate new class with breakpoint prefix
    const bare = twVal !== "0" ? `${prefix}-${twVal}` : "";
    const next = bare && bp ? `${bp}:${bare}` : bare;

    // Skip no-op mutations (same class added and removed)
    if (old === next) return;
    if (!old && !next) return;

    sendMutation({
      type: "modify-class",
      source: sel.source,
      remove: old ? [old] : undefined,
      add: next ? [next] : undefined,
    }).then(() => incrementPending());
  }, [sendMutation, incrementPending]);

  // Badge + tag hit testing
  useEffect(() => {
    function hitTestBadge(x: number, y: number): BadgeHit | null {
      for (const hit of badgeHitsRef.current) {
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) return hit;
      }
      return null;
    }

    function hitTestTag(x: number, y: number): boolean {
      const t = tagBadgeHitRef.current;
      if (!t) return false;
      if (!(x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h)) return false;
      // Resize handles at top-left corner overlap the tag badge's bottom edge.
      // If the click also hits a handle, resize wins — reject the tag hit.
      const handles = resizeHandlesRef?.current;
      if (handles) {
        const TOL = 4; // must match tolerance in use-resize-handles.ts
        for (const h of handles) {
          if (x >= h.x - TOL && x <= h.x + h.w + TOL &&
              y >= h.y - TOL && y <= h.y + h.h + TOL) {
            return false;
          }
        }
      }
      return true;
    }

    function onMouseDown(e: MouseEvent) {
      const badge = hitTestBadge(e.clientX, e.clientY);
      if (badge) {
        e.preventDefault();
        e.stopPropagation();
        const isHoriz = badge.side === "left" || badge.side === "right";
        spacingDragRef.current = { badge, startX: e.clientX, startY: e.clientY, startValue: badge.value, moved: false, lastPx: badge.value, isTrusted: e.isTrusted };
        document.body.style.cursor = isHoriz ? "ew-resize" : "ns-resize";
        document.body.style.userSelect = "none";
        setStyleProp(document.body, "webkitUserSelect", "none");
        return;
      }

      if (hitTestTag(e.clientX, e.clientY)) {
        const sel = useEditorStore.getState().selectedElement;
        if (sel?.element) {
          e.preventDefault();
          e.stopPropagation();
          // Compute ghost dimensions in SCREEN space
          const iframeEl = sel.iframeRef as HTMLIFrameElement | undefined;
          let ifs = 1;
          if (iframeEl) {
            const ir = iframeEl.getBoundingClientRect();
            const naturalW = parseInt(iframeEl.style.width) || ir.width;
            ifs = ir.width / naturalW;
          }
          const er = sel.element.getBoundingClientRect();
          reorderRef.current = {
            el: sel.element,
            startX: e.clientX, startY: e.clientY,
            moved: false,
            insertionIndex: null,
            insertionLine: null,
            targetRect: null,
            cursorX: e.clientX, cursorY: e.clientY,
            ghostW: er.width * ifs, ghostH: er.height * ifs,
          };
          document.body.style.cursor = "grabbing";
          document.body.style.userSelect = "none";
        }
      }
    }

    function onMouseMove(e: MouseEvent) {
      const sd = spacingDragRef.current;
      if (sd) {
        // During active drag, only use the same event source as mousedown.
        // If drag started from a forwarded (synthetic) event, ignore native events
        // which have different coordinate space.
        if (sd.isTrusted !== undefined && e.isTrusted !== sd.isTrusted) return;
        // Drag direction: dragging toward the element center increases spacing.
        // Right padding: drag left = increase. Left padding: drag right = increase.
        // Top margin: drag down = increase. Bottom margin: drag up = increase.
        const side = sd.badge.side;
        const isHorizontal = side === "left" || side === "right";
        let rawDelta: number;
        if (isHorizontal) {
          rawDelta = side === "right" ? (sd.startX - e.clientX) : (e.clientX - sd.startX);
        } else {
          // Top: drag down = increase. Bottom: drag down = increase.
          rawDelta = e.clientY - sd.startY;
        }
        if (Math.abs(rawDelta) > 3) sd.moved = true;
        if (!sd.moved) return;

        const zoomScale = useViewportStore.getState().zoom;
        const newPx = Math.max(0, Math.min(999, Math.round(sd.startValue + rawDelta / zoomScale)));
        sd.lastPx = newPx;
        const sel = useEditorStore.getState().selectedElement;
        if (sel?.element) {
          const cssProp = PREFIX_TO_CSS[sd.badge.prefix];
          if (cssProp) setStyleProp(sel.element, cssProp, newPx + "px");
        }
        // Throttle tooltip React state updates to one per animation frame
        cancelAnimationFrame(tooltipRafRef.current);
        const cx = e.clientX, cy = e.clientY;
        const color = sd.badge.type === "padding" ? COL.padding : COL.margin;
        tooltipRafRef.current = requestAnimationFrame(() => {
          setDragTooltip({ x: cx, y: cy, value: newPx, color });
        });
        return;
      }

      const ro = reorderRef.current;
      if (ro) {
        const parent = ro.el.parentElement;
        if (!parent) return;

        // Track move threshold so a click doesn't trigger a ghost
        const dx = e.clientX - ro.startX;
        const dy = e.clientY - ro.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          if (!ro.moved) {
            ro.moved = true;
            ro.el.style.opacity = "0.3";
            ro.el.style.transition = "opacity 0.15s";
          }
        }
        ro.cursorX = e.clientX;
        ro.cursorY = e.clientY;

        // Translate iframe-local rects to screen space
        const sel = useEditorStore.getState().selectedElement;
        const iframeEl = sel?.iframeRef as HTMLIFrameElement | undefined;
        let ox = 0, oy = 0, ifs = 1;
        if (iframeEl) {
          const ir = iframeEl.getBoundingClientRect();
          const naturalW = parseInt(iframeEl.style.width) || ir.width;
          ifs = ir.width / naturalW;
          ox = ir.left;
          oy = ir.top;
        }

        const children = Array.from(parent.children).filter(c => c !== ro.el);

        // Walk children top-to-bottom; insert BEFORE the first sibling whose
        // midpoint is below the cursor. If no such sibling, insert at end.
        let insertIdx = children.length;
        let insertY = 0, insertLeft = 0, insertWidth = 0;
        let targetRect: { x: number; y: number; width: number; height: number } | null = null;

        for (let i = 0; i < children.length; i++) {
          const cr = children[i].getBoundingClientRect();
          const topS = cr.top * ifs + oy;
          const leftS = cr.left * ifs + ox;
          const widS = cr.width * ifs;
          const heiS = cr.height * ifs;
          const midS = topS + heiS / 2;
          if (e.clientY < midS) {
            insertIdx = i;
            insertY = topS; // line above this child
            insertLeft = leftS;
            insertWidth = widS;
            targetRect = { x: leftS, y: topS, width: widS, height: heiS };
            break;
          }
        }

        if (insertIdx === children.length && children.length > 0) {
          // Below all — line at bottom of last sibling
          const last = children[children.length - 1].getBoundingClientRect();
          insertY = (last.top + last.height) * ifs + oy;
          insertLeft = last.left * ifs + ox;
          insertWidth = last.width * ifs;
          targetRect = {
            x: last.left * ifs + ox,
            y: last.top * ifs + oy,
            width: last.width * ifs,
            height: last.height * ifs,
          };
        }

        ro.insertionIndex = insertIdx;
        ro.insertionLine = children.length > 0
          ? { x: insertLeft, y: insertY, width: insertWidth }
          : null;
        ro.targetRect = targetRect;
        return;
      }

      // Cursor hints
      if (hitTestBadge(e.clientX, e.clientY)) {
        document.body.style.cursor = "ns-resize";
      } else if (hitTestTag(e.clientX, e.clientY)) {
        document.body.style.cursor = "grab";
      } else {
        document.body.style.cursor = "";
      }
    }

    // Suppress the next click after a drag so it doesn't select a different element.
    // Attach to both parent and iframe documents.
    function suppressClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      removeClickSuppression();
    }
    function addClickSuppression() {
      document.addEventListener("click", suppressClick, true);
      try {
        const iDoc = getIframeDocument();
        if (iDoc) iDoc.addEventListener("click", suppressClick, true);
      } catch { /* cross-origin */ }
    }
    function removeClickSuppression() {
      document.removeEventListener("click", suppressClick, true);
      try {
        const iDoc = getIframeDocument();
        if (iDoc) iDoc.removeEventListener("click", suppressClick, true);
      } catch { /* cross-origin */ }
    }

    function onMouseUp(_e: MouseEvent) {
      const sd = spacingDragRef.current;
      if (sd) {
        // Mark drag end IMMEDIATELY so click handlers know to skip
        if (sd.moved) markDragEnd();
        cancelAnimationFrame(tooltipRafRef.current);
        if (sd.moved) {
          // Use lastPx from the last mousemove — no recalculation, no value mismatch
          commitSpacing(sd.badge.prefix, sd.lastPx);

          // Keep inline style as preview until HMR updates the DOM.
          // After HMR, the old DOM node may be replaced entirely (React re-render).
          // We observe the old node for class changes, but also poll for disconnection
          // and use refreshSelection to find the new node.
          const sel = useEditorStore.getState().selectedElement;
          if (sel?.element) {
            const cssProp = PREFIX_TO_CSS[sd.badge.prefix];
            if (cssProp) {
              const oldEl = sel.element;
              const source = sel.source;

              const cleanup = () => {
                observer.disconnect();
                clearTimeout(fallback);
                clearInterval(disconnectCheck);
              };

              // Strategy 1: Old element gets its class mutated in place
              const observer = new MutationObserver(() => {
                setStyleProp(oldEl, cssProp, "");
                cleanup();
                useEditorStore.getState().refreshSelection();
              });
              observer.observe(oldEl, { attributes: true, attributeFilter: ["class"] });

              // Strategy 2: Old element gets replaced (disconnected) by React re-render
              // Poll for disconnection and then find the new element via source attributes
              const disconnectCheck = setInterval(() => {
                if (oldEl.isConnected) return;
                cleanup();
                // Element was replaced — refreshSelection re-finds via data-source attrs
                useEditorStore.getState().refreshSelection();
                // Clear inline style on the NEW element (old one is dead)
                const newSel = useEditorStore.getState().selectedElement;
                if (newSel?.element && newSel.element !== oldEl) {
                  setStyleProp(newSel.element, cssProp, "");
                }
              }, 100);

              // Fallback: clear everything after 5s
              const fallback = setTimeout(() => {
                setStyleProp(oldEl, cssProp, "");
                observer.disconnect();
                clearInterval(disconnectCheck);
                // Also try refreshing in case the element was silently replaced
                useEditorStore.getState().refreshSelection();
                const newSel = useEditorStore.getState().selectedElement;
                if (newSel?.element && newSel.element !== oldEl) {
                  setStyleProp(newSel.element, cssProp, "");
                }
              }, 5000);
            }
          }
          // Mark drag end so click handlers know to skip selection
          markDragEnd();
          addClickSuppression();
          setTimeout(removeClickSuppression, 200);
        }
        spacingDragRef.current = null;
        setDragTooltip(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setStyleProp(document.body, "webkitUserSelect", "");
        return;
      }

      const ro = reorderRef.current;
      if (ro) {
        // Restore opacity
        ro.el.style.opacity = "";
        ro.el.style.transition = "";

        if (ro.moved && ro.insertionIndex !== null) {
          const parent = ro.el.parentElement;
          if (parent) {
            const parentSource = resolveSource(parent);
            if (parentSource) {
              const children = Array.from(parent.children);
              const fromIndex = children.indexOf(ro.el);
              const toIndex = ro.insertionIndex;
              if (fromIndex !== -1 && fromIndex !== toIndex) {
                markDragEnd();
                addClickSuppression();
                setTimeout(removeClickSuppression, 200);

                // Capture iframeRef before HMR potentially replaces nodes
                const sel = useEditorStore.getState().selectedElement;
                const iframeRef = sel?.iframeRef;

                sendMutation({ type: "reorder", source: parentSource, fromIndex, toIndex }).then(() => {
                  incrementPending();
                  // After HMR, sendMutation's internal refreshSelection would
                  // look up by OLD source line, which now contains a DIFFERENT
                  // element (the one that shifted into that slot). Override
                  // by finding the parent via its source attrs, then selecting
                  // parent.children[toIndex].
                  reselectAfterReorder(parentSource, toIndex, iframeRef);
                });
              }
            }
          }
        }
      }
      reorderRef.current = null;
      setReorderLine(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    return attachToDocumentAndIframe([
      bind("mousedown", onMouseDown),
      bind("mousemove", onMouseMove),
      bind("mouseup", onMouseUp),
    ], { translateCoords: true });
  }, [commitSpacing, sendMutation, incrementPending, badgeHitsRef, tagBadgeHitRef]);

  return { dragTooltip, reorderLine, reorderRef, commitSpacing, spacingDragRef };
}
