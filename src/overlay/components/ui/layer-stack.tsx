import * as React from "react";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import { Eye, EyeOff, Minus } from "../icons.js";

export interface LayerControl<T> {
  id: string;
  data: T;
  visible: boolean;
}

interface LayerStackProps<T> {
  layers: LayerControl<T>[];
  onVisibilityChange: (id: string, visible: boolean) => void;
  onRemove: (id: string) => void;
  /** Render-prop for each layer's body (everything except the trailing actions). */
  renderLayer: (layer: LayerControl<T>) => React.ReactNode;
  /** Right-side trailing actions slot (gets visibility + remove appended). */
  className?: string;
}

/**
 * Repeatable stacked layers — handles any section that supports multiple
 * layers of the same property type (Fill, Border, Shadow, Inner shadow, Filters).
 *
 * Each layer renders its body via renderLayer, then the standard visibility +
 * remove icon-buttons appear on the right.
 *
 * The "+" add-action lives on the parent Section header, not here.
 */
export function LayerStack<T>({
  layers,
  onVisibilityChange,
  onRemove,
  renderLayer,
  className,
}: LayerStackProps<T>) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {layers.map(layer => (
        <div
          key={layer.id}
          className={cn(
            "flex flex-col gap-1.5",
            !layer.visible && "opacity-50",
          )}
        >
          <div className="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
            <div className="min-w-0">{renderLayer(layer)}</div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg"
              title={layer.visible ? "Hide" : "Show"}
              onClick={() => onVisibilityChange(layer.id, !layer.visible)}
            >
              {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg"
              title="Remove"
              onClick={() => onRemove(layer.id)}
            >
              <Minus size={12} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
