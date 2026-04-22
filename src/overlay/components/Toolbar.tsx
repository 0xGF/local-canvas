import React, { Suspense, lazy, useState, useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useHistoryStore } from "../stores/history-store.js";
import { useChangesStore, type ChangeEntry } from "../stores/changes-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { BREAKPOINT_PRESETS } from "../../shared/breakpoints.js";
import {
  Pointer, Pencil, Undo, Redo, Save,
  X, Check,
  MessageSquarePlus,
  MessagesSquare,
  Layers,
} from "./icons.js";
// Loaded on demand so the AI history + annotations client stay out of the
// critical-path bundle.
const AskAIHistory = lazy(() =>
  import("./AskAIHistory.js").then(m => ({ default: m.AskAIHistory }))
);
import { SettingsPopover } from "./SettingsPopover.js";

import { THEME } from "../theme.js";
import { PopFade, useSlideUp } from "../utils/motion-presets.js";
import { EASE, DURATION } from "../utils/easings.js";

const C = THEME;

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
const MOD = isMac ? "\u2318" : "Ctrl+";

/**
 * Wraps an edit-mode-only control so it stays mounted and in-flow at all
 * times (preserving the toolbar's width) but visually fades + disables
 * pointer events when not in edit mode. Cross-fades only — no width or
 * layout animation, so neighbouring buttons don't shift around.
 */
function EditOnly({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        opacity: active ? 1 : 0.35,
        filter: active ? "none" : "saturate(0)",
        pointerEvents: active ? "auto" : "none",
        transition: `opacity 200ms ${EASE.smooth}, filter 200ms ${EASE.smooth}`,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

// ── Custom hover tooltip ────────────────────────────────────────────────────
// Native `title` attributes are slow to appear, unstyled, and get clipped by
// the OS. We roll our own so the toolbar gets Figma/Linear-style labels that
// match the toolbar's dark-glass chrome and render the shortcut as kbd pills.

// Tips appear instantly — no delay. The toolbar is always-visible chrome where
// the labels are the primary affordance for discoverability, so waiting 350ms
// for them felt sluggish.
const TIP_DELAY_MS = 0;
// Shared open-state so a second hovered button shows its tip immediately
// instead of waiting out the delay again — matches how macOS/Figma tooltips
// "pass the torch" between adjacent icons.
let tipOpenCount = 0;
const tipListeners = new Set<(open: boolean) => void>();
function useTipFastMode() {
  const [fast, setFast] = useState(tipOpenCount > 0);
  useEffect(() => {
    const fn = (open: boolean) => setFast(open);
    tipListeners.add(fn);
    return () => { tipListeners.delete(fn); };
  }, []);
  return fast;
}
function bumpTip(open: boolean) {
  tipOpenCount = Math.max(0, tipOpenCount + (open ? 1 : -1));
  const any = tipOpenCount > 0;
  for (const fn of tipListeners) fn(any);
}

function Kbd({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 16, height: 16, padding: "0 4px",
        borderRadius: 3, marginLeft: 2,
        background: "rgba(255,255,255,0.08)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.75)",
        fontFamily: C.mono, fontSize: 9.5, fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: 1,
      }}
    >
      {text}
    </span>
  );
}

function splitShortcut(shortcut: string): string[] {
  // "⌘Z", "Ctrl+Z", "G H" → ["⌘","Z"], ["Ctrl","Z"], ["G","H"]
  if (shortcut.includes("+")) return shortcut.replace(/\+$/, "").split("+").filter(Boolean);
  if (shortcut.includes(" ")) return shortcut.split(/\s+/).filter(Boolean);
  if (shortcut.startsWith("⌘") && shortcut.length > 1) return ["⌘", shortcut.slice(1)];
  return [shortcut];
}

