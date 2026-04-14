import React, { useState, useRef, useCallback, useEffect } from "react";

interface NumberInputProps {
  label: string;
  value: string | number;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  suffix?: string;
}

import { THEME } from "../../theme.js";
const C = THEME;

export const NumberInput = React.memo(function NumberInput({ label, value, onChange, readOnly, suffix }: NumberInputProps) {
  const [local, setLocal] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, value: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef<string | null>(null);

  useEffect(() => {
    if (focused || dragging) return;
    // After a commit, ignore stale external value until it catches up
    if (committedRef.current !== null && String(value) !== committedRef.current) return;
    committedRef.current = null;
    setLocal(String(value));
  }, [value, focused, dragging]);

  const commit = useCallback(() => {
    if (onChange && local !== String(value)) {
      committedRef.current = local;
      onChange(local);
    }
  }, [local, value, onChange]);

  // Scrub drag on label
  const handleLabelDown = useCallback((e: React.MouseEvent) => {
    if (readOnly || !onChange) return;
    e.preventDefault();
    const numVal = parseFloat(String(value)) || 0;
    dragStartRef.current = { x: e.clientX, value: numVal };
    setDragging(true);

    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartRef.current.x;
      const step = ev.shiftKey ? 10 : 1;
      const newVal = Math.round(dragStartRef.current.value + dx * step * 0.1);
      committedRef.current = String(newVal);
      setLocal(String(newVal));
      onChange(String(newVal));
    };

    const handleUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor = "ew-resize";
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [readOnly, value, onChange]);

  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        background: C.bgAlt, borderRadius: 4, overflow: "hidden",
        height: 24, border: `1px solid ${focused ? C.accent : "transparent"}`,
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={e => { if (!focused) e.currentTarget.style.background = C.bgHover; }}
      onMouseLeave={e => { if (!focused) e.currentTarget.style.background = C.bgAlt; }}
    >
      <span
        onMouseDown={handleLabelDown}
        style={{
          fontSize: 10, color: C.fgDim, padding: "0 6px",
          flexShrink: 0, cursor: readOnly ? "default" : "ew-resize",
          userSelect: "none", fontWeight: 500,
        }}
      >
        {label}
      </span>
      <input
        ref={inputRef}
        style={{
          flex: 1, height: "100%", background: "transparent",
          border: "none", color: C.fg, fontSize: 11,
          fontFamily: C.mono, padding: "0 4px 0 0",
          outline: "none", minWidth: 0,
        }}
        value={local}
        readOnly={readOnly}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={e => {
          if (e.key === "Enter") { commit(); inputRef.current?.blur(); }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const dir = e.key === "ArrowUp" ? 1 : -1;
            const num = parseFloat(local) || 0;
            const next = String(Math.round(num + step * dir));
            setLocal(next);
            if (onChange) onChange(next);
          }
        }}
      />
      {suffix && <span style={{ fontSize: 9, color: C.fgMuted, paddingRight: 4 }}>{suffix}</span>}
    </div>
  );
});
