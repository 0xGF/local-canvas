import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "../icons.js";
import { usePortalContainer } from "../../lib/portal-container.js";
import { THEME } from "../../theme.js";
import type { Preset, ValueStrategy } from "./value-input.parsers.js";
import { LENGTH } from "./value-input.parsers.js";

const C = { ...THEME, accentMuted: "rgba(12,140,233,0.15)", accentHover: "#3da8f5" };

interface ValueInputProps {
  /** Current Tailwind value (e.g. "4", "full", "[27px]", ""). */
  value: string;
  /** Known presets. Exact match short-circuits through parse() and renders with the preset label. */
  presets?: Preset[];
  /** Emits the new Tailwind value string. "" means "clear this property". */
  onChange: (value: string) => void;
  /** Parse/format strategy. Defaults to LENGTH. */
  strategy?: ValueStrategy;
  /** Placeholder text when empty. */
  placeholder?: string;
  /** Shown at end of field (e.g. "px"). Hidden while editing. */
  suffix?: string;
  /** Optional title/tooltip. */
  title?: string;
  /** Compact height for tight layouts (default 28). */
  height?: number;
  /** Text-align for the input text (default "left"). */
  align?: "left" | "center";
  /** Font size override (default 11). */
  fontSize?: number;
}

/**
 * ValueInput — a text field + optional preset dropdown.
 *
 * The caller gives us the current Tailwind value and a parse/format strategy.
 * The user can type any CSS-valid value (27, 27px, 1.5rem, 50%, -12px,
 * calc(100%-20px), [anything]) OR pick a preset from the dropdown.
 *
 * Emits the Tailwind token/bracket-value via onChange, ready for h.set().
 */
export const ValueInput = React.memo(function ValueInput({
  value,
  presets = [],
  onChange,
  strategy = LENGTH,
  placeholder = "",
  suffix,
  title,
  height = 28,
  align = "left",
  fontSize = 11,
}: ValueInputProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [local, setLocal] = useState(() => strategy.format(value, presets));
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef<string | null>(null);
  const portalContainer = usePortalContainer();

  // Sync external value → local text (skipped while user is mid-edit, and
  // after a commit until the external state catches up).
  useEffect(() => {
    if (focused) return;
    if (committedRef.current !== null && committedRef.current !== value) return;
    committedRef.current = null;
    setLocal(strategy.format(value, presets));
  }, [value, focused, strategy, presets]);

  const commit = useCallback(
    (rawText: string) => {
      const next = strategy.parse(rawText, presets);
      if (next !== value) {
        committedRef.current = next;
        onChange(next);
      }
      // Mirror formatted text back so bracket syntax collapses to "27px" etc.
      setLocal(strategy.format(next, presets));
    },
    [strategy, presets, value, onChange]
  );

  const choosePreset = useCallback(
    (p: Preset) => {
      committedRef.current = p.value;
      setLocal(p.label ?? p.value);
      onChange(p.value);
      setOpen(false);
      setFocusIdx(-1);
    },
    [onChange]
  );

  // Position dropdown on open
  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(presets.length * 28 + 8, 240);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= dropdownHeight ? rect.bottom + 4 : rect.top - dropdownHeight - 4;
    setDropdownPos({ top, left: rect.left, width: rect.width });
  }, [open, presets.length]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    const shadowRoot = portalContainer?.getRootNode();
    if (shadowRoot && shadowRoot !== document) {
      (shadowRoot as ShadowRoot).addEventListener("mousedown", handler as EventListener, true);
    }
    return () => {
      document.removeEventListener("mousedown", handler, true);
      if (shadowRoot && shadowRoot !== document) {
        (shadowRoot as ShadowRoot).removeEventListener("mousedown", handler as EventListener, true);
      }
    };
  }, [open, portalContainer]);

  // Scroll focused option into view
  useEffect(() => {
    if (!open || focusIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[focusIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  const hasPresets = presets.length > 0;
  const showSuffix = !!suffix && !focused;

  const dropdown = open && dropdownPos && (
    <div
      ref={listRef}
      data-canvas-overlay="true"
      style={{
        position: "fixed",
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: Math.max(dropdownPos.width, 140),
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        zIndex: 2147483647,
        maxHeight: 240,
        overflowY: "auto",
        padding: 4,
        pointerEvents: "auto",
        animation: "fadeIn 0.1s ease-out",
      }}
    >
      {presets.map((p, i) => {
        const isSelected = p.value === value;
        const isFocused = i === focusIdx;
        return (
          <div
            key={`${p.value}_${i}`}
            onClick={() => choosePreset(p)}
            onMouseEnter={() => setFocusIdx(i)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: C.mono,
              color: isSelected ? C.accentHover : C.fg,
              background: isSelected ? C.accentMuted : isFocused ? C.bgHover : "transparent",
              cursor: "pointer",
              transition: "background 0.08s",
              whiteSpace: "nowrap",
            }}
          >
            <span>{p.label ?? p.value ?? "default"}</span>
            {isSelected && <span style={{ fontSize: 12, color: C.accent }}>✓</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }} title={title}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height,
          background: C.bgAlt,
          border: `1px solid ${focused || open ? C.accent : "transparent"}`,
          borderRadius: 6,
          transition: "border-color 0.15s, background 0.15s",
          overflow: "hidden",
        }}
        onMouseEnter={e => { if (!focused && !open) e.currentTarget.style.background = C.bgHover; }}
        onMouseLeave={e => { if (!focused && !open) e.currentTarget.style.background = C.bgAlt; }}
      >
        <input
          ref={inputRef}
          value={local}
          placeholder={placeholder}
          onChange={e => setLocal(e.target.value)}
          onFocus={() => { setFocused(true); }}
          onBlur={() => { setFocused(false); commit(local); }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(local);
              inputRef.current?.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setLocal(strategy.format(value, presets));
              inputRef.current?.blur();
            } else if (e.key === "ArrowDown" && hasPresets) {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                const idx = presets.findIndex(p => p.value === value);
                setFocusIdx(idx >= 0 ? idx : 0);
              } else {
                setFocusIdx(i => Math.min(presets.length - 1, i + 1));
              }
            } else if (e.key === "ArrowUp" && hasPresets && open) {
              e.preventDefault();
              setFocusIdx(i => Math.max(0, i - 1));
            } else if (e.key === "Enter" && open && focusIdx >= 0) {
              e.preventDefault();
              choosePreset(presets[focusIdx]);
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            background: "transparent",
            border: "none",
            color: C.fg,
            fontSize,
            fontFamily: C.mono,
            padding: "0 6px",
            outline: "none",
            textAlign: align,
          }}
        />
        {showSuffix && (
          <span style={{ fontSize: 9, color: C.fgMuted, paddingRight: hasPresets ? 2 : 6, flexShrink: 0 }}>
            {suffix}
          </span>
        )}
        {hasPresets && (
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              setOpen(o => !o);
              if (!open) {
                const idx = presets.findIndex(p => p.value === value);
                setFocusIdx(idx >= 0 ? idx : 0);
              }
            }}
            title="Presets"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: "100%",
              background: "transparent",
              border: "none",
              color: C.fgMuted,
              cursor: "pointer",
              flexShrink: 0,
              transition: "color 0.12s, background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.fg; e.currentTarget.style.background = C.bgHover; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.fgMuted; e.currentTarget.style.background = "transparent"; }}
          >
            <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        )}
      </div>
      {portalContainer ? createPortal(dropdown, portalContainer) : dropdown}
    </div>
  );
});
