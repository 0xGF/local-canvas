import { useEffect, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useComponentViewStore } from "../stores/component-view-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { attachToDocumentAndIframe } from "../utils/iframe-events.js";

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
    setViewMode: useComponentViewStore.getState().setViewMode,
    getViewMode: () => useComponentViewStore.getState().viewMode,
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

      if (e.key === "Escape") {
        if (s.getViewMode() === "component") { e.preventDefault(); e.stopPropagation(); s.setViewMode("page"); return; }
        s.selectElement(null); s.setCommandBarOpen(false); s.setMode("navigate"); return;
      }
      if (isMeta && e.key === "s") { e.preventDefault(); e.stopPropagation(); s.send({ type: "save" as any }); s.clearPending(); s.clearChanges(); s.historyReset(); return; }
      // Cmd+K reserved for future command bar
      if (isMeta && e.key === "z" && !e.shiftKey) { e.preventDefault(); if (useEditorStore.getState().pendingCount <= 0) return; s.undo(); s.didUndo(); s.decrementPending(); const es = useEditorStore.getState(); es.showToast("↩ Undo"); es.triggerElementFlash(); return; }
      if (isMeta && e.key === "z" && e.shiftKey) { e.preventDefault(); s.redo(); s.didRedo(); s.incrementPending(); const es = useEditorStore.getState(); es.showToast("↪ Redo"); es.triggerElementFlash(); return; }

      if (isTyping(e)) return;
      if (e.key === "n" && !isMeta) { s.setMode("navigate"); return; }
      if (e.key === "v" && !isMeta) { s.setMode("edit"); return; }
      // C key reserved for future component view
    }

    return attachToDocumentAndIframe([{ event: "keydown", handler: handleKeyDown }]);
  }, []);
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}
