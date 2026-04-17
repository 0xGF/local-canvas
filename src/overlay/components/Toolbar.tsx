import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditorStore } from "../stores/editor-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore, type ChangeEntry } from "../stores/changes-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { BREAKPOINT_PRESETS } from "../../shared/breakpoints.js";
import {
  Pointer, Pencil, Undo, Redo, Save, Reset,
  ChevronDown, ChevronUp, X, Check, Sparkles, Plus,
  Pause, Play,
} from "./icons.js";
import { AskAIHistory } from "./AskAIHistory.js";

import { THEME } from "../theme.js";

const C = THEME;

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
const MOD = isMac ? "\u2318" : "Ctrl+";

const ToolBtn = React.memo(function ToolBtn({
  icon, active, onClick, title, disabled, badge, shortcut, children,
}: {
  icon?: React.ReactNode; active?: boolean; onClick: () => void;
  title: string; disabled?: boolean; badge?: number; shortcut?: string;
  children?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 0,
        minWidth: 32, height: 36, borderRadius: 6,
        border: "none",
        background: active ? C.accent : hovered && !disabled ? C.bgHover : "transparent",
        color: active ? "#fff" : disabled ? C.fgMuted : hovered ? C.fg : C.fgDim,
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.12s ease",
        opacity: disabled ? 0.4 : 1,
        padding: shortcut ? "2px 4px" : "2px 0",
      }}
    >
      {icon}
      {children}
      {shortcut && (
        <span style={{ fontSize: 8, fontWeight: 600, lineHeight: 1, color: active ? "rgba(255,255,255,0.8)" : C.fgDim, marginTop: 1 }}>
          {shortcut}
        </span>
      )}
      {badge !== undefined && badge > 0 && (
        <span style={{
          position: "absolute", top: 0, right: 0,
          minWidth: 14, height: 14, borderRadius: 7,
          background: C.warning, color: "#000",
          fontSize: 9, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 3px", lineHeight: 1,
        }}>{badge > 99 ? "99+" : badge}</span>
      )}
    </button>
  );
});

function Sep() {
  return <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px", flexShrink: 0 }} />;
}

// ── Breakpoint Switcher ─────────────────────────────────────────────────────

