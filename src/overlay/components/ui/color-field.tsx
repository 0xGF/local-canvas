import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
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
  // Radix portals default to document.body, which is outside our shadow DOM
  // — where Tailwind utilities have no CSS. Anchor to our mount point so the
  // popover inherits the same stylesheet as the rest of the overlay.
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (focused) return;
    setLocal(formatDisplay(value));
  }, [value, focused]);

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
        focused && "ring-1 ring-canvas-accent",
        className,
      )}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="h-full pl-1.5 pr-1 flex items-center shrink-0"
            aria-label="Open color picker"
          >
            <span
              className="w-4 h-4 rounded-[3px] border border-canvas-border"
              style={{ background: `${value || "transparent"}, ${CHECKER}` as unknown as string }}
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal container={portalContainer}>
          <Popover.Content side="bottom" align="end" sideOffset={6} className="z-[2147483647]" collisionPadding={8}>
            <ColorPickerPopover
              value={value}
              onChange={onChange}
              onClose={() => setOpen(false)}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
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
