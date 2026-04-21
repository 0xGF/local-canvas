import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import { ScrubField } from "./scrub-field.js";
import { SelectField } from "./select-field.js";
import { ImageIcon } from "../icons.js";

export type ImageFit = "cover" | "contain" | "fill" | "none";
export type ImageRepeat = "no-repeat" | "repeat" | "repeat-x" | "repeat-y";

export interface ImageFillValue {
  /** URL or data URI. */
  url: string;
  fit: ImageFit;
  /** 0-100, percentage along each axis. */
  positionX: number;
  positionY: number;
  repeat: ImageRepeat;
}

interface ImageFillEditorProps {
  value: ImageFillValue;
  onChange: (next: ImageFillValue) => void;
  className?: string;
}

const FIT_OPTS = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "fill", label: "Fill" },
  { value: "none", label: "None" },
];

const REPEAT_OPTS = [
  { value: "no-repeat", label: "No repeat" },
  { value: "repeat", label: "Tile" },
  { value: "repeat-x", label: "Tile X" },
  { value: "repeat-y", label: "Tile Y" },
];

const CHECKER = "repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 8px 8px";

/** Translate the editor's fit value into the CSS `background-size` keyword. */
export function imageFitToBackgroundSize(fit: ImageFit): string {
  if (fit === "fill") return "100% 100%";
  if (fit === "none") return "auto";
  return fit;
}

/** Build the CSS shorthand-ish chunks for a Fill layer of type=Image. */
export function imageFillToCss(v: ImageFillValue): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
} {
  return {
    backgroundImage: v.url ? `url(${JSON.stringify(v.url)})` : "none",
    backgroundSize: imageFitToBackgroundSize(v.fit),
    backgroundPosition: `${Math.round(v.positionX)}% ${Math.round(v.positionY)}%`,
    backgroundRepeat: v.repeat,
  };
}

/**
 * Inline editor for a CSS image fill — url (text or upload), fit mode,
 * position X/Y and repeat. Parent Fill section owns serialization into
 * Tailwind arbitrary classes via `imageFillToCss`.
 */
export function ImageFillEditor({ value, onChange, className }: ImageFillEditorProps) {
  const [localUrl, setLocalUrl] = useState(value.url);
  const [focused, setFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // External → local sync (skip while typing).
  React.useEffect(() => {
    if (!focused) setLocalUrl(value.url);
  }, [value.url, focused]);

  const commitUrl = useCallback((next: string) => {
    if (next !== value.url) onChange({ ...value, url: next });
  }, [value, onChange]);

  const onFilePicked = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (dataUrl) onChange({ ...value, url: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset so selecting the same file twice still triggers change.
    ev.target.value = "";
  }, [value, onChange]);

  const setFit = useCallback((f: string) => {
    onChange({ ...value, fit: (FIT_OPTS.some(o => o.value === f) ? f : "cover") as ImageFit });
  }, [value, onChange]);

  const setRepeat = useCallback((r: string) => {
    onChange({ ...value, repeat: (REPEAT_OPTS.some(o => o.value === r) ? r : "no-repeat") as ImageRepeat });
  }, [value, onChange]);

  const setX = useCallback((raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    onChange({ ...value, positionX: Math.max(0, Math.min(100, n)) });
  }, [value, onChange]);

  const setY = useCallback((raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    onChange({ ...value, positionY: Math.max(0, Math.min(100, n)) });
  }, [value, onChange]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Preview — checker background so transparent images read correctly. */}
      <div
        aria-label="Image preview"
        className="h-16 rounded-md border border-canvas-border"
        style={{
          backgroundImage: value.url ? `url(${JSON.stringify(value.url)}), ${CHECKER}` : CHECKER,
          backgroundSize: value.url ? `${imageFitToBackgroundSize(value.fit)}, 8px 8px` : "8px 8px",
          backgroundPosition: `${Math.round(value.positionX)}% ${Math.round(value.positionY)}%`,
          backgroundRepeat: `${value.repeat}, repeat`,
        }}
      />

      {/* URL + upload. */}
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <div
          className={cn(
            "flex items-center h-7 rounded-md bg-canvas-muted hover:bg-canvas-muted/80 transition-colors",
            focused && "ring-1 ring-canvas-accent",
          )}
        >
          <span className="h-full flex items-center justify-center shrink-0 px-2 text-canvas-muted-fg">
            <ImageIcon size={11} />
          </span>
          <input
            value={localUrl}
            placeholder="https://…"
            onChange={e => setLocalUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); commitUrl(localUrl); }}
            onKeyDown={e => {
              if (e.key === "Enter") { commitUrl(localUrl); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { setLocalUrl(value.url); (e.target as HTMLInputElement).blur(); }
            }}
            className={cn(
              "flex-1 min-w-0 h-full bg-transparent border-0 outline-none",
              "text-canvas-fg pr-2 font-mono text-xs",
              "placeholder:text-canvas-muted-fg",
            )}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          title="Upload image from your computer"
        >
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFilePicked}
          className="hidden"
          aria-label="Upload image"
        />
      </div>

      {/* Fit + repeat. */}
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField value={value.fit} options={FIT_OPTS} onChange={setFit} title="Fit mode" />
        <SelectField value={value.repeat} options={REPEAT_OPTS} onChange={setRepeat} title="Repeat" />
      </div>

      {/* Position X/Y — only meaningful when the image doesn't cover the box. */}
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField
          label="X"
          value={String(Math.round(value.positionX))}
          onChange={setX}
          title="Horizontal position (%)"
          format={n => String(Math.max(0, Math.min(100, Math.round(n))))}
        />
        <ScrubField
          label="Y"
          value={String(Math.round(value.positionY))}
          onChange={setY}
          title="Vertical position (%)"
          format={n => String(Math.max(0, Math.min(100, Math.round(n))))}
        />
      </div>
    </div>
  );
}
