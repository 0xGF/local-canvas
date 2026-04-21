import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { cn } from "../../lib/utils.js";
import { parseColor, hsvaToRgba, rgbaToHex } from "../../lib/color.js";
import { ColorPickerPopover } from "./color-picker-popover.js";
import { usePortalContainer } from "../../lib/portal-container.js";
import { Tooltip } from "./tooltip.js";

interface ColorFieldProps {
  /** Current color as a CSS string (e.g. "#FF0000", "rgba(...)"). */
  value: string;
  onChange: (next: string) => void;
  /** Optional placeholder shown in the input when value is empty. */
  placeholder?: string;
  className?: string;
  title?: string;
}

const CHECKER = "repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 6px 6px";

/**
 * Color picker pill: [ swatch │ HEX / OPACITY% ]
 *
 * Click the swatch → opens the full ColorPickerPopover.
 * Type into the input → parses hex / rgba / "hex / opacity%".
 *
 * Same height + chrome as ScrubField + SelectField.
 */
export function ColorField({ value, onChange, placeholder, className, title }: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(() => formatDisplay(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Radix portals default to document.body, which is outside our shadow DOM
  // — where Tailwind utilities have no CSS. Anchor to our mount point so the
  // popover inherits the same stylesheet as the rest of the overlay.
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (focused) return;
    setLocal(formatDisplay(value));
  }, [value, focused]);

  // Radix Popover's outside-click detection is broken in shadow DOM — events
  // get retargeted to the shadow host so every click inside the picker looks
  // "outside" to Radix and dismisses the popover on the user's first drag
  // inside the color area. We replaced it with a plain portal + manual
  // dismissal via composedPath, which *does* cross shadow boundaries.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const path = e.composedPath();
      if (popoverRef.current && path.includes(popoverRef.current)) return;
      if (swatchRef.current && path.includes(swatchRef.current)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Position the popover anchored to the swatch the user clicked: opens to
  // the LEFT of the swatch (the panel is on the right edge of the screen,
  // so the picker lands over the iframe without covering other rows in the
  // panel), vertically aligned with the swatch row. Clamps to the viewport
  // with a small margin. Measured in viewport coords via `position: fixed`.
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !swatchRef.current) return;
    const place = () => {
      const sr = swatchRef.current!.getBoundingClientRect();
      const PICKER_W = 368;
      const PICKER_H = 420;
      const gap = 8;
      const margin = 8;
      // Horizontal: sit immediately to the left of the swatch.
      let left = sr.left - PICKER_W - gap;
      if (left < margin) {
        // Not enough room on the left — fall back to right-of-swatch.
        left = sr.right + gap;
        if (left + PICKER_W > window.innerWidth - margin) {
          left = Math.max(margin, window.innerWidth - PICKER_W - margin);
        }
      }
      // Vertical: align the picker's top with the row, then clamp so the
      // bottom doesn't spill below the viewport.
      let top = sr.top;
      if (top + PICKER_H > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - PICKER_H - margin);
      }
      setPopStyle({ position: "fixed", top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const commit = useCallback((raw: string) => {
    // Accept "#abc / 80%" or "abc / 80" or just "abc" or "rgba(...)"
    const [colorPart, alphaPart] = raw.split("/").map(s => s.trim());
    const parsed = parseColor(colorPart.startsWith("#") || colorPart.includes("(") ? colorPart : "#" + colorPart);
    if (!parsed) return;
    const a = alphaPart !== undefined
      ? Math.max(0, Math.min(1, parseFloat(alphaPart) / 100))
      : parsed.a;
    const rgba = hsvaToRgba({ ...parsed, a });
    const css = a >= 1 ? rgbaToHex(rgba) : `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${Number(a.toFixed(3))})`;
    onChange(css);
  }, [onChange]);

  const pill = (
    <div
      className={cn(
        // `min-w-0` so this pill shrinks in a `1fr` grid column.
        "flex items-center h-7 min-w-0 rounded-md text-xs transition-colors",
        "bg-canvas-muted hover:bg-canvas-muted/80",
        (focused || open) && "ring-1 ring-canvas-accent",
        className,
      )}
    >
      <button
        ref={swatchRef}
        type="button"
        className="h-full pl-1.5 pr-1 flex items-center shrink-0"
        aria-label="Open color picker"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span
          className="w-4 h-4 rounded-[3px] border border-canvas-border"
          style={{ background: `${value || "transparent"}, ${CHECKER}` as unknown as string }}
        />
      </button>
      {open && portalContainer && ReactDOM.createPortal(
        <div
          ref={popoverRef}
          // `pointerEvents: auto` is load-bearing: the shadow-DOM mount
          // point sets `pointer-events: none` so it doesn't swallow iframe
          // events, and children of the portal inherit that unless we opt
          // back in.
          style={{ ...popStyle, zIndex: 2147483647, pointerEvents: "auto" }}
          // Stop pointerdowns inside the popover from reaching the document
          // listener above — belt-and-suspenders so the composedPath check
          // isn't the only thing keeping the popover alive during drag.
          onPointerDown={e => e.stopPropagation()}
        >
          <ColorPickerPopover
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        </div>,
        portalContainer,
      )}
      <input
        ref={inputRef}
        value={local}
        placeholder={placeholder ?? "FFFFFF / 100%"}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(local); }}
        onKeyDown={e => {
          if (e.key === "Enter") { commit(local); inputRef.current?.blur(); }
          if (e.key === "Escape") { setLocal(formatDisplay(value)); inputRef.current?.blur(); }
        }}
        className={cn(
          "flex-1 min-w-0 h-full bg-transparent border-0 outline-none",
          "text-canvas-fg pl-1 pr-2 font-mono uppercase",
          "placeholder:text-canvas-muted-fg placeholder:normal-case",
        )}
      />
    </div>
  );
  if (!title) return pill;
  return <Tooltip content={title} disabled={focused || open}>{pill}</Tooltip>;
}

function formatDisplay(value: string): string {
  if (!value) return "";
  const parsed = parseColor(value);
  if (!parsed) return value;
  const rgba = hsvaToRgba(parsed);
  const hex = rgbaToHex(rgba).replace(/^#/, "");
  const pct = Math.round(parsed.a * 100);
  return `${hex} / ${pct}%`;
}
