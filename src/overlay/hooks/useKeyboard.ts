import { useEffect, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { attachToDocumentAndIframe, bind } from "../utils/iframe-events.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { dispatchNavigatePin, dispatchToggleAIHistory } from "../utils/agentation.js";

/** How long (ms) a chord-leader key stays armed before we drop it. */
const CHORD_TIMEOUT_MS = 750;

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

  // Chord state — when the leader key (currently only `g`) is pressed, we
  // arm this and consume the NEXT key as the chord. Cleared on timeout or
  // on any non-matching key.
  const chordRef = useRef<{ leader: string | null; timer: ReturnType<typeof setTimeout> | null }>({
    leader: null, timer: null,
  });

  useEffect(() => {
    function clearChord() {
      if (chordRef.current.timer) clearTimeout(chordRef.current.timer);
      chordRef.current = { leader: null, timer: null };
    }
    function armChord(leader: string) {
      if (chordRef.current.timer) clearTimeout(chordRef.current.timer);
      chordRef.current.leader = leader;
      chordRef.current.timer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
    }

    function handleKeyDown(e: KeyboardEvent) {
      const s = storeRef.current;
      const isMeta = e.metaKey || e.ctrlKey;

      // Global shortcuts (work even while typing)
      if (isMeta && e.key === "s") { e.preventDefault(); e.stopPropagation(); s.send({ type: "save" }); s.clearPending(); s.clearChanges(); return; }
      if (isMeta && e.key === "z" && !e.shiftKey) { e.preventDefault(); if (useEditorStore.getState().pendingCount <= 0) return; s.undo(); s.didUndo(); s.decrementPending(); useEditorStore.getState().showToast("↩ Undo"); return; }
      if (isMeta && e.key === "z" && e.shiftKey) { e.preventDefault(); s.redo(); s.didRedo(); s.incrementPending(); useEditorStore.getState().showToast("↪ Redo"); return; }

      // Let inputs handle their own keystrokes (including Escape)
      if (isTyping(e)) return;

      // Chord resolution: if `g` is armed, the next key finishes the chord.
      if (chordRef.current.leader === "g" && !isMeta) {
        const leader = chordRef.current.leader;
        clearChord();
        if (e.key === "h") {
          e.preventDefault();
          dispatchToggleAIHistory();
          return;
        }
        // Unknown follow-up — let other handlers process this key. We've
        // already cleared the chord so there's no leak.
        // Fall through so e.g. `g n` still triggers navigate mode via `n`.
        void leader;
      }

      // Pin navigation shortcuts (only meaningful in edit mode).
      if (useEditorStore.getState().mode === "edit" && !isMeta) {
        if (e.key === "[") { e.preventDefault(); dispatchNavigatePin("prev"); return; }
        if (e.key === "]") { e.preventDefault(); dispatchNavigatePin("next"); return; }
      }

      // `a` in edit mode toggles the annotate tool.
      if (e.key === "a" && !isMeta && !e.shiftKey && !e.altKey &&
          useEditorStore.getState().mode === "edit") {
        e.preventDefault();
        const on = useEditorStore.getState().annotateMode;
        useEditorStore.getState().setAnnotateMode(!on);
        return;
      }

      // Chord leader: `g` on its own arms the chord, doesn't produce output.
      if (e.key === "g" && !isMeta && !e.shiftKey && !e.altKey) {
        armChord("g");
        return;
      }

      if (e.key === "Escape") {
        // Exit annotate tool if active (higher priority than selection walk-up)
        if (useEditorStore.getState().annotateMode) {
          useEditorStore.getState().setAnnotateMode(false);
          return;
        }
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

    return attachToDocumentAndIframe([bind("keydown", handleKeyDown)]);
  }, []);
}

function isTyping(e: KeyboardEvent): boolean {
  // Use composedPath to see through shadow DOM (e.target is retargeted to the host)
  const t = (e.composedPath()[0] || e.target) as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}
