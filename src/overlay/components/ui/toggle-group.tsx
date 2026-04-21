import React from "react";
import { cn } from "../../lib/utils.js";
import { Tooltip } from "./tooltip.js";

interface ToggleItem {
  value: string;
  icon?: React.ReactNode;
  label?: string;
  title?: string;
}

interface ToggleGroupProps {
  value: string;
  items: ToggleItem[];
  onChange: (value: string) => void;
  /** When true, renders a label next to the icon and stretches to fill. */
  showLabels?: boolean;
  className?: string;
}

export const ToggleGroup = React.memo(function ToggleGroup({
  value, items, onChange, showLabels = false, className,
}: ToggleGroupProps) {
  return (
    <div
      className={cn(
        "flex gap-px p-0.5 rounded-md bg-canvas-muted",
        className,
      )}
    >
      {items.map(item => {
        const active = item.value === value;
        const tipContent = item.title ?? (showLabels ? undefined : item.label ?? item.value);
        const btn = (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            aria-label={item.label ?? item.value}
            onClick={() => onChange(item.value === value ? "" : item.value)}
            className={cn(
              "flex items-center justify-center gap-1 h-6 rounded transition-colors",
              "text-[10px] cursor-pointer select-none",
              showLabels ? "flex-1 px-2" : "min-w-[30px] px-1.5",
              active
                ? "bg-canvas-accent text-canvas-accent-fg font-medium shadow-sm"
                : "text-canvas-muted-fg hover:bg-canvas-muted/60 hover:text-canvas-fg",
            )}
          >
            {item.icon}
            {showLabels && (
              <span className="whitespace-nowrap">{item.label ?? item.value}</span>
            )}
          </button>
        );
        if (!tipContent) return btn;
        return <Tooltip key={item.value} content={tipContent}>{btn}</Tooltip>;
      })}
    </div>
  );
});
