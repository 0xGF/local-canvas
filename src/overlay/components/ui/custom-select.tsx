import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "../icons.js";
import { usePortalContainer } from "../../lib/portal-container.js";

interface Option {
  value: string;
  label?: string;
}

interface CustomSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
}

import { THEME } from "../../theme.js";
const C = { ...THEME, accentMuted: "rgba(12,140,233,0.15)", accentHover: "#3da8f5" };

export const CustomSelect = React.memo(function CustomSelect({
  value,
  options,
  onChange,
  placeholder = "\u2014",
  width,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();

  const selectedOpt = options.find((o) => o.value === value);
  const display = selectedOpt
    ? selectedOpt.label || selectedOpt.value || "default"
    : placeholder;

  // Calculate dropdown position when opening
  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const dropdownHeight = Math.min(options.length * 30 + 8, 208); // max 200px + padding

    // Position above if not enough space below
    const top = spaceBelow >= dropdownHeight
      ? rect.bottom + 4
      : rect.top - dropdownHeight - 4;

    setDropdownPos({
      top,
      left: rect.left,
      width: rect.width,
    });
  }, [open, options.length]);

  // Close on outside click — use the shadow root if available
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is on the trigger button
      if (ref.current && ref.current.contains(target)) return;
      // Check if click is on the dropdown list (portaled)
      if (listRef.current && listRef.current.contains(target)) return;
      setOpen(false);
    };
    // Listen on both document and the shadow root for click events
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
          setFocusIdx(
            Math.max(
              0,
              options.findIndex((o) => o.value === value)
            )
          );
        }
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(options.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && focusIdx >= 0) {
        onChange(options[focusIdx].value);
        setOpen(false);
      }
    },
    [open, focusIdx, options, value, onChange]
  );

  useEffect(() => {
    if (!open || focusIdx < 0 || !listRef.current) return;
    const items = listRef.current.children;
    if (items[focusIdx])
      (items[focusIdx] as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  const dropdown = open && dropdownPos && (
    <div
      ref={listRef}
      // Mark as overlay UI so the viewport wheel handler lets its native
      // scroll through — otherwise scrolling a long option list either does
      // nothing (zoom=1 branch silently ignores it) or pans the canvas
      // (zoom!=1 branch preventDefaults the wheel).
      data-canvas-overlay="true"
      style={{
        position: "fixed",
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        zIndex: 2147483647,
        maxHeight: 200,
        overflowY: "auto",
        padding: 4,
        pointerEvents: "auto",
        animation: "fadeIn 0.1s ease-out",
      }}
    >
      {options.map((opt, i) => {
        const isSelected = opt.value === value;
        const isFocused = i === focusIdx;
        return (
          <div
            key={opt.value || `_empty_${i}`}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
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
              background: isSelected
                ? C.accentMuted
                : isFocused
                ? C.bgHover
                : "transparent",
              cursor: "pointer",
              transition: "background 0.08s",
              whiteSpace: "nowrap",
            }}
          >
            <span>{opt.label || opt.value || "default"}</span>
            {isSelected && (
              <span style={{ fontSize: 12, color: C.accent }}>✓</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      ref={ref}
      style={{ position: "relative", width: width || "100%" }}
      onKeyDown={handleKeyDown}
    >
      <button
        onClick={() => {
          setOpen(!open);
          if (!open)
            setFocusIdx(
              Math.max(
                0,
                options.findIndex((o) => o.value === value)
              )
            );
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          height: 28,
          background: C.bgAlt,
          border: `1px solid ${open ? C.accent : "transparent"}`,
          borderRadius: 6,
          color: value ? C.fg : C.fgDim,
          fontSize: 11,
          fontFamily: C.mono,
          padding: "0 6px 0 8px",
          cursor: "pointer",
          outline: "none",
          gap: 4,
          transition: "border-color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = C.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = C.bgAlt;
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {display}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: C.fgMuted,
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {/* Portal the dropdown to the shadow DOM mount point to escape overflow clipping */}
      {portalContainer
        ? createPortal(dropdown, portalContainer)
        : dropdown}
    </div>
  );
});
