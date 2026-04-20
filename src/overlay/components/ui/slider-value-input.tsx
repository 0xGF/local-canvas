import React, { useCallback, useRef, useState, useEffect } from "react";
import { THEME } from "../../theme.js";
import { ValueInput } from "./value-input.js";
import type { Preset, ValueStrategy } from "./value-input.parsers.js";
import { LENGTH } from "./value-input.parsers.js";

const C = { ...THEME, track: "#3a3a3a" };

interface SliderValueInputProps {
  /** Current Tailwind value (e.g. "4", "full", "[27px]", ""). */
  value: string;
  /** Numeric value the slider should display. Caller decodes from `value`
   *  (e.g. via `twValueToPx` for lengths, or a custom decoder for scales). */
  sliderValue: number;
  /** Slider range. */
  min?: number;
  max?: number;
  step?: number;
  /** Label shown on the left (e.g. "Top", "Blur", "Rotate"). */
  label?: string;
  /** Presets shown in the input's dropdown. */
  presets?: Preset[];
  /** Parse/format strategy for the input. Defaults to LENGTH. */
  strategy?: ValueStrategy;
  /** Fires on every slider tick while dragging (live preview). */
  onLivePreview?: (px: number) => void;
  /** Fires when slider drag ends OR input is committed.
   *  - `v` is the Tailwind value string (bracket or preset).
   *  - Caller pushes the class mutation. */
  onChange: (v: string) => void;
  /** Convert a slider numeric value (e.g. 24) into the Tailwind value
   *  string to emit. Defaults to `[${n}px]`. */
  encode?: (n: number) => string;
  placeholder?: string;
  /** Suffix next to the number inside the input (e.g. "px", "deg", "%"). */
  suffix?: string;
  /** Disable slider interaction (keeps input editable). */
  disabled?: boolean;
}

/**
 * Slider + free-entry input — the primary numeric knob for the panel.
 *
 * The slider drives a numeric value (px, deg, %, ms, whatever the encoder
 * produces). The input accepts any Tailwind value, including bracket
 * values the slider can't represent (rem, %, calc, negatives beyond min).
 *
 * Drag the slider, type a value, pick from presets — all three converge
 * on the same `onChange(string)` contract.
 */
export const SliderValueInput = React.memo(function SliderValueInput({
  value,
  sliderValue,
  min = 0,
  max = 100,
  step = 1,
  label,
  presets,
  strategy = LENGTH,
  onLivePreview,
  onChange,
  encode = (n) => `[${n}px]`,
  placeholder,
  suffix,
  disabled,
}: SliderValueInputProps) {
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const lastDragRef = useRef(sliderValue);

  // Clamped pct for rendering; we also update visuals imperatively during
  // drag so React doesn't re-run the whole row 60×/sec.
  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step)), [min, max, step]);
  const pct = max > min ? ((sliderValue - min) / (max - min)) * 100 : 0;

  const updateVisuals = useCallback((v: number) => {
    const p = max > min ? ((v - min) / (max - min)) * 100 : 0;
    if (fillRef.current) fillRef.current.style.width = `${p}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${p}%`;
  }, [min, max]);

  useEffect(() => {
    if (!dragging) updateVisuals(sliderValue);
  }, [sliderValue, dragging, updateVisuals]);

  const startDrag = useCallback((clientX: number) => {
    if (disabled) return;
    const track = trackRef.current;
    if (!track) return;
    setDragging(true);
    const rect = track.getBoundingClientRect();

    const calc = (cx: number) => {
      const p = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      return clamp(min + p * (max - min));
    };

    const initial = calc(clientX);
    lastDragRef.current = initial;
    onLivePreview?.(initial);
    updateVisuals(initial);

    const handleMove = (ev: MouseEvent) => {
      const v = calc(ev.clientX);
      lastDragRef.current = v;
      onLivePreview?.(v);
      updateVisuals(v);
    };
    const handleUp = () => {
      setDragging(false);
      onChange(encode(lastDragRef.current));
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [disabled, clamp, min, max, onLivePreview, onChange, encode, updateVisuals]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, height: 26 }}>
      {label !== undefined && (
        <span style={{
          fontSize: 10, color: C.fgDim, width: 44, flexShrink: 0,
          userSelect: "none", fontWeight: 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {label}
        </span>
      )}
      <div
        ref={trackRef}
        onMouseDown={e => { e.preventDefault(); startDrag(e.clientX); }}
        style={{
          flex: 1, height: 4, background: C.track, borderRadius: 2,
          position: "relative", cursor: disabled ? "default" : "pointer",
          minWidth: 40, opacity: disabled ? 0.5 : 1,
        }}
      >
        <div
          ref={fillRef}
          style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${pct}%`, background: C.accent, borderRadius: 2,
            transition: dragging ? "none" : "width 0.1s",
            pointerEvents: "none",
          }}
        />
        <div
          ref={thumbRef}
          style={{
            position: "absolute", top: "50%", left: `${pct}%`,
            width: 10, height: 10, borderRadius: "50%",
            background: "#fff", border: `2px solid ${C.accent}`,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            transition: dragging ? "none" : "left 0.1s",
            pointerEvents: "none",
          }}
        />
      </div>
      <div style={{ width: 72, flexShrink: 0 }}>
        <ValueInput
          value={value}
          presets={presets}
          strategy={strategy}
          onChange={onChange}
          placeholder={placeholder}
          suffix={suffix}
          height={22}
          align="center"
          fontSize={10}
        />
      </div>
    </div>
  );
});