function Tip({
  label, shortcut, disabled, children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  children: React.ReactElement<{
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fast = useTipFastMode();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = useCallback(() => {
    if (disabled) return;
    clearTimer();
    const delay = fast ? 0 : TIP_DELAY_MS;
    timerRef.current = setTimeout(() => {
      setOpen(true);
      bumpTip(true);
    }, delay);
  }, [disabled, fast]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen((was) => {
      if (was) bumpTip(false);
      return false;
    });
  }, []);

  useEffect(() => () => {
    clearTimer();
    if (open) bumpTip(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrapped = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => { children.props.onMouseEnter?.(e); show(); },
    onMouseLeave: (e: React.MouseEvent) => { children.props.onMouseLeave?.(e); hide(); },
    onFocus: (e: React.FocusEvent) => { children.props.onFocus?.(e); show(); },
    onBlur: (e: React.FocusEvent) => { children.props.onBlur?.(e); hide(); },
  });

  const keys = shortcut ? splitShortcut(shortcut) : [];

  return (
    <span
      style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
      onMouseLeave={hide}
    >
      {wrapped}
      <PopFade
        open={open && !disabled}
        duration={140}
        bouncy={false}
        style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          transformOrigin: "center bottom",
          pointerEvents: "none",
          zIndex: 2147483647,
          background: "#141414",
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.05) inset," +
            "0 6px 20px rgba(0,0,0,0.45)," +
            "0 2px 6px rgba(0,0,0,0.35)",
          padding: "5px 8px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
          fontFamily: C.font,
          fontSize: 11,
          fontWeight: 500,
          color: "#f0f0f0",
          letterSpacing: "0.01em",
          lineHeight: 1.2,
        }}
      >
        <span>{label}</span>
        {keys.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            {keys.map((k, i) => <Kbd key={i} text={k} />)}
          </span>
        )}
      </PopFade>
    </span>
  );
}

const ToolBtn = React.memo(function ToolBtn({
  icon, active, onClick, title, disabled, badge, shortcut, children,
}: {
  icon?: React.ReactNode; active?: boolean; onClick: () => void;
  /** Label shown in the custom tooltip. */
  title: string; disabled?: boolean; badge?: number;
  /** Shortcut rendered as kbd pills next to the label. */
  shortcut?: string;
  children?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Tip label={title} shortcut={shortcut} disabled={disabled}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: 6,
          border: "none",
          background: active ? C.accent : hovered && !disabled ? C.bgHover : "transparent",
          color: active ? "#fff" : disabled ? C.fgMuted : hovered ? C.fg : C.fgDim,
          cursor: disabled ? "default" : "pointer",
          transition: `background-color ${DURATION.micro}ms ${EASE.snappy}, color ${DURATION.micro}ms ${EASE.snappy}, opacity ${DURATION.micro}ms ${EASE.snappy}`,
          opacity: disabled ? 0.4 : 1,
          padding: 0,
          flexShrink: 0,
          willChange: "background-color",
        }}
      >
        {icon}
        {children}
        {badge !== undefined && badge > 0 && (
          <span style={{
            position: "absolute", top: 1, right: 1,
            minWidth: 14, height: 14, borderRadius: 7,
            background: C.warning, color: "#000",
            fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", lineHeight: 1,
          }}>{badge > 99 ? "99+" : badge}</span>
        )}
      </button>
    </Tip>
  );
});

function Sep() {
  return <div style={{ width: 1, height: 18, background: C.border, margin: "0 4px", flexShrink: 0 }} />;
}

// Segmented pill: Navigate / Edit — one control, clear active state, no
// layout shift.
const ModeSegment = React.memo(function ModeSegment({
  isEdit,
  onNavigate,
  onEdit,
}: {
  isEdit: boolean;
  onNavigate: () => void;
  onEdit: () => void;
}) {
  const activeIdx = isEdit ? 1 : 0;

  return (
    <div
      role="tablist"
      style={{
        position: "relative",
        display: "flex", alignItems: "center",
        height: 32, padding: 2, borderRadius: 7,
        background: "rgba(255,255,255,0.04)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      {/* Sliding active pill — GPU-animated via transform. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 2, bottom: 2, left: 2,
          width: "calc(50% - 2px)",
          borderRadius: 5,
          background: C.accent,
          boxShadow: "0 1px 2px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset",
          transform: `translateX(${activeIdx * 100}%)`,
          transition: `transform 180ms ${EASE.smooth}`,
          willChange: "transform",
          pointerEvents: "none",
        }}
      />
      <SegmentBtn active={activeIdx === 0} onClick={onNavigate} title="Navigate" shortcut="N">
        <Pointer size={15} />
      </SegmentBtn>
      <SegmentBtn active={activeIdx === 1} onClick={onEdit} title="Edit" shortcut="C">
        <Pencil size={15} />
      </SegmentBtn>
    </div>
  );
});

