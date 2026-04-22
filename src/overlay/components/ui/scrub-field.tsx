import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "../../lib/utils.js";
import { Tooltip } from "./tooltip.js";
import { usePortalContainer } from "../../lib/portal-container.js";

export interface ScrubPreset {
  value: string;
  label?: string;
}

interface ScrubFieldProps {
  /** Draggable label/icon on the left. Pointer-drag up/down scrubs the value. */
  label?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** If provided, a chevron appears that opens a preset menu. */
  presets?: ScrubPreset[];
  /** Pixels of pointer travel per unit change. Default 2 (1 unit per 2px). */
  scrubStep?: number;
  /** Called with parsed number for scrub; defaults to parseFloat. */
  parse?: (v: string) => number;
  /** Called to format numeric scrub output back to string. Default: round + String. */
  format?: (n: number) => string;
  className?: string;
  title?: string;
}

/**
 * Unified numeric field matching the Framer/Figma pattern:
 *  - Draggable icon/label (cursor ns-resize, scrubs value vertically)
 *  - Text input in the middle (accepts free-form values)
 *  - Optional preset chevron on the right
 *
 * Values that can't be parsed as numbers (e.g. "Fit", "Fill") are preserved —
 * scrubbing is just disabled until the value becomes numeric.
 */
export const ScrubField = React.memo(function ScrubField({
  label,
  value,
  onChange,
  placeholder,
  presets,
  scrubStep = 2,
  parse = v => parseFloat(v),
  format = n => String(Math.round(n)),
  className,
  title,
}: ScrubFieldProps) {
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef<string | null>(null);

  // Sync external → local unless user is mid-edit
  useEffect(() => {
    if (focused || dragging) return;
    if (committedRef.current !== null && committedRef.current !== value) return;
    committedRef.current = null;
    setLocal(value);
  }, [value, focused, dragging]);

  const commit = useCallback((raw: string) => {
    if (raw !== value) {
      committedRef.current = raw;
      onChange(raw);
    }
  }, [value, onChange]);

  // Shared scrub session. `deadzone` defers engagement until the pointer has
  // moved vertically by N px — used by the input handler so a normal
  // click-to-focus still works, while a vertical drag turns into a scrub.
  const beginScrub = useCallback((startY: number, startV: number, deadzone: number) => {
    let engaged = deadzone === 0;
    let pending: string | null = null;
    let lastEmitted: string | null = null;
    let rafId: number | null = null;
    if (engaged) {
      setDragging(true);
      document.body.style.cursor = "ns-resize";
    }
    const flush = () => {
      rafId = null;
      if (pending === null || pending === lastEmitted) return;
      lastEmitted = pending;
      committedRef.current = pending;
      setLocal(pending);
      onChange(pending);
    };
    const onMove = (ev: PointerEvent) => {
      const dy = startY - ev.clientY; // drag up = +
      if (!engaged) {
        if (Math.abs(dy) < deadzone) return;
        engaged = true;
        setDragging(true);
        document.body.style.cursor = "ns-resize";
        // Releasing focus avoids the input swallowing the rest of the drag
        // as a text selection.
        inputRef.current?.blur();
      }
      const shiftMul = ev.shiftKey ? 10 : 1;
      const next = startV + (dy / scrubStep) * shiftMul;
      pending = format(next);
      if (rafId === null) rafId = requestAnimationFrame(flush);
    };
    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        flush();
      }
      if (engaged) {
        setDragging(false);
        document.body.style.cursor = "";
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [onChange, format, scrubStep]);

  const handleLabelDown = useCallback((e: React.PointerEvent) => {
    const num = parse(value);
    if (!Number.isFinite(num)) return;
    e.preventDefault();
    beginScrub(e.clientY, num, 0);
  }, [value, parse, beginScrub]);

  // Drag the input itself to scrub — gated by a deadzone so clicking to
  // focus / select text still works. Only engages when the field already
  // contains a numeric value.
  const handleInputDown = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    if (focused) return;
    const num = parse(value);
    if (!Number.isFinite(num)) return;
    beginScrub(e.clientY, num, 4);
  }, [focused, value, parse, beginScrub]);

  // Wheel over the scrub label also changes the value — same semantics as
  // arrow keys (1 / 10 with shift). Only runs when the value parses as a
  // number, so free-form inputs like "auto" / "Fit" remain scrollable.
  const handleLabelWheel = useCallback((e: React.WheelEvent) => {
    const num = parse(local);
    if (!Number.isFinite(num)) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const step = e.shiftKey ? 10 : 1;
    const out = format(num + dir * step);
    committedRef.current = out;
    setLocal(out);
    onChange(out);
  }, [local, onChange, parse, format]);

  // Radix Popover owns outside-click dismissal for the preset menu.
  const portalContainer = usePortalContainer();

  const pill = (
    <div
      ref={wrapRef}
      // Expose `title` as `data-title` + `aria-label` for accessibility +
      // tests. Native `title` stays off so it doesn't clash with Tooltip.
      data-title={title}
      aria-label={title}
      className={cn(
        // `min-w-0` lets this pill shrink inside a `grid-cols-[1fr_*]` parent.
        // Without it, the input's intrinsic size (~200px) makes 1fr columns
        // blow past their allotted width and overflow the panel.
        "relative group flex items-center h-7 min-w-0 rounded-md text-xs transition-colors",
        "bg-canvas-muted hover:bg-canvas-muted/80",
        focused && "ring-1 ring-canvas-accent",
        className,
      )}
    >
      {label !== undefined && (
        <span
          role="slider"
          aria-label="Scrub to change value"
          onPointerDown={handleLabelDown}
          onWheel={handleLabelWheel}
          className={cn(
            "h-full flex items-center justify-center shrink-0 px-2 select-none",
            "text-[11px] text-canvas-muted-fg",
            Number.isFinite(parse(value)) ? "cursor-ns-resize" : "cursor-default",
          )}
        >
          {label}
        </span>
      )}
      <input
        ref={inputRef}
        value={local}
        placeholder={placeholder}
        onPointerDown={handleInputDown}
        onWheel={handleLabelWheel}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(local); }}
        onKeyDown={e => {
          if (e.key === "Enter") { commit(local); inputRef.current?.blur(); }
          if (e.key === "Escape") { setLocal(value); inputRef.current?.blur(); }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            const num = parse(local);
            if (!Number.isFinite(num)) return;
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const next = format(num + (e.key === "ArrowUp" ? step : -step));
            setLocal(next);
            onChange(next);
          }
        }}
        className={cn(
          "flex-1 min-w-0 h-full bg-transparent border-0 outline-none",
          "text-canvas-fg px-1 font-mono",
          "placeholder:text-canvas-muted-fg",
          label === undefined && "pl-2",
          !presets && "pr-2",
        )}
      />
      {presets && presets.length > 0 && (
        // Portaled so the preset menu isn't clipped by scrolling ancestors
        // (the properties panel uses `overflow: hidden` on its scroller).
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-haspopup="menu"
              className={cn(
                "h-full px-1.5 flex items-center justify-center shrink-0",
                "text-canvas-muted-fg hover:text-canvas-fg",
              )}
            >
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none" stroke="currentColor" aria-hidden>
                <path d="M0.75 1.5L4 4.75L7.25 1.5" />
              </svg>
            </button>
          </Popover.Trigger>
          <Popover.Portal container={portalContainer}>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={4}
              collisionPadding={8}
              role="menu"
              className={cn(
                // See SelectField: portaled popover must opt back into
                // pointer events since the shadow-DOM mount point disables
                // them.
                "pointer-events-auto z-[2147483647] min-w-[var(--radix-popover-trigger-width)]",
                "rounded-md border border-canvas-border bg-canvas-bg shadow-md",
                "py-1 text-xs",
              )}
            >
              {presets.map(p => (
                <button
                  key={p.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onChange(p.value);
                    setMenuOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1 whitespace-nowrap",
                    "text-canvas-fg hover:bg-canvas-muted",
                    value === p.value && "bg-canvas-muted",
                  )}
                >
                  {p.label ?? p.value}
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
  if (!title) return pill;
  return <Tooltip content={title} disabled={focused || dragging || menuOpen}>{pill}</Tooltip>;
});
