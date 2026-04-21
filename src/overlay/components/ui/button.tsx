import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.js";
import { Tooltip } from "./tooltip.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-canvas-accent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-canvas-accent text-canvas-accent-fg shadow hover:bg-canvas-accent/90",
        destructive:
          "bg-canvas-destructive text-white shadow-sm hover:bg-canvas-destructive/90",
        outline:
          "border border-canvas-border bg-canvas-bg shadow-sm hover:bg-canvas-muted hover:text-canvas-fg",
        secondary:
          "bg-canvas-muted text-canvas-fg shadow-sm hover:bg-canvas-muted/80",
        ghost:
          "hover:bg-canvas-muted hover:text-canvas-fg",
        link: "text-canvas-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 py-1",
        sm: "h-7 rounded-md px-2 text-xs",
        lg: "h-9 rounded-md px-4",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, title, "aria-label": ariaLabel, ...props }, ref) => {
    // Intercept native `title` and render our custom tooltip (fast show +
    // consistent styling). Mirror the title into `aria-label` (when none is
    // set) so screen readers + testing-library accessible queries still find
    // the control. Native `title` is intentionally NOT re-applied — Radix
    // drives the visual tooltip; keeping the attribute would cause a
    // duplicate browser tooltip at ~600ms.
    const btn = (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        {...props}
      />
    );
    if (!title) return btn;
    return <Tooltip content={title}>{btn}</Tooltip>;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
