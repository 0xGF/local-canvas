import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, X, Trash2, Reset } from "./icons.js";
import { THEME } from "../theme.js";
import { PopFade } from "../utils/motion-presets.js";
import {
  listAnnotations,
  currentSessionId,
  hideAnnotation,
  hideAllAnnotations,
  unhideAllAnnotations,
  getHiddenAnnotationIds,
  scrollToAndOpenAnnotation,
  listAgentUndoEntries,
  undoAgentChange,
  simulateAgentEdit,
  clearAllAgentationSessions,
  type Annotation,
  type AgentUndoEntry,
} from "../utils/agentation.js";
import { useEditorStore } from "../stores/editor-store.js";

const C = THEME;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusDot({ status }: { status?: string }) {
  const color = status === "resolved" ? C.success
    : status === "dismissed" ? C.fgMuted
    : C.warning;
  const label = status === "resolved" ? "Resolved"
    : status === "dismissed" ? "Dismissed"
    : "Pending";
  return (
    <span title={label} style={{
      width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0,
    }} />
  );
}

interface HistoryRowProps {
  a: Annotation;
  onOpen: (a: Annotation) => void;
  onHide: (id: string) => void;
  undoAvailable: boolean;
  onUndo: (id: string) => void;
  onSimulate: (a: Annotation) => void;
}

