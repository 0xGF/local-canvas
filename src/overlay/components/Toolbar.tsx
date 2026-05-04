import React, { Suspense, lazy, useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { usePortalContainer } from "../lib/portal-container.js";
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
  Trash2,
} from "./icons.js";
// Loaded on demand so the AI history + annotations client stay out of the
// critical-path bundle.
const AskAIHistory = lazy(() =>
  import("./AskAIHistory.js").then(m => ({ default: m.AskAIHistory }))
);
import { SettingsPopover } from "./SettingsPopover.js";

import { THEME } from "../theme.js";
import { PopFade, PopSlideUp, useSlideUp, useToolbarBarRect } from "../utils/motion-presets.js";
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
  const [pressed, setPressed] = useState(false);

  return (
    <Tip label={title} shortcut={shortcut} disabled={disabled}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => { if (!disabled) setPressed(true); }}
        onMouseUp={() => setPressed(false)}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: 6,
          border: "none",
          background: active ? C.accent : hovered && !disabled ? C.bgHover : "transparent",
          color: active ? "#fff" : disabled ? C.fgMuted : hovered ? C.fg : C.fgDim,
          cursor: disabled ? "default" : "pointer",
          transition: `background-color ${DURATION.micro}ms ${EASE.snappy}, color ${DURATION.micro}ms ${EASE.snappy}, opacity ${DURATION.micro}ms ${EASE.snappy}, transform 120ms ${EASE.bounce}`,
          opacity: disabled ? 0.4 : 1,
          transform: pressed ? "scale(0.88)" : "scale(1)",
          padding: 0,
          flexShrink: 0,
          willChange: "background-color, transform",
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
  const [pressed, setPressed] = useState(false);
  return (
    <Tip label={title} shortcut={shortcut}>
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      aria-label={title}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 5,
        border: "none", background: "transparent",
        color: active ? "#fff" : C.fgDim,
        cursor: "pointer",
        padding: 0,
        transform: pressed ? "scale(0.9)" : "scale(1)",
        transition: `color 120ms ${EASE.snappy}, transform 120ms ${EASE.bounce}`,
        willChange: "transform",
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
  const [pressed, setPressed] = useState(false);
  return (
    <Tip label={title} shortcut={shortcut}>
    <button
      onClick={onClick}
      aria-label={title}
      aria-pressed={active}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 5,
        border: "none",
        background: active ? C.accent : hovered ? "rgba(255,255,255,0.06)" : "transparent",
        color: active ? "#fff" : hovered ? C.fg : C.fgDim,
        cursor: "pointer",
        padding: 0,
        transform: pressed ? "scale(0.9)" : "scale(1)",
        transition: `background-color 120ms ${EASE.snappy}, color 120ms ${EASE.snappy}, transform 120ms ${EASE.bounce}`,
        willChange: "transform",
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
  // Shared toolbar-popup slot — opening this closes any other bottom-bar
  // popup. See SettingsPopover for the same pattern.
  const toolbarPopup = useEditorStore((s) => s.toolbarPopup);
  const setToolbarPopup = useEditorStore((s) => s.setToolbarPopup);
  const open = toolbarPopup === "breakpoint";
  const setOpen = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(open) : v;
      setToolbarPopup(next ? "breakpoint" : null);
    },
    [open, setToolbarPopup],
  );
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
            padding: 0, width: 44, height: 28, flexShrink: 0,
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
      <PopSlideUp
        open={open}
        duration={280}
        distance={16}
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
      </PopSlideUp>
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
  // Shared toolbar-popup slot — opening this closes any other bottom-bar
  // popup. See SettingsPopover for the same pattern.
  const toolbarPopup = useEditorStore((s) => s.toolbarPopup);
  const setToolbarPopup = useEditorStore((s) => s.setToolbarPopup);
  const open = toolbarPopup === "changes";
  const setOpen = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(open) : v;
      setToolbarPopup(next ? "changes" : null);
    },
    [open, setToolbarPopup],
  );
  const changes = useChangesStore((s) => s.changes);
  const clearChanges = useChangesStore((s) => s.clearChanges);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const showToast = useEditorStore((s) => s.showToast);
  const bpMeta = BREAKPOINT_PRESETS.find(b => b.width === breakpoint);
  const portalContainer = usePortalContainer();
  const bpPrefix = bpMeta?.prefix ?? "";
  const bpLabel = bpMeta?.label ?? `${breakpoint}px`;
  const isBase = !bpPrefix;

  // Mirror the bottom toolbar's horizontal span so the popover reads as an
  // extension of the bar. Measured synchronously in useLayoutEffect so the
  // first paint already has the right left/width — avoids the horizontal
  // jitter you'd get if the popover flashed at "50% / 420px" then snapped
  // to bar coords one frame later.
  const barRect = useToolbarBarRect(open);

  const close = useCallback(() => setOpen(false), []);

  const handleSaveScoped = useCallback(() => {
    // Save as-is — mutations were already emitted with the current
    // breakpoint prefix as the user edited. This commits what's in source.
    onSave();
    clearChanges();
    close();
    showToast(isBase ? "Saved" : `Saved for ${bpLabel} and up`);
  }, [onSave, clearChanges, close, isBase, bpLabel, showToast]);

  const handleSaveAll = useCallback(() => {
    // TODO: sweep pending mutations and strip the bp prefix from each
    // class so the change becomes a base-breakpoint rule. For now save
    // as-is and flag the gap in the toast so the UX pattern is in place.
    onSave();
    clearChanges();
    close();
    showToast(`Saved (all-screens rewrite for ${bpPrefix}: not yet wired — saved as ${bpLabel}+ for now)`);
  }, [onSave, clearChanges, close, bpPrefix, bpLabel, showToast]);

  const handleReset = useCallback(() => {
    onReset();
    clearChanges();
    close();
  }, [onReset, clearChanges, close]);

  // Cmd/Ctrl+S always routes through the confirmation popover — never
  // saves directly. Only short-circuits to a toast when there's literally
  // nothing pending.
  useEffect(() => {
    function onToggle() {
      if (changes.length === 0 && pendingCount === 0) {
        showToast("Nothing to save");
        return;
      }
      setOpen(o => !o);
    }
    window.addEventListener("canvas:toggle-save-panel", onToggle);
    return () => window.removeEventListener("canvas:toggle-save-panel", onToggle);
  }, [changes.length, pendingCount, showToast]);

  // While the popover is open: Enter = primary (scoped), Shift+Enter = all
  // screens, Esc = close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey && !isBase) handleSaveAll();
        else handleSaveScoped();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, isBase, handleSaveScoped, handleSaveAll, close]);

  const hasAnyPending = changes.length > 0 || pendingCount > 0;

  return (
    <div style={{ position: "relative" }}>
      <ToolBtn
        icon={<Save size={15} />}
        onClick={() => {
          // Always route through the confirmation popover — never save
          // directly. Short-circuit only when there's literally nothing
          // pending (matches the Cmd+S behaviour below).
          if (!hasAnyPending) return;
          if (open) close(); else setOpen(true);
        }}
        title="Save"
        shortcut={`${MOD}S`}
        badge={changes.length}
        disabled={disabled}
      />

      {barRect && portalContainer && ReactDOM.createPortal(
        <>
        {open && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 2147483646 }}
            onClick={close}
          />
        )}
        <PopSlideUp
          open={open}
          // Match Settings/Breakpoint exactly so all four toolbar popups
          // share one motion — otherwise Save felt like a different system
          // (bigger lift, slower).
          duration={280}
          distance={16}
          data-canvas-overlay="true"
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed",
            // Match the toolbar horizontally so the popover reads as an
            // extension of the bar. Portaled to escape the toolbar's
            // `transform: translateY(...)` which would otherwise anchor
            // `position: fixed` against the toolbar instead of the viewport.
            left: barRect.left,
            width: barRect.width,
            bottom: window.innerHeight - barRect.top + 8,
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 0,
            zIndex: 2147483647,
            boxShadow: "0 10px 32px rgba(0,0,0,0.5)",
            maxHeight: 440,
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
            onClick={close}
            style={{
              background: "transparent", border: "none",
              color: C.fgMuted, cursor: "pointer",
              padding: 4, borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 120ms ease, color 120ms ease",
              outline: "none",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = C.bgHover;
              e.currentTarget.style.color = C.fg;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = C.fgMuted;
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Changes list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {changes.length === 0 ? (
            <div style={{
              padding: "18px 14px",
              fontSize: 11, color: C.fgMuted, textAlign: "center", lineHeight: 1.5,
            }}>
              {pendingCount} unsaved change{pendingCount === 1 ? "" : "s"}
            </div>
          ) : (
            changes.map((change) => (
              <ChangeRow key={change.id} change={change} />
            ))
          )}
        </div>

        {/* Footer — all three actions on one row so the panel reads as
            a single control surface. Primary = "this breakpoint + up";
            secondary (only when editing a prefixed breakpoint) = "all
            screens". Discard sits to the right with a danger-tinted
            border so it's visible at rest without dominating. */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 6, padding: "8px 12px",
          borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={handleSaveScoped}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                flex: 1, minWidth: 0,
                height: 32, padding: "0 10px", borderRadius: 6, border: "none",
                background: C.accent, color: "#fff",
                fontSize: 11, fontWeight: 600, textAlign: "left",
                cursor: "pointer", fontFamily: C.font,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.25)",
                transition: "background 120ms ease, box-shadow 120ms ease",
                outline: "none",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = C.accentHover;
                e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 6px rgba(0,0,0,0.35)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = C.accent;
                e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.25)";
              }}
            >
              <span style={{
                flex: 1, minWidth: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {isBase ? "Save for all screens" : `Save for ${bpLabel} and up`}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                height: 20, minWidth: 22, padding: "0 6px",
                fontSize: 11, fontFamily: C.mono, fontWeight: 600,
                background: "rgba(255,255,255,0.2)", color: "#fff",
                borderRadius: 4, flexShrink: 0,
              }}>⏎</span>
            </button>

            {!isBase && (
              <button
                onClick={handleSaveAll}
                title="Save without the breakpoint prefix — applies at every screen size."
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  height: 32, padding: "0 10px", borderRadius: 6,
                  border: `1px solid ${C.borderLight}`, background: C.bgAlt,
                  color: C.fg, fontSize: 11, fontWeight: 500, textAlign: "left",
                  cursor: "pointer", fontFamily: C.font, flexShrink: 0,
                  transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
                  outline: "none",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = C.bgHover;
                  e.currentTarget.style.borderColor = C.border;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = C.bgAlt;
                  e.currentTarget.style.borderColor = C.borderLight;
                }}
              >
                <span>All sizes</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  height: 20, minWidth: 32, padding: "0 6px",
                  fontSize: 11, fontFamily: C.mono, fontWeight: 600,
                  background: C.bg, color: C.fgDim,
                  borderRadius: 4, flexShrink: 0,
                }}>⇧⏎</span>
              </button>
            )}

            <button
              onClick={handleReset}
              title="Drop every pending change"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 32, padding: "0 12px", borderRadius: 6,
                border: `1px solid ${C.dangerSoft}`,
                background: "transparent",
                color: C.danger,
                fontSize: 11, fontWeight: 500, fontFamily: C.font,
                cursor: "pointer", flexShrink: 0,
                transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
                outline: "none",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = C.dangerSoft;
                e.currentTarget.style.borderColor = C.danger;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = C.dangerSoft;
              }}
            >
              Discard
            </button>
          </div>

          {!isBase && (
            <span style={{ fontSize: 9, color: C.fgMuted, lineHeight: 1.4 }}>
              {bpPrefix}: applies at {bpLabel} ({breakpoint}px) and wider. Smaller
              screens inherit the next lower breakpoint.
            </span>
          )}
        </div>
      </PopSlideUp>
      </>,
      portalContainer,
      )}
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

  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={() => change.diff && setExpanded(!expanded)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 12px",
        cursor: change.diff ? "pointer" : "default",
        // Subtle accent-tinted surface on hover (matches the rest of the
        // popover) instead of the plain grey wash. Rounded so the active
        // row reads as its own tile inside the scroll list.
        background: hovered ? C.bgHover : "transparent",
        borderRadius: 6,
        margin: "2px 4px",
        transition: "background 140ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {statusIcon}
        <span style={{ flex: 1, fontSize: 11, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {change.description}
        </span>
        <span style={{
          fontSize: 9, color: C.fgMuted, flexShrink: 0,
          transition: "opacity 140ms ease",
          opacity: hovered ? 0.9 : 0.65,
        }}>{timeAgo(change.timestamp)}</span>
      </div>
      <div style={{ fontSize: 9, color: C.fgMuted, fontFamily: C.mono, marginTop: 2, marginLeft: 18 }}>
        {change.filePath.split("/").pop()}:{change.line}
      </div>
      {expanded && change.diff && (
        <pre style={{
          marginTop: 8, marginLeft: 18, padding: "8px 10px", borderRadius: 6,
          background: C.bg, border: `1px solid ${C.borderLight}`,
          fontSize: 10, fontFamily: C.mono,
          color: C.fgDim, whiteSpace: "pre-wrap", lineHeight: 1.55,
          maxHeight: 160, overflowY: "auto",
        }}>
          {change.diff.split("\n").map((line, i) => (
            <div key={i} style={{
              color: line.startsWith("+") ? C.success : line.startsWith("-") ? C.danger : C.fgDim,
              background: line.startsWith("+") ? C.successSoft : line.startsWith("-") ? C.dangerSoft : "transparent",
              padding: "0 4px", borderRadius: 2,
              margin: "0 -4px",
            }}>{line}</div>
          ))}
        </pre>
      )}
    </div>
  );
}

// ── Discard Changes ────────────────────────────────────────────────────────
// A dedicated trash button next to Save so discarding doesn't require
// opening the Settings popover. First click arms a tiny confirm popover
// anchored to the button; confirm fires `onDiscard` (which tears down
// every pending mutation via the same flow as Settings → Reset all).
const DiscardChangesButton = React.memo(function DiscardChangesButton({
  onDiscard, pendingCount, disabled,
}: {
  onDiscard: () => void;
  pendingCount: number;
  disabled: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  // Auto-close the confirm popover if the pending count drops to zero
  // (e.g. user undoes everything manually) — otherwise a stale prompt
  // lingers promising to discard zero changes.
  useEffect(() => {
    if (confirming && pendingCount === 0) setConfirming(false);
  }, [confirming, pendingCount]);

  return (
    <div style={{ position: "relative" }}>
      <ToolBtn
        icon={<Trash2 size={14} />}
        onClick={() => {
          if (disabled) return;
          setConfirming(c => !c);
        }}
        title="Discard changes"
        shortcut={`${MOD}\u232B`}
        disabled={disabled}
      />

      {confirming && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2147483646 }}
          onClick={() => setConfirming(false)}
        />
      )}
      <PopSlideUp
        open={confirming}
        duration={200}
        distance={12}
        data-canvas-overlay="true"
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", bottom: "100%", left: "50%",
          transform: "translateX(-50%)",
          marginBottom: 8,
          minWidth: 220,
          background: C.bg,
          border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 10,
          zIndex: 2147483647,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.04) inset," +
            "0 10px 32px rgba(0,0,0,0.45)," +
            "0 2px 8px rgba(0,0,0,0.3)",
          fontFamily: C.font,
        }}
      >
        <div style={{ fontSize: 11, color: C.fg, lineHeight: 1.4, marginBottom: 8 }}>
          Discard {pendingCount} pending change{pendingCount === 1 ? "" : "s"}?
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button
            onClick={() => setConfirming(false)}
            style={{
              height: 24, padding: "0 10px", borderRadius: 4,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.fgDim, fontFamily: C.font, fontSize: 11,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { setConfirming(false); onDiscard(); }}
            style={{
              height: 24, padding: "0 10px", border: "none", borderRadius: 4,
              background: C.danger, color: "#fff",
              fontFamily: C.font, fontSize: 11, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Discard
          </button>
        </div>
      </PopSlideUp>
    </div>
  );
});

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
    // Gate on the history store (which tracks the server's undoStack depth),
    // not on `pendingCount`. After a save, `clearPending()` zeroes the badge
    // counter but the undoStack on the writer still holds the pre-save
    // snapshots — so the button stays enabled and Undo MUST still go through,
    // otherwise "save then undo" silently does nothing. `decrementPending`
    // works fine when pendingCount is already 0 (version drops below
    // savedVersion, abs() bumps the count back up).
    if (!useHistoryStore.getState().canUndo) return;
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

  // useSlideUp must run BEFORE any early returns — otherwise the hook count
  // changes when `toolbarVisible` flips (e.g. after an annotation triggers a
  // popover that hides the bar) and React tears the overlay tree down (#310).
  const slideUp = useSlideUp();

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

  return (
    <>
    <div
      style={{ ...barBase, ...slideUp, left: 0, right: 0, margin: "0 auto", width: "fit-content", gap: 2 }}
      data-canvas-overlay="true"
      data-canvas-toolbar="true"
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
      <DiscardChangesButton onDiscard={handleReset} pendingCount={pendingCount} disabled={pendingCount === 0} />
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
        animation: `canvasFadeUp 220ms ${EASE.smooth} both`,
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
