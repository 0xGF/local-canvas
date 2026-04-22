import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, X, Trash2, Reset } from "./icons.js";
import { THEME } from "../theme.js";
import { PopFade } from "../utils/motion-presets.js";
import {
  listAnnotations,
  scrollToAndOpenAnnotation,
  listAgentUndoEntries,
  undoAgentChange,
  clearAllAnnotations,
  updateAnnotationStatus,
  type Annotation,
  type AgentUndoEntry,
} from "../utils/annotations.js";
import { useEditorStore } from "../stores/editor-store.js";

const C = THEME;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Read straight from the theme — the same tokens feed the pin disc and
// the cluster hover-list chip, so the entire annotation surface moves as
// one system when the palette changes.
function statusMeta(status?: string) {
  if (status === "resolved") return { color: C.success, label: "Resolved" };
  if (status === "dismissed") return { color: C.neutral, label: "Dismissed" };
  if (status === "in_progress") return { color: C.accent, label: "Working" };
  if (status === "needs_input") return { color: C.attention, label: "Needs input" };
  return { color: C.warning, label: "Pending" };
}

/** Coloured dot + label chip that matches the pin palette. Single source of
 *  status truth in the popover — removes the need for the uppercase
 *  secondary status line that was cluttering every row. */
function StatusChip({ status }: { status?: string }) {
  const { color, label } = statusMeta(status);
  return (
    <span
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 9, fontWeight: 600, color,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: "50%", background: color,
          animation: status === "in_progress" ? "canvasDotWorking 1.4s ease-in-out infinite" : undefined,
        }}
      />
      {label}
    </span>
  );
}

interface HistoryRowProps {
  a: Annotation;
  onOpen: (a: Annotation) => void;
  onDismiss: (id: string) => void;
  undoAvailable: boolean;
  onUndo: (id: string) => void;
}

