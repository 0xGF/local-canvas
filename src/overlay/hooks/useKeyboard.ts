import { useEffect, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { attachToDocumentAndIframe } from "../utils/iframe-events.js";
import { resolveSource } from "../../core/source-map/resolver.js";

export function useKeyboard() {
  const { undo, redo, send } = useWebSocket();

  // Refs for stable closure — handler never recreated
  const storeRef = useRef({
    undo, redo, send,
    selectElement: useEditorStore.getState().selectElement,
    setCommandBarOpen: useEditorStore.getState().setCommandBarOpen,
    setMode: useEditorStore.getState().setMode,
    clearPending: useEditorStore.getState().clearPending,
    decrementPending: useEditorStore.getState().decrementPending,
    incrementPending: useEditorStore.getState().incrementPending,
    didUndo: useHistoryStore.getState().didUndo,
    didRedo: useHistoryStore.getState().didRedo,
    clearChanges: useChangesStore.getState().clearChanges,
    historyReset: useHistoryStore.getState().reset,
  });
  storeRef.current.undo = undo;
  storeRef.current.redo = redo;
  storeRef.current.send = send;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const s = storeRef.current;
      const isMeta = e.metaKey || e.ctrlKey;

      // Global shortcuts (work even while typing)
      if (isMeta && e.key === "s") { e.preventDefault(); e.stopPropagation(); s.send({ type: "save" as any }); s.clearPending(); s.clearChanges(); return; }
      if (isMeta && e.key === "z" && !e.shiftKey) { e.preventDefault(); if (useEditorStore.getState().pendingCount <= 0) return; s.undo(); s.didUndo(); s.decrementPending(); useEditorStore.getState().showToast("↩ Undo"); return; }
      if (isMeta && e.key === "z" && e.shiftKey) { e.preventDefault(); s.redo(); s.didRedo(); s.incrementPending(); useEditorStore.getState().showToast("↪ Redo"); return; }

      // Let inputs handle their own keystrokes (including Escape)
      if (isTyping(e)) return;

      if (e.key === "Escape") {
        // Close command bar if open
        if (useEditorStore.getState().commandBarOpen) { s.setCommandBarOpen(false); return; }
        // If editing text, let useTextEdit handle Escape
        if (useEditorStore.getState().editingText) return;
        // If something is selected, select its parent (like Figma)
        const sel = useEditorStore.getState().selectedElement;
        if (sel) {
          const parent = sel.element.parentElement;
          if (parent && parent !== document.body && parent !== document.documentElement) {
            const parentSource = resolveSource(parent);
            s.selectElement({
              element: parent,
              source: parentSource,
              rect: parent.getBoundingClientRect(),
              className: typeof parent.className === "string" ? parent.className : "",
              tagName: parent.tagName.toLowerCase(),
              iframeRef: sel.iframeRef,
            });
            useEditorStore.getState().showToast(`Selected <${parent.tagName.toLowerCase()}>`);
            return;
          }
          // At top-level — deselect
          s.selectElement(null);
          return;
        }
        // Nothing selected — switch to navigate mode
        s.setMode("navigate");
        return;
      }
      if (e.key === "n" && !isMeta) {
        s.setMode("navigate");
        return;
      }
      if (e.key === "v" && !isMeta) {
        s.setMode("edit");
        return;
      }
    }

    return attachToDocumentAndIframe([{ event: "keydown", handler: handleKeyDown }]);
  }, []);
}

function isTyping(e: KeyboardEvent): boolean {
  // Use composedPath to see through shadow DOM (e.target is retargeted to the host)
  const t = (e.composedPath()[0] || e.target) as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}
