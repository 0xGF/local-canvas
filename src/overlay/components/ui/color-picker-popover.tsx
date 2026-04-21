import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils.js";
import {
  type HSVA,
  hsvaToRgba,
  rgbaToHsla,
  rgbaToLcha,
  rgbaToHex,
  parseColor,
  clamp,
} from "../../lib/color.js";
import { ScrubField } from "./scrub-field.js";
import { Button } from "./button.js";
import { Copy, X as CloseIcon, Eyedropper, Hamburger } from "../icons.js";

interface ColorPickerPopoverProps {
  /** Current color as a CSS string (#hex / rgb()). */
  value: string;
  onChange: (next: string) => void;
  onClose?: () => void;
  className?: string;
}

type Space = "srgb" | "p3";

/**
 * The dialog that opens when a ColorField swatch is clicked. Matches the
 * Framer-style spec:
 *   - sRGB / Display P3 tabs
 *   - eyedropper / hamburger menu / close in the top-right
 *   - large saturation×value square + vertical alpha + vertical hue
 *   - previous / new swatch comparison
 *   - LCH / HSL / RGB triple-row of ScrubFields with copy buttons
 *   - hex / opacity pill at the bottom
 *
 * Designed to be mounted inside a Radix Popover (or similar) — it does not
 * manage its own positioning.
 */
