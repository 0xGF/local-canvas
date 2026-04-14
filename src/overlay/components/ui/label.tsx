import * as React from "react";
import { cn } from "../../lib/utils.js";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={cn(
        "text-xs font-medium text-canvas-muted-fg leading-none",
        className
      )}
      {...props}
    />
  );
});
Label.displayName = "Label";

export { Label };
