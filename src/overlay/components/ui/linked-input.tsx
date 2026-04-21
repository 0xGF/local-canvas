import * as React from "react";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";

export type LinkMode = "linked" | "split";

interface LinkedInputProps {
  mode: LinkMode;
  onModeChange: (mode: LinkMode) => void;
  /** Render-prop: receives current mode, returns the row(s) to display. */
  children: (mode: LinkMode) => React.ReactNode;
  /** Icon for the trailing toggle button when in linked mode. */
  splitIcon: React.ReactNode;
  /** Icon for the trailing toggle button when in split mode. */
  linkIcon?: React.ReactNode;
  /** Tooltip text for the toggle. */
  toggleTitle?: string;
  className?: string;
}

/**
 * Toggle wrapper for properties that have a "linked" (single value across multiple
 * targets) and "split" (per-target individual values) mode.
 *
 * Used in:
 *   - Gap (linked → gap-x / gap-y)
 *   - Padding (2-value px/py → 4-value pt/pr/pb/pl)
 *   - Radius (single → per-corner tl/tr/bl/br)
 */
export function LinkedInput({
  mode,
  onModeChange,
  children,
  splitIcon,
  linkIcon,
  toggleTitle,
  className,
}: LinkedInputProps) {
  return (
    <div className={cn("grid grid-cols-[1fr_auto] gap-1.5 items-start", className)}>
      <div className="min-w-0">{children(mode)}</div>
      <Button
        variant="ghost"
        size="icon"
        title={toggleTitle ?? (mode === "linked" ? "Split" : "Link")}
        onClick={() => onModeChange(mode === "linked" ? "split" : "linked")}
        className={cn(
          "h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg",
          mode === "split" && "text-canvas-fg bg-canvas-muted",
        )}
      >
        {mode === "linked" ? splitIcon : (linkIcon ?? splitIcon)}
      </Button>
    </div>
  );
}