const HistoryRow = React.memo(function HistoryRow({ a, onOpen, onHide, undoAvailable, onUndo, onSimulate }: HistoryRowProps) {
  const [hovered, setHovered] = useState(false);
  const fileTail = a.elementPath?.split("/").pop() || a.elementPath;
  const tag = a.element?.match(/^<(\w+)>/)?.[1] || "?";
  // Last agent reply, if any (agentation server stores them in `thread`)
  const lastReply = a.thread?.filter(t => t.role === "agent").slice(-1)[0]?.content;
  const onCurrentPage = a.url === window.location.href;

  return (
    <div
      onClick={() => onOpen(a)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={onCurrentPage ? "Click to jump to this annotation" : `On ${a.url}`}
      style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${C.borderLight}`,
        cursor: onCurrentPage ? "pointer" : "default",
        background: hovered && onCurrentPage ? C.bgAlt : "transparent",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <StatusDot status={a.status} />
        <span style={{ flex: 1, fontSize: 11, color: C.fg, lineHeight: 1.35, wordBreak: "break-word" }}>
          {a.comment || <em style={{ color: C.fgMuted }}>(no prompt)</em>}
        </span>
        {hovered ? (
          <button
            onClick={e => { e.stopPropagation(); onHide(a.id); }}
            title="Hide from my queue"
            style={{
              background: "none", border: "none",
              color: C.fgMuted, cursor: "pointer",
              padding: 2, display: "flex", alignItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={10} />
          </button>
        ) : (
          <span style={{ fontSize: 9, color: C.fgMuted, flexShrink: 0 }}>
            {timeAgo(a.timestamp)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: C.fgMuted, fontFamily: C.mono, marginLeft: 12 }}>
        {"<"}{tag}{">"} {fileTail && <span style={{ marginLeft: 4 }}>{fileTail}</span>}
      </div>
      {lastReply && (
        <div style={{
          fontSize: 10, color: C.fgDim, marginTop: 4, marginLeft: 12,
          padding: "4px 6px", background: C.bgAlt, borderRadius: 4, lineHeight: 1.35,
        }}>
          {lastReply}
        </div>
      )}
      <div style={{ marginTop: 6, marginLeft: 12, display: "flex", gap: 6 }}>
        {undoAvailable ? (
          <button
            onClick={e => { e.stopPropagation(); onUndo(a.id); }}
            style={{
              fontSize: 10, color: C.warning,
              background: "transparent",
              border: `1px solid ${C.borderLight}`,
              padding: "2px 8px", borderRadius: 3,
              cursor: "pointer", fontFamily: C.mono,
            }}
            title="Restore the files as they were before the agent edited them"
          >
            Undo agent change
          </button>
        ) : (
          a.elementPath && a.elementPath.includes(":") && (
            <button
              onClick={e => { e.stopPropagation(); onSimulate(a); }}
              style={{
                fontSize: 10, color: C.fgMuted,
                background: "transparent",
                border: `1px dashed ${C.borderLight}`,
                padding: "2px 8px", borderRadius: 3,
                cursor: "pointer", fontFamily: C.mono,
              }}
              title="Dev helper — writes a marker line at the top of this annotation's file so you can see Undo restore it"
            >
              Simulate agent edit
            </button>
          )
        )}
      </div>
    </div>
  );
});

interface Props {
  /** Render-prop button so the parent toolbar controls styling. */
  renderButton: (open: () => void, count: number) => React.ReactNode;
}

/**
 * Shows the history of "Ask AI..." prompts in a popover.
 * Polls the agentation session every 5s while open.
 */
export const AskAIHistory = React.memo(function AskAIHistory({ renderButton }: Props) {
  const [open, setOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenAnnotationIds());
  const [loading, setLoading] = useState(false);
  const [undoEntries, setUndoEntries] = useState<AgentUndoEntry[]>([]);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const showToast = useEditorStore(s => s.showToast);

  const refresh = useCallback(async () => {
    if (!currentSessionId()) { setAnnotations([]); return; }
    setLoading(true);
    try {
      const [list, undoList] = await Promise.all([
        listAnnotations(),
        listAgentUndoEntries(),
      ]);
      // Newest first
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setAnnotations(list);
      setUndoEntries(undoList);
    } catch {
      // Server unreachable — leave previous state
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSimulate = useCallback(async (a: Annotation) => {
    // Take the first path from comma-joined groups so the simulated edit
    // targets a real file on disk.
    const path = (a.elementPath || "").split(",")[0].trim();
    const lastColon = path.lastIndexOf(":");
    if (lastColon < 0) return;
    const filePath = path.slice(0, lastColon);
    const ok = await simulateAgentEdit(a.id, filePath);
    if (ok) {
      showToast(`Simulated agent edit to ${filePath.split("/").pop()}`);
      refresh();
    } else {
      showToast("Couldn't simulate (file not resolvable?)");
    }
  }, [refresh, showToast]);

  const handleUndo = useCallback(async (id: string) => {
    const result = await undoAgentChange(id);
    if (!result) {
      showToast("Nothing to undo");
      return;
    }
    const count = result.restored.length;
    const summary = result.summary
      ? `Undid: ${result.summary}`
      : `Undid: ${count} file${count === 1 ? "" : "s"} restored`;
    showToast(summary);
    // Refresh right away so the Undo button disappears from the row.
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

  // Stay in sync with other components that hide annotations.
  useEffect(() => {
    function onChange() { setHiddenIds(getHiddenAnnotationIds()); }
    window.addEventListener("canvas:hidden-annotations-changed", onChange);
    return () => window.removeEventListener("canvas:hidden-annotations-changed", onChange);
  }, []);

  // Keyboard shortcut (`h` in edit mode) dispatches this event to toggle the popover.
  useEffect(() => {
    function onToggle() { setOpen(o => !o); }
    window.addEventListener("canvas:toggle-ai-history", onToggle);
    return () => window.removeEventListener("canvas:toggle-ai-history", onToggle);
  }, []);

  // Refresh the list immediately when a new annotation is posted, so the
  // row appears without waiting for the 5s poll tick.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("canvas:annotation-posted", refresh);
    return () => window.removeEventListener("canvas:annotation-posted", refresh);
  }, [open, refresh]);

  const handleOpenAnnotation = useCallback((a: Annotation) => {
    if (a.url !== window.location.href) return; // Can't jump cross-page
    setOpen(false);
    scrollToAndOpenAnnotation(a);
  }, []);

  const handleHide = useCallback((id: string) => {
    hideAnnotation(id);
    setHiddenIds(getHiddenAnnotationIds());
  }, []);

  const visible = annotations.filter(a => !hiddenIds.has(a.id));
  const pendingCount = visible.filter(a => a.status === "pending" || !a.status).length;
  const undoIds = new Set(undoEntries.map(e => e.annotationId));
  const latestUndoId = undoEntries[0]?.annotationId;

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
        }}
      >
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: C.fg }}>
                  <Sparkles size={12} />
                  Annotation history
                  {visible.length > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: C.accent,
                      background: "rgba(12,140,233,0.15)", padding: "1px 6px", borderRadius: 8,
                    }}>{visible.length}</span>
                  )}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button
                    onClick={() => setConfirmingClearAll(true)}
                    title="Delete every annotation across every session"
                    style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", padding: 2, display: "flex" }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.danger; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.fgMuted; }}
                  >
                    <Trash2 size={12} />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", padding: 2 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {confirmingClearAll && (
                <div style={{
                  padding: "10px 12px",
                  borderBottom: `1px solid ${C.borderLight}`,
                  background: "rgba(242,72,34,0.08)",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <span style={{ fontSize: 11, color: C.fg, lineHeight: 1.4 }}>
                    Delete every annotation across every session? This cannot be undone.
                  </span>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setConfirmingClearAll(false)}
                      disabled={clearing}
                      style={{
                        height: 22, padding: "0 8px", borderRadius: 4,
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
                        const result = await clearAllAgentationSessions();
                        setClearing(false);
                        setConfirmingClearAll(false);
                        if (!result) {
                          showToast("Couldn't clear sessions (server unreachable?)");
                          return;
                        }
                        setHiddenIds(new Set());
                        showToast(`Cleared ${result.deletedAnnotations} annotation${result.deletedAnnotations === 1 ? "" : "s"} across ${result.sessions} session${result.sessions === 1 ? "" : "s"}`);
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
                      {clearing ? "Clearing…" : "Clear all"}
                    </button>
                  </div>
                </div>
              )}

              {latestUndoId && (
                <div style={{
                  padding: "6px 12px",
                  borderBottom: `1px solid ${C.borderLight}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 10, color: C.fgMuted, fontFamily: C.mono,
                }}>
                  <span>{undoEntries.length} agent edit{undoEntries.length === 1 ? "" : "s"} recoverable</span>
                  <button
                    onClick={() => handleUndo(latestUndoId)}
                    style={{
                      background: "transparent",
                      border: `1px solid ${C.borderLight}`,
                      color: C.warning,
                      padding: "2px 8px", borderRadius: 3,
                      cursor: "pointer", fontFamily: C.mono, fontSize: 10,
                    }}
                  >
                    Undo last
                  </button>
                </div>
              )}

              <div style={{ flex: 1, overflowY: "auto" }}>
                {visible.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: C.fgMuted, fontSize: 11 }}>
                    {loading ? "Loading…" : (
                      <>
                        No prompts yet.<br/>
                        <span style={{ fontSize: 10 }}>Right-click an element → Add annotation</span>
                      </>
                    )}
                  </div>
                ) : (
                  visible.map(a => (
                    <HistoryRow
                      key={a.id}
                      a={a}
                      onOpen={handleOpenAnnotation}
                      onHide={handleHide}
                      undoAvailable={undoIds.has(a.id)}
                      onUndo={handleUndo}
                      onSimulate={handleSimulate}
                    />
                  ))
                )}
              </div>

              <HistoryFooter
                visibleCount={visible.length}
                hiddenCount={hiddenIds.size}
                onHideAll={async () => {
                  const n = await hideAllAnnotations();
                  setHiddenIds(getHiddenAnnotationIds());
                  showToast(n === 0 ? "No annotations to hide" : `Hidden ${n} annotation${n === 1 ? "" : "s"}`);
                }}
                onUnhideAll={() => {
                  unhideAllAnnotations();
                  setHiddenIds(getHiddenAnnotationIds());
                  showToast("Annotations restored");
                }}
              />
      </PopFade>
    </div>
  );
});

