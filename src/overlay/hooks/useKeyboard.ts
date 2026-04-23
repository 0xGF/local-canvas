import { useEffect, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { attachToDocumentAndIframe, bind } from "../utils/iframe-events.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { dispatchNavigatePin, dispatchToggleAIHistory } from "../utils/annotations.js";

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

      // Global shortcuts — Cmd+S still saves while typing (convention across
      // every text editor), but undo/redo must NOT fire while the user is in
      // a text input, including the AskAI chat and any app-side input the
      // user may have focused. The overlay-side inline editor tracks its own
      // state via `editingText`, which we also honour.
      // Cmd/Ctrl+S → open the existing Save popover on the toolbar so the
      // user can pick "this breakpoint and up" vs "all screens" before
      // committing. No-ops (to a toast) when nothing is pending.
      if (isMeta && e.key === "s") {
        e.preventDefault(); e.stopPropagation();
        window.dispatchEvent(new CustomEvent("canvas:toggle-save-panel"));
        return;
      }
      const typing = isTyping(e);
      if (!typing && !useEditorStore.getState().editingText) {
        // Gate on the writer's undoStack (via history-store `canUndo`), not
        // on `pendingCount`. Save zeroes the pending counter, but the
        // writer's undo snapshots are still there — without this, ⌘Z
        // silently no-ops after a save. Matches the toolbar button fix.
        if (isMeta && e.key === "z" && !e.shiftKey) { e.preventDefault(); if (!useHistoryStore.getState().canUndo) return; s.undo(); s.didUndo(); s.decrementPending(); useEditorStore.getState().showToast("↩ Undo"); return; }
        if (isMeta && e.key === "y") { e.preventDefault(); s.redo(); s.didRedo(); s.incrementPending(); useEditorStore.getState().showToast("↪ Redo"); return; }
        if (isMeta && e.key === "z" && e.shiftKey) { e.preventDefault(); s.redo(); s.didRedo(); s.incrementPending(); useEditorStore.getState().showToast("↪ Redo"); return; }
      }

      // Let inputs handle their own keystrokes (including Escape)
      if (typing) return;

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

      // `l` in edit mode toggles the layers panel.
      if (e.key === "l" && !isMeta && !e.shiftKey && !e.altKey &&
          useEditorStore.getState().mode === "edit") {
        e.preventDefault();
        useEditorStore.getState().toggleLayers();
        return;
      }

      // `h` in edit mode toggles the annotation history popover.
      if (e.key === "h" && !isMeta && !e.shiftKey && !e.altKey &&
          useEditorStore.getState().mode === "edit") {
        e.preventDefault();
        dispatchToggleAIHistory();
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
      if (e.key === "c" && !isMeta) {
        s.setMode("edit");
        return;
      }

      // Alt+P — toggle animation pause (edit mode only).
      // Use `e.code` because on macOS Alt+letter produces a special char
      // (Alt+P → "π") which would make `e.key === "p"` always false.
      if (e.code === "KeyP" && e.altKey && !isMeta && !e.shiftKey &&
          useEditorStore.getState().mode === "edit") {
        e.preventDefault();
        useEditorStore.getState().toggleAnimationsPaused();
        const paused = useEditorStore.getState().animationsPaused;
        useEditorStore.getState().showToast(paused ? "Animations paused" : "Animations resumed");
        return;
      }

      // Space hold — enter interactive mode (pass events through to the app)
      if (e.key === " " && !isMeta && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        useEditorStore.getState().setInteracting(true);
        return;
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      // Release space — exit interactive mode
      if (e.key === " ") {
        useEditorStore.getState().setInteracting(false);
      }
    }

    // Defensive: if the user holds space, clicks a link, and the browser
    // navigates — or any other flow moves focus out of our window — the
    // keyup never arrives and `interacting` gets stuck on, which silently
    // disables every overlay interaction (including the annotate flow).
    // Reset on blur / visibility change / iframe navigation.
    function resetInteracting() {
      if (useEditorStore.getState().interacting) {
        useEditorStore.getState().setInteracting(false);
      }
    }

    window.addEventListener("blur", resetInteracting);
    document.addEventListener("visibilitychange", resetInteracting);

    const cleanup = attachToDocumentAndIframe([
      bind("keydown", handleKeyDown),
      bind("keyup", handleKeyUp),
    ]);
    return () => {
      cleanup();
      window.removeEventListener("blur", resetInteracting);
      document.removeEventListener("visibilitychange", resetInteracting);
    };
  }, []);
}

function isTyping(e: KeyboardEvent): boolean {
  // Use composedPath to see through shadow DOM (e.target is retargeted to the host)
  const t = (e.composedPath()[0] || e.target) as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}
