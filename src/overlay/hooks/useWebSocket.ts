import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import type {
  WSClientMessage,
  WSServerMessage,
  Mutation,
} from "../../server/types.js";
import { getIframeDocument } from "../utils/iframe-events.js";
import { withViewTransition, viewTransitionsSupported } from "../utils/view-transitions.js";

/**
 * Wait for HMR to update the DOM, then call `onUpdate`.
 * Uses a MutationObserver on #root to detect when Vite/webpack hot-reloads
 * the component tree. Falls back to a single 800ms timeout if no mutations
 * are detected (e.g. when HMR is disabled or the change is CSS-only).
 */
function waitForDomUpdate(onUpdate: () => void) {
  let resolved = false;
  const resolve = () => {
    if (resolved) return;
    resolved = true;
    observers.forEach(o => o.disconnect());
    clearTimeout(fallback);
    requestAnimationFrame(onUpdate);
  };

  const observers: MutationObserver[] = [];
  const observeOpts: MutationObserverInit = {
    subtree: true, childList: true, attributes: true, attributeFilter: ["class"],
  };

  // Observe #root (navigate mode)
  const root = document.getElementById("root");
  if (root) {
    const mo = new MutationObserver(resolve);
    mo.observe(root, observeOpts);
    observers.push(mo);
  }

  // Observe iframe document (edit mode — HMR updates happen inside iframe)
  const iframeBody = getIframeDocument()?.body;
  if (iframeBody) {
    const mo = new MutationObserver(resolve);
    mo.observe(iframeBody, observeOpts);
    observers.push(mo);
  }

  // Fallback if no observers or HMR doesn't fire
  const fallback = setTimeout(resolve, observers.length > 0 ? 2000 : 300);
}


/** Build a human-readable description from a mutation. */
function describeMutation(m: Mutation): string {
  switch (m.type) {
    case "modify-class": {
      const parts: string[] = [];
      if (m.add?.length) parts.push(`Added ${m.add.join(" ")}`);
      if (m.remove?.length) parts.push(`Removed ${m.remove.join(" ")}`);
      return parts.join(", ") || "Modified classes";
    }
    case "modify-style":
      return `Set ${m.property}: ${m.value}`;
    case "reorder":
      return `Reordered child ${m.fromIndex} → ${m.toIndex}`;
    case "insert":
      return `Inserted <${m.componentName}>`;
    case "delete":
      return `Deleted element`;
    case "modify-text":
      return `Changed text to "${m.newText.slice(0, 30)}${m.newText.length > 30 ? "…" : ""}"`;
    default:
      return "Modified element";
  }
}