/**
 * Footer row inside the annotation popup. Holds the destructive "Hide all"
 * action (non-destructive — local only) and, when something's hidden, an
 * "Unhide" affordance to restore them. Only renders when there's at least
 * one annotation to act on.
 */
function HistoryFooter({
  visibleCount, hiddenCount, onHideAll, onUnhideAll,
}: {
  visibleCount: number;
  hiddenCount: number;
  onHideAll: () => void;
  onUnhideAll: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (visibleCount === 0 && hiddenCount === 0) return null;

  const handleConfirmHide = async () => {
    setBusy(true);
    try {
      await onHideAll();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`,
      padding: confirming ? "8px 12px" : "6px 8px",
      display: "flex", alignItems: "center", gap: 6,
      background: "rgba(255,255,255,0.015)",
    }}>
      {confirming ? (
        <>
          <span style={{ flex: 1, fontSize: 10, color: C.fgMuted }}>
            Hide all {visibleCount}? Non-destructive — you can unhide.
          </span>
          <button
            onClick={handleConfirmHide}
            disabled={busy}
            style={{
              height: 22, padding: "0 10px", border: "none", borderRadius: 4,
              background: C.danger, color: "#fff",
              fontFamily: C.font, fontSize: 10, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Hiding…" : "Hide all"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            style={{
              height: 22, padding: "0 8px", borderRadius: 4,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.fgDim, fontFamily: C.font, fontSize: 10,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          {hiddenCount > 0 && (
            <button
              onClick={onUnhideAll}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 4,
                border: "none", background: "transparent",
                color: C.fgDim, fontFamily: C.font, fontSize: 10, fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 80ms, color 80ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.fg; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgDim; }}
              title="Restore hidden annotations"
            >
              <Reset size={11} />
              Unhide ({hiddenCount})
            </button>
          )}
          <div style={{ flex: 1 }} />
          {visibleCount > 0 && (
            <button
              onClick={() => setConfirming(true)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 4,
                border: "none", background: "transparent",
                color: C.fgDim, fontFamily: C.font, fontSize: 10, fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 80ms, color 80ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(242,72,34,0.1)"; e.currentTarget.style.color = C.danger; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgDim; }}
              title="Hide every annotation (can be unhidden)"
            >
              <Trash2 size={11} />
              Hide all
            </button>
          )}
        </>
      )}
    </div>
  );
}
