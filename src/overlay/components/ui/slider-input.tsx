import React, { useState, useRef, useCallback, useEffect } from "react";

interface SliderInputProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  onDrag?: (value: number) => void;
}

import { THEME } from "../../theme.js";
const C = THEME;

export const SliderInput = React.memo(function SliderInput({
  label, value, min = 0, max = 100, step = 1, suffix = "", onChange, onDrag,
}: SliderInputProps) {
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef({ x: 0, value: 0 });
  const lastDragValue = useRef(value);
  const localRafRef = useRef(0);
  const committedRef = useRef<number | null>(null);

  // Direct DOM refs for zero-React-render drag updates
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editing || dragging) return;
    if (committedRef.current !== null && value !== committedRef.current) return;
    committedRef.current = null;
    setLocal(String(value));
  }, [value, editing]);

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step)), [min, max, step]);

  // Update DOM directly without React re-render
  const updateVisuals = useCallback((v: number) => {
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
    if (valueRef.current) valueRef.current.textContent = `${v}${suffix}`;
  }, [min, max, suffix]);

  const handleLabelDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, value };
    setDragging(true);
    document.body.style.cursor = "ew-resize";

    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartRef.current.x;
      const sensitivity = ev.shiftKey ? 0.1 : 1;
      const raw = dragStartRef.current.value + dx * sensitivity * step;
      const clamped = clamp(raw);
      lastDragValue.current = clamped;
      if (onDrag) onDrag(clamped);
      // Update DOM directly — no React state, no re-render
      updateVisuals(clamped);
    };

    const handleUp = () => {
      document.body.style.cursor = "";
      const final = lastDragValue.current;
      committedRef.current = final;
      setLocal(String(final));
      onChange(final);
      setDragging(false);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [value, min, max, step, onChange, onDrag, clamp, updateVisuals]);

  const displayValue = dragging ? lastDragValue.current : value;
  const pct = max > min ? ((displayValue - min) / (max - min)) * 100 : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, height: 26 }}>
      {/* Label — draggable scrub */}
      <span
        onMouseDown={handleLabelDown}
        style={{
          fontSize: 10, color: C.fgDim, width: 48, flexShrink: 0,
          cursor: "ew-resize", userSelect: "none", fontWeight: 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>

      {/* Slider track */}
      <div
        style={{
          flex: 1, height: 4, background: C.bgAlt, borderRadius: 2,
          position: "relative", cursor: "pointer", minWidth: 32,
        }}
        onMouseDown={e => {
          e.preventDefault();
          const trackEl = e.currentTarget;
          const rect = trackEl.getBoundingClientRect();
          setDragging(true);

          const calcValue = (clientX: number) => {
            const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            return clamp(min + p * (max - min));
          };

          // Immediate update on click
          const v = calcValue(e.clientX);
          lastDragValue.current = v;
          if (onDrag) onDrag(v);
          cancelAnimationFrame(localRafRef.current);
          localRafRef.current = requestAnimationFrame(() => setLocal(String(v)));

          const handleMove = (ev: MouseEvent) => {
            const mv = calcValue(ev.clientX);
            lastDragValue.current = mv;
            if (onDrag) onDrag(mv);
            cancelAnimationFrame(localRafRef.current);
            localRafRef.current = requestAnimationFrame(() => setLocal(String(mv)));
          };

          const handleUp = () => {
            cancelAnimationFrame(localRafRef.current);
            const final = lastDragValue.current;
            committedRef.current = final;
            setLocal(String(final));
            onChange(final);
            setDragging(false);
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleUp);
          };

          document.addEventListener("mousemove", handleMove);
          document.addEventListener("mouseup", handleUp);
        }}
      >
        <div ref={fillRef} style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${pct}%`, background: C.accent, borderRadius: 2,
          transition: dragging ? "none" : "width 0.1s",
        }} />
        <div ref={thumbRef} style={{
          position: "absolute", top: "50%", left: `${pct}%`,
          width: 10, height: 10, borderRadius: "50%",
          background: "#fff", border: `2px solid ${C.accent}`,
          transform: "translate(-50%, -50%)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: dragging ? "none" : "left 0.1s",
          cursor: "grab",
        }} />
      </div>

      {/* Value — click to edit */}
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => { setEditing(false); const n = parseFloat(local); if (!isNaN(n)) onChange(clamp(n)); }}
          onKeyDown={e => {
            if (e.key === "Enter") { setEditing(false); const n = parseFloat(local); if (!isNaN(n)) onChange(clamp(n)); }
            if (e.key === "Escape") { setEditing(false); setLocal(String(value)); }
            if (e.key === "ArrowUp") { e.preventDefault(); const n = clamp((parseFloat(local) || 0) + (e.shiftKey ? 10 : 1) * step); setLocal(String(n)); onChange(n); }
            if (e.key === "ArrowDown") { e.preventDefault(); const n = clamp((parseFloat(local) || 0) - (e.shiftKey ? 10 : 1) * step); setLocal(String(n)); onChange(n); }
          }}
          style={{
            width: 44, height: 20, background: C.bgAlt, border: `1px solid ${C.accent}`,
            borderRadius: 3, color: C.fg, fontSize: 10, fontFamily: C.mono,
            textAlign: "right", padding: "0 4px", outline: "none",
          }}
        />
      ) : (
        <span
          ref={valueRef}
          onClick={() => setEditing(true)}
          style={{
            width: 44, height: 20, lineHeight: "20px",
            background: C.bgAlt, borderRadius: 3,
            color: C.fg, fontSize: 10, fontFamily: C.mono,
            textAlign: "right", padding: "0 4px",
            cursor: "text", userSelect: "none",
            overflow: "hidden", whiteSpace: "nowrap",
          }}
        >
          {value}{suffix}
        </span>
      )}
    </div>
  );
});