const HistoryRow = React.memo(function HistoryRow({ a, onOpen, onDismiss, undoAvailable, onUndo }: HistoryRowProps) {
  const [hovered, setHovered] = useState(false);
  const fileTail = a.elementPath?.split("/").pop();
  const tag = a.element?.match(/^<(\w+)>/)?.[1];
  const lastReply = a.thread?.filter(t => t.role === "agent").slice(-1)[0]?.content;
  const onCurrentPage = a.url === window.location.href;
  const canDismiss = a.status !== "dismissed";

  return (
    <div
      onClick={() => onOpen(a)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={onCurrentPage ? "Click to jump to this annotation" : `On ${a.url}`}
      style={{
        padding: "10px 12px",
        borderBottom: `1px solid ${C.borderLight}`,
        cursor: onCurrentPage ? "pointer" : "default",
        background: hovered && onCurrentPage ? C.bgHover : "transparent",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, color: C.fg, lineHeight: 1.4, wordBreak: "break-word",
          }}>
            {a.comment || <em style={{ color: C.fgMuted }}>(no prompt)</em>}
          </div>
          <div style={{
            marginTop: 4,
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 10, color: C.fgMuted, fontFamily: C.mono,
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}>
            <StatusChip status={a.status} />
            {(tag || fileTail) && <span style={{ opacity: 0.5 }}>·</span>}
            {tag && <span>{tag}</span>}
            {fileTail && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{fileTail}</span>}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
          marginTop: 1,
        }}>
          <span style={{ fontSize: 10, color: C.fgMuted, fontFamily: C.mono }}>
            {timeAgo(a.timestamp)}
          </span>
          {hovered && canDismiss && (
            <button
              onClick={e => { e.stopPropagation(); onDismiss(a.id); }}
              title="Dismiss"
              style={{
                background: "none", border: "none",
                color: C.fgMuted, cursor: "pointer",
                padding: 2, display: "flex", alignItems: "center",
                borderRadius: 3,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.danger; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.fgMuted; }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {lastReply && (
        <div style={{
          fontSize: 10, color: C.fgDim, marginTop: 6,
          padding: "6px 8px", background: C.bgAlt, borderRadius: 5, lineHeight: 1.4,
          borderLeft: `2px solid ${C.accent}`,
        }}>
          {lastReply}
        </div>
      )}

      {undoAvailable && (
        <button
          onClick={e => { e.stopPropagation(); onUndo(a.id); }}
          style={{
            marginTop: 6,
            fontSize: 10, color: C.fgDim,
            background: "transparent",
            border: `1px solid ${C.borderLight}`,
            padding: "2px 8px", borderRadius: 3,
            cursor: "pointer", fontFamily: C.mono,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.warning; e.currentTarget.style.borderColor = C.warning; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.fgDim; e.currentTarget.style.borderColor = C.borderLight; }}
          title="Restore the files as they were before the agent edited them"
        >
          <Reset size={9} /> Undo edit
        </button>
      )}
    </div>
  );
});

interface Props {
  /** Render-prop button so the parent toolbar controls styling. */
  renderButton: (open: () => void, count: number) => React.ReactNode;
}

/**
 * Shows the history of "Ask AI..." prompts in a popover. Polls the
 * annotations endpoint every 5s while open. Per-row X dismisses server-side;
 * header trash clears everything. No client-side hide system — one mental
 * model: dismiss (status=dismissed) or clear (delete all).
 */
export const AskAIHistory = React.memo(function AskAIHistory({ renderButton }: Props) {
  const [open, setOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [undoEntries, setUndoEntries] = useState<AgentUndoEntry[]>([]);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const showToast = useEditorStore(s => s.showToast);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, undoList] = await Promise.all([
        listAnnotations(),
        listAgentUndoEntries(),
      ]);
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setAnnotations(list);
      setUndoEntries(undoList);
    } catch {
      // Server unreachable — leave previous state
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUndo = useCallback(async (id: string) => {
    const result = await undoAgentChange(id);
    if (!result) {
      showToast("Nothing to undo");
      return;
    }
    const summary = result.summary
      ? `Undid: ${result.summary}`
      : `Undid ${result.restored.length} file${result.restored.length === 1 ? "" : "s"}`;
    showToast(summary);
    refresh();
  }, [refresh, showToast]);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    refresh();
    intervalRef.current = setInterval(refresh, 5000);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [open, refresh]);

  // Keyboard shortcut (`h` in edit mode) dispatches this to toggle the popover.
  useEffect(() => {
    function onToggle() { setOpen(o => !o); }
    window.addEventListener("canvas:toggle-ai-history", onToggle);
    return () => window.removeEventListener("canvas:toggle-ai-history", onToggle);
  }, []);

  // Refresh immediately when a new annotation is posted so the row appears
  // without waiting for the 5s poll tick.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("canvas:annotation-posted", refresh);
    return () => window.removeEventListener("canvas:annotation-posted", refresh);
  }, [open, refresh]);

  const handleOpenAnnotation = useCallback((a: Annotation) => {
    if (a.url !== window.location.href) return;
    setOpen(false);
    scrollToAndOpenAnnotation(a);
  }, []);

  const handleDismiss = useCallback(async (id: string) => {
    // Optimistic: flip row immediately, then fire the PATCH. Poll reconciles
    // on failure.
    setAnnotations(prev => prev.map(x => x.id === id ? { ...x, status: "dismissed" } : x));
    const result = await updateAnnotationStatus(id, "dismissed");
    if (!result) {
      showToast("Couldn't dismiss — server unreachable");
      refresh();
      return;
    }
    showToast("Dismissed");
  }, [refresh, showToast]);

  const pendingCount = annotations.filter(a => a.status === "pending" || !a.status).length;
  const undoIds = new Set(undoEntries.map(e => e.annotationId));

  return (
    <div style={{ position: "relative" }}>
      {renderButton(() => setOpen(o => !o), pendingCount)}

      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2147483646 }}
          onClick={() => setOpen(false)}
        />
      )}
      <PopFade
        open={open}
        style={{
          position: "absolute", bottom: "100%", right: 0,
          marginBottom: 8,
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
          zIndex: 2147483647,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          width: 340, maxHeight: 440,
          display: "flex", flexDirection: "column",
          fontFamily: C.font,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: C.fg }}>
            <Sparkles size={12} />
            Annotations
            {annotations.length > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: C.accent,
                background: "rgba(12,140,233,0.15)",
                padding: "1px 6px", borderRadius: 8,
              }}>{annotations.length}</span>
            )}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {annotations.length > 0 && (
              <button
                onClick={() => setConfirmingClearAll(true)}
                title="Delete every annotation"
                style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", padding: 2, display: "flex", borderRadius: 3 }}
                onMouseEnter={e => { e.currentTarget.style.color = C.danger; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.fgMuted; }}
              >
                <Trash2 size={12} />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", padding: 2, display: "flex", borderRadius: 3 }}
              onMouseEnter={e => { e.currentTarget.style.color = C.fg; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.fgMuted; }}
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Clear-all confirmation — slides in below header */}
        {confirmingClearAll && (
          <div style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${C.borderLight}`,
            background: "rgba(242,72,34,0.08)",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <span style={{ fontSize: 11, color: C.fg, lineHeight: 1.4 }}>
              Delete every annotation? This can't be undone.
            </span>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmingClearAll(false)}
                disabled={clearing}
                style={{
                  height: 22, padding: "0 10px", borderRadius: 4,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.fgDim, fontFamily: C.font, fontSize: 10,
                  cursor: clearing ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setClearing(true);
                  const result = await clearAllAnnotations();
                  setClearing(false);
                  setConfirmingClearAll(false);
                  if (!result) {
                    showToast("Couldn't clear — server unreachable");
                    return;
                  }
                  showToast(`Cleared ${result.deleted} annotation${result.deleted === 1 ? "" : "s"}`);
                  refresh();
                }}
                disabled={clearing}
                style={{
                  height: 22, padding: "0 10px", border: "none", borderRadius: 4,
                  background: C.danger, color: "#fff",
                  fontFamily: C.font, fontSize: 10, fontWeight: 600,
                  cursor: clearing ? "default" : "pointer", opacity: clearing ? 0.6 : 1,
                }}
              >
                {clearing ? "Clearing…" : "Clear"}
              </button>
            </div>
          </div>
        )}

        {/* Row list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {annotations.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: C.fgMuted, fontSize: 11, lineHeight: 1.5 }}>
              {loading ? "Loading…" : (
                <>
                  No annotations yet.<br />
                  <span style={{ fontSize: 10 }}>Press <kbd style={{ fontFamily: C.mono, background: C.bgAlt, padding: "1px 4px", borderRadius: 3 }}>A</kbd> then click any element</span>
                </>
              )}
            </div>
          ) : (
            annotations.map(a => (
              <HistoryRow
                key={a.id}
                a={a}
                onOpen={handleOpenAnnotation}
                onDismiss={handleDismiss}
                undoAvailable={undoIds.has(a.id)}
                onUndo={handleUndo}
              />
            ))
          )}
        </div>
      </PopFade>
    </div>
  );
});
