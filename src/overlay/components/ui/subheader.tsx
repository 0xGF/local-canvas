import * as React from "react";
import { cn } from "../../lib/utils.js";

interface SubheaderProps {
  children: React.ReactNode;
  /** Trailing ghost icon-buttons (typically minus to remove the feature, plus to add). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Inline sub-section header rendered inside a Section.
 * e.g. "Flex" inside the Layout section.
 */
export function Subheader({ children, actions, className }: SubheaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between mt-3 first:mt-0 mb-1 h-6",
        className,
      )}
    >
      <span className="text-[11px] font-medium text-canvas-muted-fg select-none">
        {children}
      </span>
      {actions && (
        <div className="flex items-center gap-0.5">
          {actions}
        </div>
      )}
    </div>
  );
}