type MessageHandler = (message: WSServerMessage) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const setConnected = useEditorStore((s) => s.setConnected);
  const refreshSelection = useEditorStore((s) => s.refreshSelection);
  const pushUndo = useHistoryStore((s) => s.pushUndo);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/__canvas/ws`;

    const INITIAL_DELAY = 1000;
    const MAX_DELAY = 30000;

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | undefined;
    let retries = 0;
    let disposed = false;

    function clearReconnectTimer() {
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    }

    function scheduleReconnect() {
      if (disposed) return;
      if (typeof document !== "undefined" && document.hidden) return;
      clearReconnectTimer();
      const delay = Math.min(INITIAL_DELAY * 2 ** retries, MAX_DELAY);
      retries += 1;
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (disposed) return;
      clearReconnectTimer();
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retries = 0;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message: WSServerMessage = JSON.parse(event.data);
          handlersRef.current.forEach((handler) => handler(message));
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    function onVisibilityChange() {
      if (disposed) return;
      if (document.hidden) {
        // Pause reconnect attempts while tab is hidden
        clearReconnectTimer();
      } else {
        // Tab became visible — if disconnected, reconnect immediately
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          retries = 0;
          clearReconnectTimer();
          connect();
        }
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    connect();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearReconnectTimer();
      ws?.close();
    };
  }, [setConnected]);

  const send = useCallback((message: WSClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const sendMutation = useCallback(
    (mutation: Mutation, opts?: { viewTransition?: boolean }): Promise<WSServerMessage | void> => {
      // Skip no-op class mutations (adding and removing the same class, or both empty)
      if (mutation.type === "modify-class") {
        const adds = mutation.add?.filter(Boolean) || [];
        const removes = mutation.remove?.filter(Boolean) || [];
        if (adds.length === 0 && removes.length === 0) return Promise.resolve();
        if (adds.length === 1 && removes.length === 1 && adds[0] === removes[0]) return Promise.resolve();
      }

      // Log the change before sending
      const changeId = useChangesStore.getState().addChange({
        type: mutation.type,
        filePath: mutation.source.filePath,
        line: mutation.source.line,
        description: describeMutation(mutation),
        status: "pending",
      });

      // Opt in to VT only when the caller explicitly asks. Most mutations come
      // from scrubs / drags / typing that already have live preview — a 250ms
      // cross-fade there would stretch an already-snappy interaction, and
      // holding the promise open past HMR leaves the next drag-start reading
      // the pre-commit value. Callers that want VT (undo/redo, discrete
      // class/color picks) pass `viewTransition: true`.
      const useVT = opts?.viewTransition === true;
      const targetEl = useVT ? useEditorStore.getState().selectedElement?.element ?? null : null;

      return withViewTransition(targetEl, () => new Promise<WSServerMessage | void>((resolve) => {
        const id = crypto.randomUUID();

        const handler: MessageHandler = (message) => {
          if (
            message.type === "mutation-result" &&
            message.id === id
          ) {
            handlersRef.current.delete(handler);
            if (message.result.success) {
              pushUndo();
              useChangesStore.getState().updateChange(changeId, {
                status: "applied",
                diff: message.result.diff,
              });
              // Poll for HMR DOM update — watch for class changes on the
              // selected element rather than guessing with fixed timeouts.
              // Only resolve once the DOM has settled so the view transition
              // captures the post-mutation state for its "after" snapshot.
              waitForDomUpdate(() => {
                refreshSelection();
                resolve(message);
              });
            } else {
              useChangesStore.getState().updateChange(changeId, {
                status: "failed",
              });
              resolve(message);
            }
          }
        };

        handlersRef.current.add(handler);
        send({ type: "mutation", id, mutation });
      }));
    },
    [send, pushUndo]
  );

  const undo = useCallback(() => {
    const { changes, removeChange } = useChangesStore.getState();
    const targetEl = useEditorStore.getState().selectedElement?.element ?? null;
    // Flash serves as fallback feedback when VT can't run (no target element,
    // unsupported browser, disconnected node). When VT covers the transition,
    // flash would double up.
    const vtWillRun = !!targetEl && targetEl.isConnected && viewTransitionsSupported();
    withViewTransition(targetEl, () => new Promise<void>((resolve) => {
      send({ type: "undo" });
      if (changes.length > 0) removeChange(changes[changes.length - 1].id);
      waitForDomUpdate(() => {
        refreshSelection();
        if (!vtWillRun) useEditorStore.getState().triggerElementFlash();
        resolve();
      });
    }));
  }, [send, refreshSelection]);

  const redo = useCallback(() => {
    const targetEl = useEditorStore.getState().selectedElement?.element ?? null;
    const vtWillRun = !!targetEl && targetEl.isConnected && viewTransitionsSupported();
    withViewTransition(targetEl, () => new Promise<void>((resolve) => {
      send({ type: "redo" });
      waitForDomUpdate(() => {
        refreshSelection();
        if (!vtWillRun) useEditorStore.getState().triggerElementFlash();
        resolve();
      });
    }));
  }, [send, refreshSelection]);

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { send, sendMutation, undo, redo, onMessage };
}
