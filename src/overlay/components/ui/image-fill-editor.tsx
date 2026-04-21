import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils.js";
import { clamp } from "../../lib/color.js";
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

// Typed as const tuples so SelectField's string callback can be narrowed back
// to the literal union without an `as ImageFit` cast.
const FIT_OPTS: readonly { value: ImageFit; label: string }[] = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "fill", label: "Fill" },
  { value: "none", label: "None" },
];

const REPEAT_OPTS: readonly { value: ImageRepeat; label: string }[] = [
  { value: "no-repeat", label: "No repeat" },
  { value: "repeat", label: "Tile" },
  { value: "repeat-x", label: "Tile X" },
  { value: "repeat-y", label: "Tile Y" },
];

const CHECKER = "repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 8px 8px";
const CHECKER_SIZE = "8px 8px";

const pct = (n: number) => String(Math.round(clamp(n, 0, 100)));
const formatPct = (n: number) => pct(n);

function narrow<T extends string>(value: string, options: readonly { value: T }[], fallback: T): T {
  return options.some(o => o.value === value) ? (value as T) : fallback;
}

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
    // Single-quote the URL: the resulting class lands inside JSX
    // `className="..."`, and a double quote here would terminate the
    // attribute mid-write. Strip any single quotes in the URL itself —
    // they're never valid in a real URL anyway.
    backgroundImage: v.url ? `url('${v.url.replace(/'/g, "")}')` : "none",
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
  const urlInputRef = useRef<HTMLInputElement>(null);

  // External → local sync (skip while typing).
  useEffect(() => {
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

  const setFit = useCallback(
    (f: string) => onChange({ ...value, fit: narrow(f, FIT_OPTS, "cover") }),
    [value, onChange],
  );
  const setRepeat = useCallback(
    (r: string) => onChange({ ...value, repeat: narrow(r, REPEAT_OPTS, "no-repeat") }),
    [value, onChange],
  );

  const setPosition = useCallback((axis: "positionX" | "positionY", raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    onChange({ ...value, [axis]: clamp(n, 0, 100) });
  }, [value, onChange]);

  const backgroundImage = value.url ? `url(${JSON.stringify(value.url)}), ${CHECKER}` : CHECKER;
  const backgroundSize = value.url ? `${imageFitToBackgroundSize(value.fit)}, ${CHECKER_SIZE}` : CHECKER_SIZE;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Preview — checker background so transparent images read correctly. */}
      <div
        aria-label="Image preview"
        className="h-16 rounded-md border border-canvas-border"
        style={{
          backgroundImage,
          backgroundSize,
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
            ref={urlInputRef}
            value={localUrl}
            placeholder="https://…"
            onChange={e => setLocalUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); commitUrl(localUrl); }}
            onKeyDown={e => {
              if (e.key === "Enter") { commitUrl(localUrl); urlInputRef.current?.blur(); }
              else if (e.key === "Escape") { setLocalUrl(value.url); urlInputRef.current?.blur(); }
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
          value={pct(value.positionX)}
          onChange={v => setPosition("positionX", v)}
          title="Horizontal position (%)"
          format={formatPct}
        />
        <ScrubField
          label="Y"
          value={pct(value.positionY)}
          onChange={v => setPosition("positionY", v)}
          title="Vertical position (%)"
          format={formatPct}
        />
      </div>
    </div>
  );
}
