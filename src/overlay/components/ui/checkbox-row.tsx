import * as React from "react";
import { cn } from "../../lib/utils.js";

interface CheckboxRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  /** Optional kbd hint shown right-aligned in muted mono (e.g. ⌥ C). */
  kbd?: string;
  className?: string;
}

/**
 * 14px rounded checkbox + label + optional kbd hint.
 * Used wherever a section needs a single boolean toggle with a label.
 */
export function CheckboxRow({ checked, onChange, label, kbd, className }: CheckboxRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-2 w-full h-7 rounded-md px-1 -mx-1",
        "text-canvas-fg hover:bg-canvas-muted/60 transition-colors",
        className,
      )}
    >
      <span
        className={cn(
          "w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors",
          checked
            ? "bg-canvas-accent border-canvas-accent"
            : "bg-transparent border-canvas-border group-hover:border-canvas-muted-fg",
        )}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-canvas-accent-fg" aria-hidden>
            <path d="M1.5 4.5L3.6 6.6L7.5 2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-xs flex-1 text-left select-none">{label}</span>
      {kbd && (
        <span className="text-[10px] font-mono text-canvas-muted-fg select-none">
          {kbd}
        </span>
      )}
    </button>
  );
}
