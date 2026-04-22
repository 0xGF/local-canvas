import React, { useCallback, useState } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import {
  Settings as SettingsIcon,
  Pause,
  Play,
  Sun,
  Moon,
  Check,
  X,
  Reset,
} from "./icons.js";
import { THEME } from "../theme.js";
import { PopSlideUp } from "../utils/motion-presets.js";
import { EASE, DURATION } from "../utils/easings.js";

const C = THEME;

/**
 * One popover for overlay-level settings. Opens from the gear button on the
 * right of the toolbar. Groups viewport/behavior/annotation controls that
 * used to sprawl across the primary row.
 */
export const SettingsPopover = React.memo(function SettingsPopover({
  onResetAll,
  canResetAll,
}: {
  onResetAll: () => void;
  canResetAll: boolean;
}) {
  // Open state lives in the shared toolbar-popup slot so opening this popup
  // automatically closes any other bottom-bar popup (breakpoint, history,
  // changes save). Each popup reads `open = toolbarPopup === "myId"`.
  const toolbarPopup = useEditorStore((s) => s.toolbarPopup);
  const setToolbarPopup = useEditorStore((s) => s.setToolbarPopup);
  const open = toolbarPopup === "settings";
  const setOpen = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(open) : v;
      setToolbarPopup(next ? "settings" : null);
    },
    [open, setToolbarPopup],
  );
  const [btnHover, setBtnHover] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        title="Settings"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minWidth: 32, height: 32, borderRadius: 6,
          border: "none",
          background: open ? C.bgHover : btnHover ? C.bgHover : "transparent",
          color: open ? C.fg : btnHover ? C.fg : C.fgDim,
          cursor: "pointer",
          transition: `background-color ${DURATION.micro}ms ${EASE.snappy}, color ${DURATION.micro}ms ${EASE.snappy}`,
        }}
      >
        <SettingsIcon size={15} />
      </button>

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
          position: "absolute", bottom: "100%", right: 0,
          marginBottom: 8,
          // Solid chrome — matches the toolbar, no see-through backdrop.
          background: C.bg,
          border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 0, zIndex: 2147483647,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.04) inset," +
            "0 10px 32px rgba(0,0,0,0.45)," +
            "0 2px 8px rgba(0,0,0,0.3)",
          width: 280, maxHeight: 480, overflowY: "auto",
          fontFamily: C.font,
        }}
        data-canvas-overlay="true"
      >
        <Header onClose={() => setOpen(false)} />
        <BehaviorSection />
        <ChangesSection onResetAll={onResetAll} canResetAll={canResetAll} onClose={() => setOpen(false)} />
        <AppearanceSection />
      </PopSlideUp>
    </div>
  );
});

// ── Layout primitives ───────────────────────────────────────────────────────

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.fg, letterSpacing: "0.02em" }}>
        Settings
      </span>
      <button
        onClick={onClose}
        style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", padding: 2 }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "10px 12px 4px",
      fontSize: 9, fontWeight: 700, color: C.fgMuted,
      textTransform: "uppercase", letterSpacing: "0.08em",
    }}>
      {children}
    </div>
  );
}

function Row({
  icon, label, right, onClick, disabled, danger, hint, title,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  /** Native tooltip — include shortcut when one exists. */
  title?: string;
}) {
  const [hover, setHover] = useState(false);
  const interactive = !!onClick && !disabled;
  return (
    <button
      onClick={interactive ? onClick : undefined}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "8px 12px",
        border: "none",
        background: interactive && hover ? C.bgHover : "transparent",
        color: disabled ? C.fgMuted : danger ? C.danger : C.fg,
        cursor: interactive ? "pointer" : "default",
        textAlign: "left",
        fontFamily: C.font, fontSize: 11, fontWeight: 500,
        transition: `background-color ${DURATION.micro}ms ${EASE.snappy}`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon && <span style={{ display: "inline-flex", width: 16, justifyContent: "center", color: danger ? C.danger : C.fgDim }}>{icon}</span>}
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{label}</span>
        {hint && <span style={{ fontSize: 9, color: C.fgMuted, fontWeight: 400 }}>{hint}</span>}
      </span>
      {right}
    </button>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 26, height: 14, borderRadius: 10,
        background: on ? C.accent : C.border,
        position: "relative", flexShrink: 0,
        transition: `background-color ${DURATION.micro}ms ${EASE.snappy}`,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 14 : 2,
        width: 10, height: 10, borderRadius: "50%",
        background: "#fff",
        transition: `left 140ms ${EASE.smooth}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
      }} />
    </span>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function BehaviorSection() {
  const animationsPaused = useEditorStore(s => s.animationsPaused);
  const toggleAnimationsPaused = useEditorStore(s => s.toggleAnimationsPaused);
  return (
    <>
      <SectionTitle>Behavior</SectionTitle>
      <Row
        icon={animationsPaused ? <Play size={13} /> : <Pause size={13} />}
        label="Pause page animations"
        hint={animationsPaused ? "Animations frozen" : "Off"}
        right={<Toggle on={animationsPaused} />}
        onClick={toggleAnimationsPaused}
        title="Pause animations (⌥P)"
      />
    </>
  );
}

function ChangesSection({
  onResetAll, canResetAll, onClose,
}: { onResetAll: () => void; canResetAll: boolean; onClose: () => void }) {
  return (
    <>
      <SectionTitle>Changes</SectionTitle>
      <Row
        icon={<Reset size={13} />}
        label="Reset all pending changes"
        danger
        disabled={!canResetAll}
        onClick={() => { onResetAll(); onClose(); }}
      />
    </>
  );
}

function AppearanceSection() {
  // Light mode is a placeholder until a proper theme system lands.
  return (
    <>
      <SectionTitle>Appearance</SectionTitle>
      <Row
        icon={<Moon size={13} />}
        label="Dark"
        right={<Check size={13} style={{ color: C.accent }} />}
      />
      <Row
        icon={<Sun size={13} />}
        label={<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Light
          <span style={{
            fontSize: 8, fontWeight: 700, color: C.fgMuted,
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: "1px 4px", letterSpacing: "0.04em",
          }}>SOON</span>
        </span>}
        disabled
      />
    </>
  );
}
