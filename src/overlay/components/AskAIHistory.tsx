import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "./icons.js";
import { THEME } from "../theme.js";
import {
  listAnnotations,
  currentSessionId,
  hideAnnotation,
  getHiddenAnnotationIds,
  scrollToAndOpenAnnotation,
  type Annotation,
} from "../utils/agentation.js";

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
}

const HistoryRow = React.memo(function HistoryRow({ a, onOpen, onHide }: HistoryRowProps) {
  const [hovered, setHovered] = useState(false);
  const fileTail = a.elementPath?.split("/").pop() || a.elementPath;
  const tag = a.element?.match(/^<(\w+)>/)?.[1] || "?";
  // Last agent reply, if any (agentation server stores them in `thread`)
  const thread = (a as any).thread as Array<{ role: string; content: string }> | undefined;
  const lastReply = thread?.filter(t => t.role === "agent").slice(-1)[0]?.content;
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!currentSessionId()) { setAnnotations([]); return; }
    setLoading(true);
    try {
      const list = await listAnnotations();
      // Newest first
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setAnnotations(list);
    } catch {
      // Server unreachable — leave previous state
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Keyboard chord (`g h`) dispatches this event to toggle the popover.
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

  return (
    <div style={{ position: "relative" }}>
      {renderButton(() => setOpen(o => !o), pendingCount)}

      <AnimatePresence>
        {open && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 2147483646 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.12 }}
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
                  Ask AI history
                  {visible.length > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: C.accent,
                      background: "rgba(12,140,233,0.15)", padding: "1px 6px", borderRadius: 8,
                    }}>{visible.length}</span>
                  )}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", padding: 2 }}
                >
                  <X size={12} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                {visible.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: C.fgMuted, fontSize: 11 }}>
                    {loading ? "Loading…" : (
                      <>
                        No prompts yet.<br/>
                        <span style={{ fontSize: 10 }}>Right-click an element → Ask AI</span>
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
                    />
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});
