import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils.js";
import {
  type HSVA,
  hsvaToRgba,
  rgbaToHsla,
  rgbaToLcha,
  rgbaToHex,
  rgbaCss,
  parseColor,
  clamp,
} from "../../lib/color.js";
import { ScrubField } from "./scrub-field.js";
import { Button } from "./button.js";
import { Copy, X as CloseIcon, Eyedropper } from "../icons.js";

interface ColorPickerPopoverProps {
  /** Current color as a CSS string (#hex / rgb()). */
  value: string;
  onChange: (next: string) => void;
  onClose?: () => void;
  className?: string;
}

type Tab = "picker" | "palette";

const CHECKER = "repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 6px 6px";

/**
 * The dialog that opens when a ColorField swatch is clicked:
 *   - Picker / Palette tabs
 *   - eyedropper + close in the top-right
 *   - Picker: SV square + vertical alpha/hue + LCH/HSL/RGB rows + HEX/A
 *   - Palette: grid of Tailwind preset swatches (click to apply)
 *
 * Designed to be mounted inside a Popover — it does not manage its own
 * positioning.
 */
export function ColorPickerPopover({ value, onChange, onClose, className }: ColorPickerPopoverProps) {
  const [hsva, setHsva] = useState<HSVA>(() => parseColor(value) ?? { h: 0, s: 0, v: 0, a: 1 });
  const [tab, setTab] = useState<Tab>("picker");

  const rgba = useMemo(() => hsvaToRgba(hsva), [hsva]);
  const hex = useMemo(() => rgbaToHex(rgba), [rgba]);
  const hsla = useMemo(() => rgbaToHsla(rgba), [rgba]);
  const lcha = useMemo(() => rgbaToLcha(rgba), [rgba]);

  // Two-way sync with the `value` prop. We track the last CSS string we
  // emitted vs. the last one we *consumed* so external changes (element
  // selection changing, palette click updating via onChange→value) flow
  // back into hsva without a feedback loop.
  const lastEmittedRef = useRef<string>(value);
  useEffect(() => {
    const css = hsva.a >= 1 ? hex : rgbaCss(rgba);
    if (css === lastEmittedRef.current) return;
    lastEmittedRef.current = css;
    onChange(css);
  }, [hsva.a, hex, rgba, onChange]);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    const parsed = parseColor(value);
    if (!parsed) return;
    lastEmittedRef.current = value;
    setHsva(parsed);
  }, [value]);

  const setHue = useCallback((h: number) => setHsva(p => ({ ...p, h: clamp(h, 0, 360) })), []);
  const setAlpha = useCallback((a: number) => setHsva(p => ({ ...p, a: clamp(a, 0, 1) })), []);
  const setSV = useCallback(
    (s: number, v: number) => setHsva(p => ({ ...p, s: clamp(s, 0, 100), v: clamp(v, 0, 100) })),
    [],
  );

  const eyedrop = useCallback(async () => {
    const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const result = await new EyeDropperCtor().open();
      const parsed = parseColor(result.sRGBHex);
      if (parsed) setHsva(parsed);
    } catch { /* user cancelled */ }
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => { /* ignore */ });
  }, []);

  return (
    <div
      className={cn(
        "w-[360px] rounded-lg border border-canvas-border bg-canvas-bg shadow-xl",
        "p-3 select-none",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <Tabs value={tab} onChange={setTab} />
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Pick from screen" onClick={eyedrop}>
            <Eyedropper size={12} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Close" onClick={onClose}>
              <CloseIcon size={12} />
            </Button>
          )}
        </div>
      </div>

      {tab === "palette" ? (
        <TailwindPalette
          selected={hex.toLowerCase()}
          onPick={hexStr => {
            const parsed = parseColor(hexStr);
            if (parsed) setHsva({ ...parsed, a: hsva.a });
          }}
        />
      ) : (
        <PickerPanel
          hsva={hsva}
          rgba={rgba}
          hsla={hsla}
          lcha={lcha}
          hex={hex}
          setHue={setHue}
          setAlpha={setAlpha}
          setSV={setSV}
          setHsva={setHsva}
          onCopy={copyToClipboard}
        />
      )}
    </div>
  );
}

// -- Tabs --------------------------------------------------------------------

