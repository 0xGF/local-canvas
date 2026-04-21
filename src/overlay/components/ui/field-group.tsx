import * as React from "react";
import { cn } from "../../lib/utils.js";

interface FieldGroupProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps multiple ScrubField (or similar pill) children so they render as a
 * single connected pill with subtle 1px dividers between fields.
 *
 * Children should keep their own internal padding but they will lose their
 * outer rounded corners — this group owns the border + radius.
 *
 * Used in: Shadow X/Y/Blur/Spread, Inner shadow X/Y/Blur/Spread.
 */
export function FieldGroup({ children, className }: FieldGroupProps) {
  return (
    <div
      className={cn(
        "flex items-center h-7 rounded-md bg-canvas-muted overflow-hidden",
        "[&>*]:!bg-transparent [&>*]:!rounded-none [&>*]:flex-1 [&>*]:h-full",
        "[&>*]:border-l [&>*]:border-canvas-border first:[&>*]:border-l-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
