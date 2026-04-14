import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import type {
  WSClientMessage,
  WSServerMessage,
  Mutation,
} from "../../server/types.js";

/**
 * Wait for HMR to update the DOM, then call `onUpdate`.
 * Uses a MutationObserver on #root to detect when Vite/webpack hot-reloads
 * the component tree. Falls back to a single 800ms timeout if no mutations
 * are detected (e.g. when HMR is disabled or the change is CSS-only).
 */
function waitForDomUpdate(onUpdate: () => void) {
  const root = document.getElementById("root");
  if (!root) {
    // No #root — just refresh after a short delay
    setTimeout(onUpdate, 300);
    return;
  }

  let resolved = false;
  const resolve = () => {
    if (resolved) return;
    resolved = true;
    observer.disconnect();
    clearTimeout(fallback);
    // Give the browser one frame to settle after the mutation
    requestAnimationFrame(onUpdate);
  };

  const observer = new MutationObserver(resolve);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  // Fallback: if HMR doesn't fire within 2s, refresh anyway
  const fallback = setTimeout(resolve, 2000);
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

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket;

    function connect() {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
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
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
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
    (mutation: Mutation): Promise<WSServerMessage> => {
      // Skip no-op class mutations (adding and removing the same class, or both empty)
      if (mutation.type === "modify-class") {
        const adds = mutation.add?.filter(Boolean) || [];
        const removes = mutation.remove?.filter(Boolean) || [];
        if (adds.length === 0 && removes.length === 0) return Promise.resolve({} as any);
        if (adds.length === 1 && removes.length === 1 && adds[0] === removes[0]) return Promise.resolve({} as any);
      }

      // Log the change before sending
      const changeId = useChangesStore.getState().addChange({
        type: mutation.type,
        filePath: mutation.source.filePath,
        line: mutation.source.line,
        description: describeMutation(mutation),
        status: "pending",
      });

      return new Promise((resolve) => {
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
              waitForDomUpdate(refreshSelection);
            } else {
              useChangesStore.getState().updateChange(changeId, {
                status: "failed",
              });
            }
            resolve(message);
          }
        };

        handlersRef.current.add(handler);
        send({ type: "mutation", id, mutation });
      });
    },
    [send, pushUndo]
  );

  const undo = useCallback(() => {
    send({ type: "undo" });
    // Remove the most recent change entry so save modal shows correct count
    const { changes, removeChange } = useChangesStore.getState();
    if (changes.length > 0) removeChange(changes[changes.length - 1].id);
    waitForDomUpdate(refreshSelection);
  }, [send, refreshSelection]);

  const redo = useCallback(() => {
    send({ type: "redo" });
    waitForDomUpdate(refreshSelection);
  }, [send, refreshSelection]);

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { send, sendMutation, undo, redo, onMessage };
}