const BreakpointSwitcher = React.memo(function BreakpointSwitcher() {
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const setBreakpoint = useEditorStore((s) => s.setBreakpoint);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const current = BREAKPOINT_PRESETS.find(bp => bp.width === breakpoint) ||
    BREAKPOINT_PRESETS[BREAKPOINT_PRESETS.length - 1];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: hovered ? C.bgHover : "transparent",
          border: "none", borderRadius: 6,
          color: C.fg, cursor: "pointer",
          padding: "4px 8px", height: 36,
          fontFamily: C.mono, fontSize: 11, fontWeight: 600,
          transition: "all 0.12s ease",
        }}
      >
        <span>{current.label}</span>
        <span style={{ color: C.fgMuted, fontSize: 10 }}>
          {current.width}px
        </span>
        <ChevronDown size={12} style={{ color: C.fgDim }} />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 2147483646 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
            marginBottom: 8,
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: 4, zIndex: 2147483647,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            minWidth: 160,
          }}>
            {BREAKPOINT_PRESETS.map((bp) => {
              const isActive = bp.width === breakpoint;
              return (
                <button
                  key={bp.label}
                  onClick={() => {
                    setBreakpoint(bp.width);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "6px 10px", border: "none", borderRadius: 4,
                    background: isActive ? C.accent : "transparent",
                    color: isActive ? "#fff" : C.fg,
                    cursor: "pointer", fontFamily: C.mono, fontSize: 11, fontWeight: 500,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = C.bgHover; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <span>{bp.label}</span>
                  <span style={{ color: isActive ? "rgba(255,255,255,0.7)" : C.fgMuted, fontSize: 10 }}>
                    {bp.width}px
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});

// ── Changes / Save popup ───────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const ChangesSaveButton = React.memo(function ChangesSaveButton({
  onSave, onReset, pendingCount, disabled,
}: {
  onSave: () => void; onReset: () => void; pendingCount: number; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const changes = useChangesStore((s) => s.changes);
  const clearChanges = useChangesStore((s) => s.clearChanges);

  const handleSave = useCallback(() => {
    onSave();
    clearChanges();
    setOpen(false);
  }, [onSave, clearChanges]);

  const handleReset = useCallback(() => {
    onReset();
    clearChanges();
    setOpen(false);
  }, [onReset, clearChanges]);

  return (
    <div style={{ position: "relative" }}>
      <ToolBtn
        icon={<Save size={15} />}
        onClick={() => changes.length > 0 ? setOpen(!open) : onSave()}
        title={`Save (${isMac ? "\u2318" : "Ctrl+"}S)`}
        badge={pendingCount}
        disabled={disabled}
      />

      <AnimatePresence>
        {open && changes.length > 0 && (
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
                padding: 0, zIndex: 2147483647,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                width: 320, maxHeight: 400,
                display: "flex", flexDirection: "column",
                fontFamily: C.font,
              }}
            >
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.fg }}>
                  Changes
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700, color: C.accent,
                    background: "rgba(12,140,233,0.15)", padding: "1px 6px", borderRadius: 8,
                  }}>{changes.length}</span>
                </span>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", padding: 2 }}
                >
                  <X size={12} />
                </button>
              </div>

              {/* Changes list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                {changes.map((change) => (
                  <ChangeRow key={change.id} change={change} />
                ))}
              </div>

              {/* Footer */}
              <div style={{
                display: "flex", gap: 6, padding: "8px 12px",
                borderTop: `1px solid ${C.border}`,
              }}>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 1, height: 28, borderRadius: 6, border: "none",
                    background: C.accent, color: "#fff", fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: C.font,
                  }}
                >
                  Save All
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    height: 28, padding: "0 10px", borderRadius: 6,
                    border: `1px solid ${C.border}`, background: "transparent",
                    color: C.fgDim, fontSize: 11, fontWeight: 500,
                    cursor: "pointer", fontFamily: C.font,
                  }}
                >
                  Discard
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