export function ColorPickerPopover({ value, onChange, onClose, className }: ColorPickerPopoverProps) {
  const initial = useMemo<HSVA>(() => parseColor(value) ?? { h: 0, s: 0, v: 0, a: 1 }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [hsva, setHsva] = useState<HSVA>(initial);
  const [space, setSpace] = useState<Space>("srgb");
  const [previous] = useState<string>(value);

  const rgba = useMemo(() => hsvaToRgba(hsva), [hsva]);
  const hex = useMemo(() => rgbaToHex(rgba), [rgba]);
  const hsla = useMemo(() => rgbaToHsla(rgba), [rgba]);
  const lcha = useMemo(() => rgbaToLcha(rgba), [rgba]);

  // Push changes outward
  const lastEmittedRef = useRef<string>(value);
  useEffect(() => {
    const css = hsva.a >= 1 ? hex : `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${Number(hsva.a.toFixed(3))})`;
    if (css === lastEmittedRef.current) return;
    lastEmittedRef.current = css;
    onChange(css);
  }, [hsva, hex, rgba, onChange]);

  const setHue = useCallback((h: number) => setHsva(p => ({ ...p, h: clamp(h, 0, 360) })), []);
  const setAlpha = useCallback((a: number) => setHsva(p => ({ ...p, a: clamp(a, 0, 1) })), []);
  const setSV = useCallback((s: number, v: number) => setHsva(p => ({ ...p, s: clamp(s, 0, 100), v: clamp(v, 0, 100) })), []);

  // Saturation/value drag handlers
  const svRef = useRef<HTMLDivElement>(null);
  const svPointerDown = useCallback((e: React.PointerEvent) => {
    if (!svRef.current) return;
    const rect = svRef.current.getBoundingClientRect();
    const update = (clientX: number, clientY: number) => {
      const s = clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
      const v = (1 - clamp((clientY - rect.top) / rect.height, 0, 1)) * 100;
      setSV(s, v);
    };
    update(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [setSV]);

  // Vertical-slider drag helper
  const verticalDrag = useCallback((trackEl: HTMLElement, clientY: number, set: (n01: number) => void) => {
    const rect = trackEl.getBoundingClientRect();
    set(1 - clamp((clientY - rect.top) / rect.height, 0, 1));
  }, []);

  const onHuePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const set = (n: number) => setHue(n * 360);
    verticalDrag(el, e.clientY, set);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => verticalDrag(el, ev.clientY, set);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [setHue, verticalDrag]);

  const onAlphaPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const set = (n: number) => setAlpha(n);
    verticalDrag(el, e.clientY, set);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => verticalDrag(el, ev.clientY, set);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [setAlpha, verticalDrag]);

  const eyedrop = useCallback(async () => {
    // @ts-expect-error EyeDropper is not in TS lib defaults
    if (typeof window === "undefined" || typeof window.EyeDropper === "undefined") return;
    try {
      // @ts-expect-error see above
      const ed = new window.EyeDropper();
      const result = await ed.open();
      const parsed = parseColor(result.sRGBHex);
      if (parsed) setHsva(parsed);
    } catch { /* user cancelled */ }
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => { /* ignore */ });
    }
  }, []);

  const baseHueCss = `hsl(${Math.round(hsva.h)}, 100%, 50%)`;
  const fullColorCss = hsva.a >= 1
    ? `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`
    : `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${Number(hsva.a.toFixed(3))})`;

  return (
    <div
      className={cn(
        "w-[360px] rounded-lg border border-canvas-border bg-canvas-bg shadow-xl",
        "p-3 select-none",
        className,
      )}
    >
      {/* Top: space tabs + actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-0.5 rounded-md bg-canvas-muted p-0.5">
          {(["srgb", "p3"] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSpace(s)}
              className={cn(
                "px-2 h-6 text-[10px] font-medium rounded-[4px] transition-colors",
                space === s
                  ? "bg-canvas-bg text-canvas-fg shadow-sm"
                  : "text-canvas-muted-fg hover:text-canvas-fg",
              )}
            >
              {s === "srgb" ? "sRGB" : "Display P3"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Pick from screen" onClick={eyedrop}>
            <Eyedropper size={12} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Menu">
            <Hamburger size={12} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Close" onClick={onClose}>
              <CloseIcon size={12} />
            </Button>
          )}
        </div>
      </div>

      {/* SV square + alpha + hue */}
      <div className="flex gap-2 mb-3">
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
            className="absolute w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
            style={{
              left: `calc(${hsva.s}% - 6px)`,
              top: `calc(${100 - hsva.v}% - 6px)`,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
            }}
          />
        </div>
        {/* Alpha */}
        <div
          onPointerDown={onAlphaPointer}
          className="relative w-3 h-[200px] rounded-full cursor-pointer overflow-hidden"
          style={{
            background:
              `linear-gradient(to top, transparent, ${baseHueCss}),` +
              `repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 6px 6px`,
          }}
        >
          <div
            className="absolute -left-0.5 w-4 h-1 rounded-sm bg-white pointer-events-none"
            style={{ top: `calc(${(1 - hsva.a) * 100}% - 2px)`, boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}
          />
        </div>
        {/* Hue */}
        <div
          onPointerDown={onHuePointer}
          className="relative w-3 h-[200px] rounded-full cursor-pointer"
          style={{
            background:
              "linear-gradient(to top, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
          }}
        >
          <div
            className="absolute -left-0.5 w-4 h-1 rounded-sm bg-white pointer-events-none"
            style={{ top: `calc(${(1 - hsva.h / 360) * 100}% - 2px)`, boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}
          />
        </div>
      </div>

      {/* Previous / New swatches */}
      <div className="flex h-7 mb-3 rounded-md overflow-hidden border border-canvas-border">
        <div
          className="flex-1"
          style={{ background: `${previous}, repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 8px 8px` as unknown as string }}
          title="Previous"
        />
        <div
          className="flex-1"
          style={{ background: fullColorCss }}
          title="New"
        />
      </div>

      {/* LCH row */}
      <ValueRow
        label="LCH"
        a={Math.round(lcha.l)}
        b={Math.round(lcha.c)}
        c={Math.round(lcha.h)}
        labels={["L", "C", "H"]}
        onCopy={() => copyToClipboard(`lch(${lcha.l.toFixed(0)} ${lcha.c.toFixed(0)} ${lcha.h.toFixed(0)})`)}
      />
      {/* HSL row */}
      <ValueRow
        label="HSL"
        a={Math.round(hsla.h)}
        b={Math.round(hsla.s)}
        c={Math.round(hsla.l)}
        labels={["H", "S", "L"]}
        onCopy={() => copyToClipboard(`hsl(${hsla.h.toFixed(0)} ${hsla.s.toFixed(0)}% ${hsla.l.toFixed(0)}%)`)}
      />
      {/* RGB row */}
      <ValueRow
        label="RGB"
        a={rgba.r}
        b={rgba.g}
        c={rgba.b}
        labels={["R", "G", "B"]}
        onCopy={() => copyToClipboard(`rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`)}
      />

      {/* Hex / opacity pill */}
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
        <ScrubField
          label="HEX"
          value={hex.replace(/^#/, "")}
          onChange={v => {
            const parsed = parseColor("#" + v.replace(/^#/, ""));
            if (parsed) setHsva({ ...parsed, a: hsva.a });
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
    </div>
  );
}

function ValueRow({
  a, b, c, labels, onCopy,
}: { label: string; a: number; b: number; c: number; labels: [string, string, string]; onCopy: () => void; }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1 mb-1.5">
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
    <div className="flex flex-col items-center">
      <div className="w-full h-7 flex items-center justify-center bg-canvas-muted rounded-md text-xs font-mono text-canvas-fg tabular-nums">
        {value}
      </div>
      <span className="text-[9px] uppercase tracking-wider text-canvas-muted-fg mt-0.5">{label}</span>
    </div>
  );
}
