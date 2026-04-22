import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "../../lib/utils.js";

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Fires during drag for local UI preview — do NOT send mutations here */
  onChange?: (value: number) => void;
  /** Fires on mouseup / input blur — send the mutation here */
  onCommit: (value: number) => void;
  /** Render the trailing numeric input. Default true. */
  showValue?: boolean;
  className?: string;
}

export const Slider = React.memo(function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onCommit,
  showValue = true,
  className,
}: SliderProps) {
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);
  const [localInput, setLocalInput] = useState(String(value));
  const lastDragVal = useRef(value);
  // After commit, the parent's `onCommit` is debounced + waits on HMR before
  // `value` catches up. Holding the committed value here prevents the thumb
  // from snapping back to the stale prop on mouseup.
  const committedRef = useRef<number | null>(null);

  useEffect(() => {
    if (dragging) return;
    if (committedRef.current !== null && committedRef.current !== value) return;
    committedRef.current = null;
    setDragValue(value);
    setLocalInput(String(value));
  }, [value, dragging]);

  const getValueFromX = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return value;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + pct * (max - min);
      return Math.round(raw / step) * step;
    },
    [min, max, step, value],
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
        const finalVal = lastDragVal.current;
        committedRef.current = finalVal;
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
    [getValueFromX, onChange, onCommit],
  );

  const displayValue = dragging
    ? dragValue
    : (committedRef.current !== null ? committedRef.current : value);
  const pct = Math.max(0, Math.min(100, ((displayValue - min) / (max - min)) * 100));

  return (
    <div className={cn("flex items-center gap-2 h-7 min-w-0", className)}>
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        // Track stays inline-styled in just one place (the fill width pct) since
        // a per-percent Tailwind class isn't expressible. Everything else is
        // class-driven so theming follows --canvas-* vars.
        className="flex-1 min-w-0 h-1.5 rounded-full bg-canvas-border relative cursor-pointer"
      >
        <div
          className={cn(
            "absolute left-0 top-0 h-full rounded-full bg-canvas-accent",
            !dragging && "transition-[width] duration-100",
          )}
          style={{ width: `${pct}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2",
            "rounded-full bg-white border-2 border-canvas-accent shadow",
            dragging || hovering ? "size-3.5" : "size-3",
            !dragging && "transition-all duration-150",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      {showValue && (
        <input
          value={localInput}
          onChange={e => setLocalInput(e.target.value)}
          onBlur={() => {
            const num = parseInt(localInput, 10);
            if (!isNaN(num)) {
              const clamped = Math.max(min, Math.min(max, num));
              committedRef.current = clamped;
              onCommit(clamped);
            } else {
              setLocalInput(String(value));
            }
          }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={cn(
            "w-10 h-6 rounded bg-canvas-muted text-canvas-fg",
            "text-[10px] font-mono text-center outline-none px-0",
            "border border-transparent focus:border-canvas-accent",
            "placeholder:text-canvas-muted-fg",
          )}
        />
      )}
    </div>
  );
});
