import * as React from "react";
import { useCallback, useMemo } from "react";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import { ColorField } from "./color-field.js";
import { ScrubField } from "./scrub-field.js";
import { SelectField } from "./select-field.js";
import { Plus, Trash2 } from "../icons.js";

export type GradientType = "linear" | "radial";

export interface GradientStop {
  /** Position along the gradient axis, 0-100. */
  position: number;
  /** CSS color string. */
  color: string;
}

export interface GradientValue {
  type: GradientType;
  /** Degrees, 0-360. Only used when type === "linear". */
  angle: number;
  stops: GradientStop[];
}

interface GradientEditorProps {
  value: GradientValue;
  onChange: (next: GradientValue) => void;
  className?: string;
}

const TYPE_OPTS = [
  { value: "linear", label: "Linear" },
  { value: "radial", label: "Radial" },
];

const DEFAULT_STOP_COLORS = ["#FFFFFF", "#000000"];

/** Build the CSS gradient string for the given value. */
export function gradientToCss(v: GradientValue): string {
  const sorted = [...v.stops].sort((a, b) => a.position - b.position);
  const body = sorted.map(s => `${s.color} ${Math.round(s.position)}%`).join(", ");
  if (v.type === "radial") return `radial-gradient(circle, ${body})`;
  return `linear-gradient(${Math.round(v.angle)}deg, ${body})`;
}

/**
 * Inline editor for a CSS gradient: type (linear / radial), angle (linear only),
 * plus an ordered list of stops (color + position) with add / remove.
 *
 * Lives inside a Fill layer when type === Gradient. Owns no serialization to
 * Tailwind — the parent Fill section handles that via `gradientToCss`.
 */
export function GradientEditor({ value, onChange, className }: GradientEditorProps) {
  const cssPreview = useMemo(() => gradientToCss(value), [value]);

  const updateStop = useCallback((idx: number, patch: Partial<GradientStop>) => {
    const next = value.stops.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ ...value, stops: next });
  }, [value, onChange]);

  const addStop = useCallback(() => {
    // Insert a stop half-way between the two end-points, or at 50% if we're adding the first mid-stop.
    const sorted = [...value.stops].sort((a, b) => a.position - b.position);
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const position = first && last && last.position - first.position > 2
      ? Math.round((first.position + last.position) / 2)
      : 50;
    const color = DEFAULT_STOP_COLORS[value.stops.length % DEFAULT_STOP_COLORS.length];
    onChange({ ...value, stops: [...value.stops, { position, color }] });
  }, [value, onChange]);

  const removeStop = useCallback((idx: number) => {
    if (value.stops.length <= 2) return;
    onChange({ ...value, stops: value.stops.filter((_, i) => i !== idx) });
  }, [value, onChange]);

  const setType = useCallback((t: string) => {
    onChange({ ...value, type: t === "radial" ? "radial" : "linear" });
  }, [value, onChange]);

  const setAngle = useCallback((raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    onChange({ ...value, angle: ((n % 360) + 360) % 360 });
  }, [value, onChange]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Preview strip — shows live gradient. */}
      <div
        aria-label="Gradient preview"
        className="h-7 rounded-md border border-canvas-border"
        style={{ backgroundImage: cssPreview }}
      />

      {/* Type + angle row. */}
      <div className={cn("grid gap-1.5 items-center", value.type === "linear" ? "grid-cols-[1fr_1fr]" : "grid-cols-1")}>
        <SelectField value={value.type} options={TYPE_OPTS} onChange={setType} title="Gradient type" />
        {value.type === "linear" && (
          <ScrubField
            label="°"
            value={String(Math.round(value.angle))}
            onChange={setAngle}
            title="Gradient angle (degrees)"
            format={n => String(Math.round(((n % 360) + 360) % 360))}
          />
        )}
      </div>

      {/* Stop rows. */}
      <div className="flex flex-col gap-1">
        {value.stops.map((stop, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
            <div className="grid grid-cols-[1fr_auto] gap-1 min-w-0">
              <ColorField
                value={stop.color}
                onChange={c => updateStop(idx, { color: c })}
                title={`Stop ${idx + 1} color`}
              />
              <ScrubField
                label="%"
                value={String(Math.round(stop.position))}
                onChange={p => {
                  const n = parseFloat(p);
                  if (!Number.isFinite(n)) return;
                  updateStop(idx, { position: Math.max(0, Math.min(100, n)) });
                }}
                className="w-16"
                title={`Stop ${idx + 1} position`}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg",
                value.stops.length <= 2 && "opacity-40 pointer-events-none",
              )}
              title={value.stops.length <= 2 ? "Gradients need at least 2 stops" : "Remove stop"}
              onClick={() => removeStop(idx)}
              aria-label="Remove stop"
            >
              <Trash2 size={12} />
            </Button>
            {/* Spacer column so the add-row button aligns with this trailing button. */}
            <span className="w-0" aria-hidden />
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={addStop}
        className="h-7 justify-start text-xs text-canvas-muted-fg hover:text-canvas-fg"
        title="Add gradient stop"
      >
        <Plus size={12} />
        <span className="ml-1.5">Add stop</span>
      </Button>
    </div>
  );
}