function SegmentBtn({
  active, onClick, title, shortcut, children,
}: {
  active: boolean; onClick: () => void; title: string; shortcut?: string; children: React.ReactNode;
}) {
  return (
    <Tip label={title} shortcut={shortcut}>
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      aria-label={title}
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 28, borderRadius: 5,
        border: "none", background: "transparent",
        color: active ? "#fff" : C.fgDim,
        cursor: "pointer",
        padding: 0,
        transition: `color 120ms ${EASE.snappy}`,
      }}
    >
      {children}
    </button>
    </Tip>
  );
}

/**
 * Segmented button used inside non-sliding pill containers (workspace cluster).
 * Same size/shape as SegmentBtn so workspace and mode pills line up, but has
 * its own hover/active background since there's no sliding indicator.
 */
function PillBtn({
  active, onClick, title, shortcut, icon,
}: {
  active: boolean; onClick: () => void; title: string; shortcut?: string; icon: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tip label={title} shortcut={shortcut}>
    <button
      onClick={onClick}
      aria-label={title}
      aria-pressed={active}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 28, borderRadius: 5,
        border: "none",
        background: active ? C.accent : hovered ? "rgba(255,255,255,0.06)" : "transparent",
        color: active ? "#fff" : hovered ? C.fg : C.fgDim,
        cursor: "pointer",
        padding: 0,
        transition: `background-color 120ms ${EASE.snappy}, color 120ms ${EASE.snappy}`,
      }}
    >
      {icon}
    </button>
    </Tip>
  );
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
      {/* Breakpoint chip — wrapped in the same inset pill the Workspace cluster
          uses so the label reads as a distinct, intentional element rather
          than loose text alongside the icon buttons. */}
      <div
        style={{
          display: "flex", alignItems: "center",
          height: 32, padding: 2, borderRadius: 7,
          background: "rgba(255,255,255,0.04)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          flexShrink: 0,
        }}
      >
        <Tip label={`Breakpoint: ${current.label} · ${current.width}px`}>
        <button
          onClick={() => setOpen(!open)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label={`Breakpoint ${current.label}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: open ? C.bgHover : hovered ? "rgba(255,255,255,0.06)" : "transparent",
            border: "none", borderRadius: 5,
            color: open || hovered ? C.fg : C.fgDim, cursor: "pointer",
            padding: "0 10px", minWidth: 36, height: 28, flexShrink: 0,
            fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
            transition: `background-color ${DURATION.micro}ms ${EASE.snappy}, color ${DURATION.micro}ms ${EASE.snappy}`,
          }}
        >
          {current.label}
        </button>
        </Tip>
      </div>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2147483646 }}
          onClick={() => setOpen(false)}
        />
      )}
      <PopFade
        open={open}
        style={{
          position: "absolute", bottom: "100%", left: "50%",
          marginBottom: 8,
          // Solid chrome — popups stay fully opaque so content behind doesn't
          // bleed through.
          background: C.bg,
          border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 4, zIndex: 2147483647,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.04) inset," +
            "0 10px 32px rgba(0,0,0,0.45)," +
            "0 2px 8px rgba(0,0,0,0.3)",
          minWidth: 180,
          transform: "translateX(-50%)",
        }}
      >
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
      </PopFade>
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
        title="Save"
        shortcut={`${MOD}S`}
        badge={changes.length}
        disabled={disabled}
      />

      {open && changes.length > 0 && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2147483646 }}
          onClick={() => setOpen(false)}
        />
      )}
      <PopFade
        open={open && changes.length > 0}
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
      </PopFade>
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

  const interacting = useEditorStore((s) => s.interacting);
  const selectElement = useEditorStore((s) => s.selectElement);
  const layersOpen = useEditorStore((s) => s.layersOpen);
  const toggleLayers = useEditorStore((s) => s.toggleLayers);

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
    // Solid so the bar (and popups anchored to it) stay fully opaque.
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 10, padding: 4,
    pointerEvents: "auto",
    zIndex: 2147483647,
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.04) inset," +
      "0 10px 32px rgba(0,0,0,0.45)," +
      "0 2px 8px rgba(0,0,0,0.3)",
  };

  const isEdit = mode === "edit";

  const slideUp = useSlideUp();
  return (
    <>
    <div
      style={{ ...barBase, ...slideUp, left: 0, right: 0, margin: "0 auto", width: "fit-content", gap: 2 }}
      data-canvas-overlay="true"
    >
      {/*
       * Functional grouping:
       *   [Mode | Layers] | [Undo Redo Save] | [Breakpoint Annotate History] | [Settings]
       *
       * The bar renders its full set of controls at all times. Edit-only
       * controls (layers / breakpoint / annotate / history) are dimmed and
       * disabled in Navigate mode rather than mounted/unmounted with a width
       * animation. Avoiding the conditional render means the bar's width
       * never changes — no per-frame layout shifts, no judder, no popovers
       * being clipped mid-transition. Only opacity + colour cross-fade,
       * which is cheap and looks planted.
       */}

      {/* ── Mode segment (Navigate / Edit) ── */}
      <ModeSegment
        isEdit={isEdit}
        onNavigate={setNavigateMode}
        onEdit={setEditMode}
      />

      {/* ── Workspace pill: Layers (edit-only behaviour, always rendered) ── */}
      <EditOnly active={isEdit}>
        <div
          style={{
            display: "flex", alignItems: "center",
            height: 32, padding: 2, borderRadius: 7,
            background: "rgba(255,255,255,0.04)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
            flexShrink: 0,
          }}
        >
          <PillBtn
            active={layersOpen}
            onClick={toggleLayers}
            title="Layers panel"
            shortcut="L"
            icon={<Layers size={14} />}
          />
        </div>
      </EditOnly>

      <Sep />

      {/* ── History actions ── */}
      <ToolBtn icon={<Undo size={15} />} onClick={undo} title="Undo" shortcut={`${MOD}Z`} disabled={!canUndo} />
      <ToolBtn icon={<Redo size={15} />} onClick={redo} title="Redo" shortcut={`${MOD}Y`} disabled={!canRedo} />
      <ChangesSaveButton onSave={handleSave} onReset={handleReset} pendingCount={pendingCount} disabled={pendingCount === 0} />

      <Sep />

      {/* ── Viewport + Annotation (edit-only behaviour, always rendered) ── */}
      <EditOnly active={isEdit}>
        <BreakpointSwitcher />
      </EditOnly>
      <EditOnly active={isEdit}>
        <AnnotateToolBtn />
      </EditOnly>
      <EditOnly active={isEdit}>
        <Suspense fallback={null}>
          <AskAIHistory
            renderButton={(open, count) => (
              <ToolBtn
                icon={<MessagesSquare size={15} />}
                onClick={open}
                title="Annotation history"
                shortcut="H"
                badge={count}
              />
            )}
          />
        </Suspense>
      </EditOnly>

      <Sep />

      {/* ── Config ── */}
      <SettingsPopover onResetAll={handleReset} canResetAll={pendingCount > 0} />
    </div>

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
    if (next) showToast("Add annotation: click any element · Esc to cancel");
  }, [annotateMode, setAnnotateMode, showToast]);
  return (
    <ToolBtn
      icon={<MessageSquarePlus size={15} />}
      active={annotateMode}
      onClick={toggle}
      title={annotateMode ? "Annotate: click any element" : "Annotate tool"}
      shortcut="A"
    />
  );
});