const TABS: readonly Tab[] = ["picker", "palette"];

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-canvas-muted p-0.5">
      {TABS.map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            "px-2.5 h-6 text-[11px] font-semibold rounded-[4px] transition-colors tracking-tight capitalize",
            value === t
              ? "bg-canvas-bg text-canvas-fg shadow-sm"
              : "text-canvas-muted-fg hover:text-canvas-fg",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// -- Picker panel ------------------------------------------------------------

interface PickerPanelProps {
  hsva: HSVA;
  rgba: { r: number; g: number; b: number; a: number };
  hsla: { h: number; s: number; l: number; a: number };
  lcha: { l: number; c: number; h: number; a: number };
  hex: string;
  setHue: (h: number) => void;
  setAlpha: (a: number) => void;
  setSV: (s: number, v: number) => void;
  setHsva: React.Dispatch<React.SetStateAction<HSVA>>;
  onCopy: (text: string) => void;
}

function PickerPanel({
  hsva, rgba, hsla, lcha, hex, setHue, setAlpha, setSV, setHsva, onCopy,
}: PickerPanelProps) {
  const svRef = useRef<HTMLDivElement>(null);
  const svPointerDown = useDragHandler(svRef, (rect, x, y) => {
    const s = clamp((x - rect.left) / rect.width, 0, 1) * 100;
    const v = (1 - clamp((y - rect.top) / rect.height, 0, 1)) * 100;
    setSV(s, v);
  });
  const onHuePointer = useVerticalDragHandler(n => setHue(n * 360));
  const onAlphaPointer = useVerticalDragHandler(setAlpha);

  const baseHueCss = `hsl(${Math.round(hsva.h)}, 100%, 50%)`;

  return (
    <>
      <div className="flex gap-2 mb-3">
        {/* SV square */}
        <div
          ref={svRef}
          onPointerDown={svPointerDown}
          className="relative flex-1 h-[200px] rounded-md cursor-crosshair overflow-hidden"
          style={{
            background:
              `linear-gradient(to top, #000, transparent),` +
              `linear-gradient(to right, #fff, ${baseHueCss})`,
          }}
        >
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none"
            style={{
              left: `calc(${hsva.s}% - 6px)`,
              top: `calc(${100 - hsva.v}% - 6px)`,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
            }}
          />
        </div>
        {/* Alpha */}
        <VerticalSlider
          onPointerDown={onAlphaPointer}
          thumbTop={`calc(${(1 - hsva.a) * 100}% - 2px)`}
          background={`linear-gradient(to top, transparent, ${baseHueCss}), ${CHECKER}`}
        />
        {/* Hue */}
        <VerticalSlider
          onPointerDown={onHuePointer}
          thumbTop={`calc(${(1 - hsva.h / 360) * 100}% - 2px)`}
          background="linear-gradient(to top, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
        />
      </div>

      <ValueRow
        a={Math.round(lcha.l)} b={Math.round(lcha.c)} c={Math.round(lcha.h)}
        labels={["L", "C", "H"]}
        onCopy={() => onCopy(`lch(${Math.round(lcha.l)} ${Math.round(lcha.c)} ${Math.round(lcha.h)})`)}
      />
      <ValueRow
        a={Math.round(hsla.h)} b={Math.round(hsla.s)} c={Math.round(hsla.l)}
        labels={["H", "S", "L"]}
        onCopy={() => onCopy(`hsl(${Math.round(hsla.h)} ${Math.round(hsla.s)}% ${Math.round(hsla.l)}%)`)}
      />
      <ValueRow
        a={rgba.r} b={rgba.g} c={rgba.b}
        labels={["R", "G", "B"]}
        onCopy={() => onCopy(`rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`)}
      />

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
        <ScrubField
          label="HEX"
          value={hex.replace(/^#/, "")}
          onChange={v => {
            const parsed = parseColor("#" + v.replace(/^#/, ""));
            if (parsed) setHsva(p => ({ ...parsed, a: p.a }));
          }}
        />
        <ScrubField
          label="A"
          value={`${Math.round(hsva.a * 100)}`}
          onChange={v => {
            const n = parseFloat(v);
            if (Number.isFinite(n)) setAlpha(clamp(n / 100, 0, 1));
          }}
          className="w-[80px]"
        />
      </div>
    </>
  );
}

function VerticalSlider({
  onPointerDown, thumbTop, background,
}: {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  thumbTop: string;
  background: string;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="relative w-2.5 h-[200px] rounded-full cursor-pointer overflow-hidden"
      style={{ background }}
    >
      <div
        className="absolute left-1/2 w-3.5 h-1 -translate-x-1/2 rounded-[2px] bg-white pointer-events-none"
        style={{ top: thumbTop, boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}
      />
    </div>
  );
}

// -- Drag primitives ---------------------------------------------------------

/**
 * Attach a pointer drag to a ref'd element. `update` is called with the
 * element's cached rect plus current clientX/Y on pointerdown and on every
 * subsequent pointermove until release. Rect is captured once per drag so
 * downstream math is stable even if layout shifts mid-drag.
 */
function useDragHandler<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  update: (rect: DOMRect, clientX: number, clientY: number) => void,
) {
  return useCallback((e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    update(rect, e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => update(rect, ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [ref, update]);
}

/** Vertical slider variant: reports 0..1 (1 at top) from pointerY relative to the track. */
function useVerticalDragHandler(set: (n01: number) => void) {
  return useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const apply = (y: number) => set(1 - clamp((y - rect.top) / rect.height, 0, 1));
    apply(e.clientY);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => apply(ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [set]);
}

// -- Readouts ----------------------------------------------------------------

function ValueRow({
  a, b, c, labels, onCopy,
}: { a: number; b: number; c: number; labels: [string, string, string]; onCopy: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1 mb-1">
      <Cell label={labels[0]} value={a} />
      <Cell label={labels[1]} value={b} />
      <Cell label={labels[2]} value={c} />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg"
        onClick={onCopy}
        title="Copy"
      >
        <Copy size={12} />
      </Button>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center h-7 min-w-0 rounded-md bg-canvas-muted text-xs">
      <span className="h-full flex items-center justify-center shrink-0 pl-2 pr-1 text-[11px] text-canvas-muted-fg select-none">
        {label}
      </span>
      <span className="flex-1 min-w-0 pr-2 font-mono text-canvas-fg tabular-nums text-right">
        {value}
      </span>
    </div>
  );
}

// -- Tailwind palette --------------------------------------------------------
// Canonical Tailwind v3 hexes, hardcoded so we don't pull `tailwindcss/colors`
// into the overlay bundle. Shades are positional — one entry per SHADE_LABEL.

const SHADE_LABELS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

const TAILWIND_FAMILIES: readonly { name: string; hex: readonly string[] }[] = [
  { name: "slate",   hex: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617"] },
  { name: "gray",    hex: ["#f9fafb", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#374151", "#1f2937", "#111827", "#030712"] },
  { name: "zinc",    hex: ["#fafafa", "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b", "#09090b"] },
  { name: "red",     hex: ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d", "#450a0a"] },
  { name: "orange",  hex: ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12", "#431407"] },
  { name: "amber",   hex: ["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706", "#b45309", "#92400e", "#78350f", "#451a03"] },
  { name: "yellow",  hex: ["#fefce8", "#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04", "#a16207", "#854d0e", "#713f12", "#422006"] },
  { name: "lime",    hex: ["#f7fee7", "#ecfccb", "#d9f99d", "#bef264", "#a3e635", "#84cc16", "#65a30d", "#4d7c0f", "#3f6212", "#365314", "#1a2e05"] },
  { name: "green",   hex: ["#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d", "#052e16"] },
  { name: "emerald", hex: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"] },
  { name: "teal",    hex: ["#f0fdfa", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59", "#134e4a", "#042f2e"] },
  { name: "cyan",    hex: ["#ecfeff", "#cffafe", "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#0e7490", "#155e75", "#164e63", "#083344"] },
  { name: "sky",     hex: ["#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#075985", "#0c4a6e", "#082f49"] },
  { name: "blue",    hex: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"] },
  { name: "indigo",  hex: ["#eef2ff", "#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#312e81", "#1e1b4b"] },
  { name: "violet",  hex: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"] },
  { name: "purple",  hex: ["#faf5ff", "#f3e8ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea", "#7e22ce", "#6b21a8", "#581c87", "#3b0764"] },
  { name: "fuchsia", hex: ["#fdf4ff", "#fae8ff", "#f5d0fe", "#f0abfc", "#e879f9", "#d946ef", "#c026d3", "#a21caf", "#86198f", "#701a75", "#4a044e"] },
  { name: "pink",    hex: ["#fdf2f8", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#9d174d", "#831843", "#500724"] },
  { name: "rose",    hex: ["#fff1f2", "#ffe4e4", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337", "#4c0519"] },
];

/** Grid of Tailwind preset swatches. One row per family, one cell per shade. */
function TailwindPalette({ selected, onPick }: { selected: string; onPick: (hex: string) => void }) {
  return (
    <div className="max-h-[360px] overflow-y-auto -mx-1 px-1">
      {TAILWIND_FAMILIES.map(fam => (
        <div key={fam.name} className="grid grid-cols-[3.25rem_repeat(11,_minmax(0,_1fr))] items-center gap-0.5 mb-0.5">
          <span className="text-[10px] text-canvas-muted-fg truncate pr-1">{fam.name}</span>
          {fam.hex.map((hex, i) => {
            const isSelected = hex.toLowerCase() === selected;
            return (
              <button
                key={SHADE_LABELS[i]}
                type="button"
                onClick={() => onPick(hex)}
                title={`${fam.name}-${SHADE_LABELS[i]} · ${hex}`}
                className={cn(
                  "h-5 w-full rounded-[3px] border border-canvas-border/50 transition-transform hover:scale-110",
                  isSelected && "ring-1 ring-canvas-accent ring-offset-1 ring-offset-canvas-bg",
                )}
                style={{ background: hex }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