function ChangeRow({ change }: { change: ChangeEntry }) {
  const [expanded, setExpanded] = useState(false);
  const statusIcon = change.status === "applied"
    ? <Check size={10} style={{ color: C.success }} />
    : change.status === "failed"
    ? <X size={10} style={{ color: C.danger }} />
    : <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${C.accent}`, borderTopColor: "transparent", display: "inline-block", animation: "spin 0.8s linear infinite" }} />;

  return (
    <div
      onClick={() => change.diff && setExpanded(!expanded)}
      style={{
        padding: "6px 12px", cursor: change.diff ? "pointer" : "default",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = C.bgHover}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {statusIcon}
        <span style={{ flex: 1, fontSize: 11, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {change.description}
        </span>
        <span style={{ fontSize: 9, color: C.fgMuted, flexShrink: 0 }}>{timeAgo(change.timestamp)}</span>
      </div>
      <div style={{ fontSize: 9, color: C.fgMuted, fontFamily: C.mono, marginTop: 2, marginLeft: 16 }}>
        {change.filePath.split("/").pop()}:{change.line}
      </div>
      {expanded && change.diff && (
        <pre style={{
          marginTop: 6, marginLeft: 16, padding: 6, borderRadius: 4,
          background: "#111", fontSize: 9, fontFamily: C.mono,
          color: C.fgDim, whiteSpace: "pre-wrap", lineHeight: 1.5,
          maxHeight: 120, overflowY: "auto",
        }}>
          {change.diff.split("\n").map((line, i) => (
            <div key={i} style={{
              color: line.startsWith("+") ? C.success : line.startsWith("-") ? C.danger : C.fgDim,
            }}>{line}</div>
          ))}
        </pre>
      )}
    </div>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

export const Toolbar = React.memo(function Toolbar() {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const toolbarVisible = useEditorStore((s) => s.toolbarVisible);
  const pendingCount = useEditorStore((s) => s.pendingCount);
  const clearPending = useEditorStore((s) => s.clearPending);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const vpReset = useViewportStore((s) => s.reset);
  const { undo: rawUndo, redo: rawRedo, send } = useWebSocket();
  const didUndo = useHistoryStore((s) => s.didUndo);
  const didRedo = useHistoryStore((s) => s.didRedo);
  const historyReset = useHistoryStore((s) => s.reset);
  const decrementPending = useEditorStore((s) => s.decrementPending);
  const incrementPending = useEditorStore((s) => s.incrementPending);

  const animationsPaused = useEditorStore((s) => s.animationsPaused);
  const toggleAnimationsPaused = useEditorStore((s) => s.toggleAnimationsPaused);
  const interacting = useEditorStore((s) => s.interacting);
  const selectElement = useEditorStore((s) => s.selectElement);
  const setBreakpoint = useEditorStore((s) => s.setBreakpoint);

  const showToast = useEditorStore((s) => s.showToast);
  const triggerFlash = useEditorStore((s) => s.triggerElementFlash);
  const undo = useCallback(() => {
    if (useEditorStore.getState().pendingCount <= 0) return;
    rawUndo(); didUndo(); decrementPending(); showToast("↩ Undo"); triggerFlash();
  }, [rawUndo, didUndo, decrementPending, showToast, triggerFlash]);
  const redo = useCallback(() => { rawRedo(); didRedo(); incrementPending(); showToast("↪ Redo"); triggerFlash(); }, [rawRedo, didRedo, incrementPending, showToast, triggerFlash]);

  const handleSave = useCallback(() => {
    send({ type: "save" });
    clearPending();
  }, [send, clearPending]);

  const clearChanges = useChangesStore((s) => s.clearChanges);
  const handleReset = useCallback(() => {
    const count = pendingCount;
    for (let i = 0; i < count; i++) { rawUndo(); didUndo(); }
    clearPending();
    historyReset();
    clearChanges();
  }, [pendingCount, rawUndo, didUndo, clearPending, historyReset, clearChanges]);

  const setNavigateMode = useCallback(() => {
    setMode("navigate");
    selectElement(null);
    vpReset();
  }, [setMode, selectElement, vpReset]);

  const setEditMode = useCallback(() => {
    setMode("edit");
  }, [setMode]);

  if (!toolbarVisible) return null;

  const barBase: React.CSSProperties = {
    position: "fixed", bottom: 16,
    display: "flex", alignItems: "center",
    background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: 4,
    pointerEvents: "auto",
    zIndex: 2147483647,
    boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };

  // ── Navigate mode: centered compact bar ──
  if (mode === "navigate") {
    return (
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
        style={{ ...barBase, left: 0, right: 0, margin: "0 auto", width: "fit-content", gap: 2 }}
      >
        <ToolBtn icon={<Pointer size={15} />} active={mode === "navigate"} onClick={setNavigateMode} title="Navigate (N)" shortcut="N" />
        <ToolBtn icon={<Pencil size={15} />} active={false} onClick={setEditMode} title="Edit (V)" shortcut="V" />

        <Sep />

        <ToolBtn icon={<Undo size={15} />} onClick={undo} title={`Undo (${MOD}Z)`} shortcut={`${MOD}Z`} disabled={!canUndo} />
        <ToolBtn icon={<Redo size={15} />} onClick={redo} title={`Redo (${MOD}Y)`} shortcut={`${MOD}Y`} disabled={!canRedo} />

        <Sep />

        <ToolBtn icon={<Save size={15} />} onClick={handleSave} title={`Save (${MOD}S)`} shortcut={`${MOD}S`} badge={pendingCount} disabled={pendingCount === 0} />
        <ToolBtn icon={<Reset size={15} />} onClick={handleReset} title="Reset all" disabled={pendingCount === 0} />

        <Sep />

        <ToolBtn
          icon={animationsPaused ? <Play size={15} /> : <Pause size={15} />}
          active={animationsPaused}
          onClick={toggleAnimationsPaused}
          title={animationsPaused ? "Resume animations (Alt+P)" : "Pause animations (Alt+P)"}
          shortcut="Alt+P"
        />
      </motion.div>
    );
  }

  // ── Edit mode: compact centered bar ──
  return (
    <>
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
      style={{ ...barBase, left: 0, right: 0, margin: "0 auto", width: "fit-content", gap: 2 }}
      data-canvas-overlay="true"
    >
      <ToolBtn icon={<Pointer size={15} />} active={false} onClick={setNavigateMode} title="Navigate (N)" shortcut="N" />
      <ToolBtn icon={<Pencil size={15} />} active={true} onClick={setEditMode} title="Edit (V)" shortcut="V" />

      <Sep />

      <BreakpointSwitcher />

      <Sep />

      <ToolBtn icon={<Undo size={15} />} onClick={undo} title={`Undo (${MOD}Z)`} shortcut={`${MOD}Z`} disabled={!canUndo} />
      <ToolBtn icon={<Redo size={15} />} onClick={redo} title={`Redo (${MOD}Y)`} shortcut={`${MOD}Y`} disabled={!canRedo} />

      <Sep />

      <ChangesSaveButton onSave={handleSave} onReset={handleReset} pendingCount={pendingCount} disabled={pendingCount === 0} />
      <ToolBtn icon={<Reset size={15} />} onClick={handleReset} title="Reset all" disabled={pendingCount === 0} />

      <Sep />

      <AnnotateToolBtn />

      <AskAIHistory
        renderButton={(open, count) => (
          <ToolBtn
            icon={<Sparkles size={15} />}
            onClick={open}
            title="Ask AI history"
            badge={count}
          />
        )}
      />

      <Sep />

      <ToolBtn
        icon={animationsPaused ? <Play size={15} /> : <Pause size={15} />}
        active={animationsPaused}
        onClick={toggleAnimationsPaused}
        title={animationsPaused ? "Resume animations (Alt+P)" : "Pause animations (Alt+P)"}
        shortcut="Alt+P"
      />

    </motion.div>

    {interacting && (
      <div style={{
        position: "fixed", bottom: 72, left: 0, right: 0,
        display: "flex", justifyContent: "center",
        pointerEvents: "none", zIndex: 2147483647,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, color: "#fff",
          background: C.accent,
          padding: "5px 14px", borderRadius: 20,
          fontFamily: C.mono, whiteSpace: "nowrap",
          boxShadow: "0 2px 12px rgba(12,140,233,0.4)",
          letterSpacing: "0.02em",
        }}>
          Interact Mode
        </span>
      </div>
    )}
    </>
  );
});

/**
 * Toggle for the annotate tool: next plain click in Edit mode opens Ask AI
 * on that element instead of selecting it. Ctrl/Cmd-click and right-click
 * keep their usual behaviour.
 */
const AnnotateToolBtn = React.memo(function AnnotateToolBtn() {
  const annotateMode = useEditorStore((s) => s.annotateMode);
  const setAnnotateMode = useEditorStore((s) => s.setAnnotateMode);
  const showToast = useEditorStore((s) => s.showToast);
  const toggle = useCallback(() => {
    const next = !annotateMode;
    setAnnotateMode(next);
    if (next) showToast("Annotate: click any element · Esc to cancel");
  }, [annotateMode, setAnnotateMode, showToast]);
  return (
    <ToolBtn
      icon={
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={15} />
          <span style={{
            position: "absolute", right: -4, bottom: -4,
            width: 9, height: 9, borderRadius: "50%",
            background: "currentColor",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Plus size={7} style={{ color: "#000", strokeWidth: 3 }} />
          </span>
        </span>
      }
      active={annotateMode}
      onClick={toggle}
      title={annotateMode ? "Annotate: click any element (A)" : "Annotate tool (A)"}
      shortcut="A"
    />
  );
});
