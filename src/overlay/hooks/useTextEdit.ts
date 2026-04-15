import { useEffect, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { deepElementFromPoint } from "../utils/element-picker.js";
import { attachToDocumentAndIframe } from "../utils/iframe-events.js";

/**
 * Double-click on text elements to edit them inline.
 * Makes the actual element contenteditable inside the iframe —
 * no floating overlay, the text edits in place.
 *
 * Sets editor store `editingText` flag so useSelection yields
 * its mousedown/selectstart/click blockers during editing.
 */
export function useTextEdit() {
  const wsRef = useRef(useWebSocket());
  // Keep wsRef current every render
  wsRef.current = useWebSocket();

  const activeRef = useRef<{ element: HTMLElement; originalText: string } | null>(null);

  useEffect(() => {
    function commitAndClose() {
      const active = activeRef.current;
      if (!active) return;
      const { element, originalText } = active;

      const newText = (element.textContent || "").trim();
      element.contentEditable = "false";
      element.style.outline = "";
      element.style.outlineOffset = "";
      element.style.borderRadius = "";
      activeRef.current = null;
      useEditorStore.getState().setEditingText(false);

      if (newText === originalText) return;
      const source = resolveSource(element);
      if (!source) return;
      wsRef.current.sendMutation({ type: "modify-text", source, newText });
      useEditorStore.getState().incrementPending();
    }

    // ── Helpers ──

    function isTextElement(el: HTMLElement): boolean {
      const childEls = el.children.length;
      if (childEls > 0) {
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            return true;
          }
        }
        return false;
      }
      const text = el.textContent?.trim();
      return Boolean(text && text.length > 0);
    }

    function getIframe(): HTMLIFrameElement | null {
      const host = document.getElementById("local-canvas-host");
      const shadow = host?.shadowRoot;
      return shadow?.querySelector("iframe") as HTMLIFrameElement | null;
    }

    /** Start inline editing on the given element. Used by both dblclick and context menu. */
    function startEditing(target: HTMLElement) {
      const source = resolveSource(target);
      if (!source) return;

      // Close any existing edit first
      if (activeRef.current && activeRef.current.element !== target) {
        commitAndClose();
      }

      // Signal to useSelection that text editing is active
      useEditorStore.getState().setEditingText(true);

      // Make the actual element editable in place
      activeRef.current = { element: target, originalText: target.textContent?.trim() || "" };
      target.contentEditable = "true";
      target.style.outline = "2px solid rgba(12,140,233,0.6)";
      target.style.outlineOffset = "2px";
      target.style.borderRadius = "2px";

      // Focus: iframe window first, then the element
      const iframe = getIframe();
      if (iframe?.contentWindow) {
        iframe.contentWindow.focus();
      }
      target.focus();

      // Select all text inside the element
      const iframeWin = iframe?.contentWindow ?? window;
      const sel = iframeWin.getSelection();
      if (sel) {
        const range = (iframe?.contentDocument ?? document).createRange();
        range.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // ── Double-click listener ──

    function onDblClick(e: MouseEvent) {
      const mode = useEditorStore.getState().mode;
      if (mode !== "edit") return;

      // Don't intercept if clicking inside overlay UI
      const path = e.composedPath();
      for (const node of path) {
        if (node instanceof HTMLElement) {
          if (node.id === "local-canvas-host") return;
          if (node.getAttribute?.("data-canvas-overlay") === "true") return;
        }
      }

      // Resolve target — handles iframe + scale + main doc fallback.
      // The previous version subtracted iframe offset but FORGOT to divide by
      // the iframe's CSS transform scale, so at breakpoint widths the cursor
      // picked an element above/below the actual target.
      const iframe = getIframe();
      let target: HTMLElement | null = null;

      if (iframe?.contentDocument) {
        const ir = iframe.getBoundingClientRect();
        // Only route to iframe if cursor is over it
        if (e.clientX >= ir.left && e.clientX <= ir.right &&
            e.clientY >= ir.top && e.clientY <= ir.bottom) {
          const naturalW = parseInt(iframe.style.width) || ir.width;
          const scale = ir.width / naturalW;
          const localX = (e.clientX - ir.left) / scale;
          const localY = (e.clientY - ir.top) / scale;
          target = deepElementFromPoint(localX, localY, iframe.contentDocument);
        }
      }
      if (!target) {
        target = deepElementFromPoint(e.clientX, e.clientY, document);
      }
      if (!target || !isTextElement(target)) return;

      e.preventDefault();
      e.stopPropagation();

      startEditing(target);
    }

    // ── Context menu "Edit Text" handler ──

    function onStartTextEdit(e: Event) {
      const mode = useEditorStore.getState().mode;
      if (mode !== "edit") return;
      const target = e.target as HTMLElement;
      if (!target || !isTextElement(target)) return;
      startEditing(target);
    }

    // ── Blur / keyboard handlers ──

    function onBlur(e: FocusEvent) {
      if (!activeRef.current) return;
      if (e.target === activeRef.current.element) {
        commitAndClose();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!activeRef.current) return;
      if (e.target !== activeRef.current.element) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitAndClose();
      }
      if (e.key === "Escape") {
        activeRef.current.element.textContent = activeRef.current.originalText;
        commitAndClose();
      }
    }

    // ── Attach everything ──

    // dblclick via shared iframe helper (translates coords from iframe to parent)
    const cleanupDblClick = attachToDocumentAndIframe(
      [{ event: "dblclick", handler: onDblClick }],
      { translateCoords: true },
    );

    // blur/keydown on parent document
    document.addEventListener("blur", onBlur, true);
    document.addEventListener("keydown", onKeyDown, true);
    // Custom event for context menu "Edit Text"
    document.addEventListener("canvas:start-text-edit" as any, onStartTextEdit, true);

    // Also attach blur/keydown/start-text-edit to iframe doc (polls for iframe remounts)
    let iframeDoc: Document | null = null;
    function attachIframe() {
      const host = document.getElementById("local-canvas-host");
      const shadow = host?.shadowRoot;
      const iframe = shadow?.querySelector("iframe") as HTMLIFrameElement | null;
      const doc = iframe?.contentDocument ?? null;
      if (doc && doc !== iframeDoc) {
        if (iframeDoc) {
          iframeDoc.removeEventListener("blur", onBlur, true);
          iframeDoc.removeEventListener("keydown", onKeyDown, true);
          iframeDoc.removeEventListener("canvas:start-text-edit" as any, onStartTextEdit, true);
        }
        iframeDoc = doc;
        iframeDoc.addEventListener("blur", onBlur, true);
        iframeDoc.addEventListener("keydown", onKeyDown, true);
        iframeDoc.addEventListener("canvas:start-text-edit" as any, onStartTextEdit, true);
      }
    }
    attachIframe();
    const poll = setInterval(attachIframe, 1000);

    return () => {
      // If still editing when unmounting, commit
      if (activeRef.current) commitAndClose();
      cleanupDblClick();
      clearInterval(poll);
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("canvas:start-text-edit" as any, onStartTextEdit, true);
      if (iframeDoc) {
        iframeDoc.removeEventListener("blur", onBlur, true);
        iframeDoc.removeEventListener("keydown", onKeyDown, true);
        iframeDoc.removeEventListener("canvas:start-text-edit" as any, onStartTextEdit, true);
      }
    };
  }, []); // stable — reads everything from refs / getState()
}
