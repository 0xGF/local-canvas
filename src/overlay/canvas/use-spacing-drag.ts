import { useEffect, useCallback, useRef, useState } from "react";
import type { BadgeHit, TagBadgeHit } from "./constants.js";
import { COL, PREFIX_TO_CSS } from "./constants.js";
import { pxToTw } from "./draw-helpers.js";
import { useEditorStore } from "../stores/editor-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { getBreakpointPrefix } from "../../shared/breakpoints.js";
import { attachToDocumentAndIframe, getIframeDocument } from "../utils/iframe-events.js";
import { markDragEnd } from "../utils/drag-state.js";

export function useSpacingDrag(
  badgeHitsRef: React.MutableRefObject<BadgeHit[]>,
  tagBadgeHitRef: React.MutableRefObject<TagBadgeHit | null>,
) {
  const { sendMutation } = useWebSocket();
  const incrementPending = useEditorStore((s) => s.incrementPending);

  const spacingDragRef = useRef<{ badge: BadgeHit; startX: number; startY: number; startValue: number; moved: boolean; lastPx: number; isTrusted?: boolean } | null>(null);
  const reorderRef = useRef<{ el: HTMLElement; startY: number; insertionIndex: number | null; insertionRect: DOMRect | null } | null>(null);
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
      return x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h;
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
        (document.body.style as any).webkitUserSelect = "none";
        return;
      }

      if (hitTestTag(e.clientX, e.clientY)) {
        const sel = useEditorStore.getState().selectedElement;
        if (sel?.element) {
          e.preventDefault();
          e.stopPropagation();
          reorderRef.current = { el: sel.element, startY: e.clientY, insertionIndex: null, insertionRect: null };
          document.body.style.cursor = "grabbing";
          // Ghost effect — fade the element being dragged
          sel.element.style.opacity = "0.4";
          sel.element.style.transition = "opacity 0.15s";
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
          if (cssProp) (sel.element.style as any)[cssProp] = newPx + "px";
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
        const children = Array.from(parent.children).filter(c => c !== ro.el);
        let closestIdx = 0, closestDist = Infinity, closestRect: DOMRect | null = null;
        children.forEach((child, idx) => {
          const cr = child.getBoundingClientRect();
          const mid = cr.top + cr.height / 2;
          const dist = Math.abs(e.clientY - mid);
          if (dist < closestDist) { closestDist = dist; closestIdx = e.clientY > mid ? idx + 1 : idx; closestRect = cr; }
        });
        ro.insertionIndex = closestIdx;
        ro.insertionRect = closestRect;
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
                (oldEl.style as any)[cssProp] = "";
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
                  (newSel.element.style as any)[cssProp] = "";
                }
              }, 100);

              // Fallback: clear everything after 5s
              const fallback = setTimeout(() => {
                (oldEl.style as any)[cssProp] = "";
                observer.disconnect();
                clearInterval(disconnectCheck);
                // Also try refreshing in case the element was silently replaced
                useEditorStore.getState().refreshSelection();
                const newSel = useEditorStore.getState().selectedElement;
                if (newSel?.element && newSel.element !== oldEl) {
                  (newSel.element.style as any)[cssProp] = "";
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
        (document.body.style as any).webkitUserSelect = "";
        return;
      }

      const ro = reorderRef.current;
      if (ro) {
        // Restore opacity
        ro.el.style.opacity = "";
        ro.el.style.transition = "";

        if (ro.insertionIndex !== null) {
          const parent = ro.el.parentElement;
          if (parent) {
            const parentSource = resolveSource(parent);
            if (parentSource) {
              const children = Array.from(parent.children);
              const fromIndex = children.indexOf(ro.el);
              if (fromIndex !== -1 && fromIndex !== ro.insertionIndex) {
                markDragEnd();
                sendMutation({ type: "reorder", source: parentSource, fromIndex, toIndex: ro.insertionIndex } as any).then(() => incrementPending());
              }
            }
          }
        }
      }
      reorderRef.current = null;
      setReorderLine(null);
      document.body.style.cursor = "";
    }

    return attachToDocumentAndIframe([
      { event: "mousedown", handler: onMouseDown },
      { event: "mousemove", handler: onMouseMove },
      { event: "mouseup", handler: onMouseUp },
    ], { translateCoords: true });
  }, [commitSpacing, sendMutation, incrementPending, badgeHitsRef, tagBadgeHitRef]);

  return { dragTooltip, reorderLine, reorderRef, commitSpacing, spacingDragRef };
}
