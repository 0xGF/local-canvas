import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "../icons.js";
import { ExpandY } from "../../utils/motion-presets.js";
import { cn } from "../../lib/utils.js";
import { usePortalContainer } from "../../lib/portal-container.js";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Optional hover-explained warning shown as a ⚠ next to the chevron. */
  warning?: string;
  /**
   * Optional right-aligned slot in the header (before the chevron). Use for
   * per-section toggles — e.g. the linked/split icon on Radius — so they
   * sit next to the title instead of occupying a content row. Clicks on
   * this slot don't expand/collapse the section.
   */
  headerAction?: React.ReactNode;
  /**
   * When this key changes (e.g. on element selection), the section resets
   * its open state to `hasValue` (if provided) or `defaultOpen`. After that,
   * the user can still toggle manually until the next key change.
   */
  autoOpenKey?: unknown;
  /**
   * When `autoOpenKey` changes, open the section iff this is true. Lets
   * sections auto-expand for the current selection when relevant values are
   * set, and collapse otherwise.
   */
  hasValue?: boolean;
}

export function Section({ title, children, defaultOpen = true, warning, headerAction, autoOpenKey, hasValue }: SectionProps) {
  // Track the last-seen autoOpenKey alongside the open state so we can reset
  // synchronously during render when the selection changes. Doing this in a
  // useEffect would leave the section in the previous open state for one
  // paint, which flashes the wrong body at the user.
  const [state, setState] = useState(() => ({
    key: autoOpenKey,
    open: hasValue ?? defaultOpen,
  }));
  if (autoOpenKey !== undefined && state.key !== autoOpenKey) {
    setState({ key: autoOpenKey, open: hasValue ?? defaultOpen });
  }
  const open = state.open;
  const setOpen = (next: boolean) => setState(prev => ({ ...prev, open: next }));
  const [warningHovered, setWarningHovered] = useState(false);
  const warningRef = useRef<HTMLSpanElement>(null);
  const portalContainer = usePortalContainer();
  // Position the warning tooltip in viewport coords, updated on hover so it
  // stays pinned to the icon even if the panel scrolls right before the
  // tooltip shows. The in-place `absolute` anchor the tooltip used to use
  // got clipped by the panel's `overflow-x-hidden` scroll container — the
  // text's first few characters were cut off on the left. Portaling into
  // the shadow-root container + fixed positioning sidesteps that entirely.
  const [tooltipPos, setTooltipPos] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!warningHovered || !warningRef.current) { setTooltipPos(null); return; }
    const r = warningRef.current.getBoundingClientRect();
    setTooltipPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }, [warningHovered]);

  return (
    <div className="border-b border-canvas-border/60 last:border-b-0">
      <div
        className={cn(
          "flex items-center justify-between w-full min-h-8 px-3 py-2",
          "hover:bg-canvas-muted/60 transition-colors select-none",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex-1 text-left cursor-pointer bg-transparent border-0 p-0 min-w-0"
        >
          <span className="text-[11px] font-semibold text-canvas-fg">{title}</span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {warning && (
            <span
              ref={warningRef}
              onClick={e => e.stopPropagation()}
              onMouseEnter={() => setWarningHovered(true)}
              onMouseLeave={() => setWarningHovered(false)}
              className="relative text-[12px] leading-none text-yellow-400 cursor-help px-0.5"
              aria-label={warning}
            >
              ⚠
              {warningHovered && tooltipPos && portalContainer && createPortal(
                <span
                  className={cn(
                    "fixed z-[2147483647] w-56",
                    "bg-canvas-bg border border-yellow-400 rounded px-2 py-1.5",
                    "text-[10px] leading-snug font-normal text-canvas-fg",
                    "shadow-md pointer-events-none",
                  )}
                  style={{ top: tooltipPos.top, right: tooltipPos.right }}
                >
                  {warning}
                </span>,
                portalContainer,
              )}
            </span>
          )}
          {headerAction && (
            <span
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              className="flex items-center"
            >
              {headerAction}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Collapse section" : "Expand section"}
            className={cn(
              "inline-flex items-center text-canvas-muted-fg",
              "bg-transparent border-0 p-0 cursor-pointer transition-transform duration-150",
              open && "rotate-90",
            )}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
      <ExpandY open={open}>
        <div className="flex flex-col gap-1.5 px-3 pt-1 pb-3">{children}</div>
      </ExpandY>
    </div>
  );
}

export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 min-h-[26px]">
      <span className="text-[10px] text-canvas-muted-fg w-11 shrink-0 font-normal">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] text-canvas-muted-fg uppercase tracking-wider font-semibold mt-0.5 -mb-0.5">
      {children}
    </div>
  );
}
