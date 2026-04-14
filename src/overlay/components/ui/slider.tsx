import React, { useState, useRef, useCallback, useEffect } from "react";

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Fires during drag for local UI preview — do NOT send mutations here */
  onChange?: (value: number) => void;
  /** Fires on mouseup / input blur — send the mutation here */
  onCommit: (value: number) => void;
  suffix?: string;
  showValue?: boolean;
}

import { THEME } from "../../theme.js";
const C = { ...THEME, track: "#3a3a3a" };

export const Slider = React.memo(function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onCommit,
  showValue = true,
}: SliderProps) {
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);
  const [localInput, setLocalInput] = useState(String(value));
  const lastDragVal = useRef(value);

  useEffect(() => {
    if (!dragging) {
      setDragValue(value);
      setLocalInput(String(value));
    }
  }, [value, dragging]);

  const getValueFromX = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return value;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + pct * (max - min);
      return Math.round(raw / step) * step;
    },
    [min, max, step, value]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      const newVal = getValueFromX(e.clientX);
      setDragValue(newVal);
      setLocalInput(String(newVal));
      onChange?.(newVal);

      const handleMove = (ev: MouseEvent) => {
        const v = getValueFromX(ev.clientX);
        lastDragVal.current = v;
        setDragValue(v);
        setLocalInput(String(v));
        onChange?.(v);
      };
      const handleUp = () => {
        // Use last value from mousemove — no recalculation, no value jump
        const finalVal = lastDragVal.current;
        setDragging(false);
        setDragValue(finalVal);
        setLocalInput(String(finalVal));
        onCommit(finalVal);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [getValueFromX, onChange, onCommit]
  );

  const displayValue = dragging ? dragValue : value;
  const pct = ((displayValue - min) / (max - min)) * 100;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          flex: 1, height: 6, background: C.track,
          borderRadius: 3, position: "relative", cursor: "pointer",
        }}
      >
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${pct}%`, background: C.accent, borderRadius: 3,
          transition: dragging ? "none" : "width 0.1s ease",
        }} />
        <div style={{
          position: "absolute", left: `${pct}%`, top: "50%",
          width: dragging || hovering ? 14 : 12,
          height: dragging || hovering ? 14 : 12,
          background: "#fff", borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          transition: dragging ? "none" : "all 0.15s ease",
          border: `2px solid ${C.accent}`,
        }} />
      </div>
      {showValue && (
        <input
          style={{
            width: 40, height: 22, background: C.bgAlt,
            border: "1px solid transparent", borderRadius: 4,
            color: C.fg, fontSize: 10, fontFamily: C.mono,
            textAlign: "center", outline: "none", padding: 0,
          }}
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "transparent";
            const num = parseInt(localInput);
            if (!isNaN(num)) {
              const clamped = Math.max(min, Math.min(max, num));
              onCommit(clamped);
            } else {
              setLocalInput(String(value));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
    </div>
  );
});
