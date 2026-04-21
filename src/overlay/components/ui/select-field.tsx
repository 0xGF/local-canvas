import * as React from "react";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "../../lib/utils.js";
import { Tooltip } from "./tooltip.js";
import { usePortalContainer } from "../../lib/portal-container.js";

export interface SelectOption {
  value: string;
  label: string;
  /** Optional small icon shown before the label inside the menu. */
  icon?: React.ReactNode;
}

/** Sentinel to render a horizontal divider between option groups. */
export type SelectSeparator = { separator: true };

export type SelectItem = SelectOption | SelectSeparator;

const isSeparator = (item: SelectItem): item is SelectSeparator =>
  (item as SelectSeparator).separator === true;

interface SelectFieldProps {
  /** Optional left-side icon, matching the ScrubField label slot. */
  icon?: React.ReactNode;
  value: string;
  options: SelectItem[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
  /** When set, shown instead of the matched option label (e.g. "Mixed"). */
  displayOverride?: string;
}

/**
 * Dropdown variant of the ScrubField pill. Same height, same chrome, same
 * focus treatment — but the middle is a button showing the current label
 * and the chevron is always present.
 *
 * Used in: Blend mode, Border side, Filter type, Guides type.
 */
export function SelectField({
  icon,
  value,
  options,
  onChange,
  placeholder,
  className,
  title,
  displayOverride,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  // Panels use `overflow: hidden`, so an absolutely-positioned menu inside
  // the pill gets clipped. Portal through Radix to the shadow-DOM mount so
  // the dropdown floats above all container overflow.
  const portalContainer = usePortalContainer();

  const current = options.find((o): o is SelectOption => !isSeparator(o) && o.value === value);
  const display = displayOverride ?? current?.label ?? placeholder ?? "";

  const pill = (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        // Expose `title` as `data-title` so accessibility + tests can find
        // the field without stacking the native tooltip on top of Radix's.
        data-title={title}
        aria-label={title}
        className={cn(
          // `min-w-0` so this pill shrinks in a `1fr` grid column (see ScrubField).
          "relative flex items-center h-7 min-w-0 rounded-md text-xs transition-colors",
          "bg-canvas-muted hover:bg-canvas-muted/80",
          open && "ring-1 ring-canvas-accent",
          className,
        )}
      >
        {icon !== undefined && (
          <span className="h-full flex items-center justify-center shrink-0 px-2 text-[11px] text-canvas-muted-fg select-none">
            {icon}
          </span>
        )}
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-haspopup="listbox"
            className={cn(
              "flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-left",
              "text-canvas-fg font-mono pr-1 truncate",
              icon === undefined && "pl-2",
            )}
          >
            {display || <span className="text-canvas-muted-fg">{placeholder}</span>}
          </button>
        </Popover.Trigger>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Open options"
            className="h-full px-1.5 flex items-center justify-center shrink-0 text-canvas-muted-fg hover:text-canvas-fg"
          >
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" stroke="currentColor" aria-hidden>
              <path d="M0.75 1.5L4 4.75L7.25 1.5" />
            </svg>
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal container={portalContainer}>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          role="listbox"
          className={cn(
            // `pointer-events-auto` is load-bearing: the shadow-DOM mount
            // point sets `pointer-events: none` so it doesn't swallow iframe
            // events, and portaled popovers inherit that unless they opt in.
            "pointer-events-auto z-[2147483647] min-w-[var(--radix-popover-trigger-width)]",
            "rounded-md border border-canvas-border bg-canvas-bg shadow-md",
            "py-1 text-xs max-h-72 overflow-y-auto",
          )}
        >
          {options.map((opt, i) => {
            if (isSeparator(opt)) {
              return (
                <div
                  key={`sep-${i}`}
                  role="separator"
                  aria-orientation="horizontal"
                  className="my-1 h-[1px] bg-canvas-border"
                />
              );
            }
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-1 whitespace-nowrap flex items-center gap-2",
                  "text-canvas-fg hover:bg-canvas-muted",
                  opt.value === value && "bg-canvas-muted",
                )}
              >
                {opt.icon !== undefined && (
                  <span className="text-canvas-muted-fg shrink-0">{opt.icon}</span>
                )}
                {opt.label}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
  if (!title) return pill;
  return <Tooltip content={title} disabled={open}>{pill}</Tooltip>;
}
