import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-canvas-accent text-canvas-accent-fg",
        secondary:
          "border-transparent bg-canvas-muted text-canvas-fg",
        outline: "text-canvas-fg border-canvas-border",
        destructive:
          "border-transparent bg-canvas-destructive text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
