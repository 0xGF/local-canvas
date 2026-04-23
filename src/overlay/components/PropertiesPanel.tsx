import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useReadonlyStyleStore } from "../stores/readonly-style-store.js";
import { useClassHelpers } from "../hooks/useClassHelpers.js";
import { useSelectionColors, type ColorGroup } from "../hooks/useSelectionColors.js";
import { sourceStyleHasProperty } from "../utils/inline-style-source.js";
import { getCachedStyle } from "../utils/style-cache.js";
import { setStyleProp } from "../utils/dom-style.js";
import { Section, SubLabel } from "./ui/section.js";
import { ToggleGroup } from "./ui/toggle-group.js";
import { AlignmentPicker } from "./ui/alignment-picker.js";
import { Button } from "./ui/button.js";
import { ScrubField } from "./ui/scrub-field.js";
import { Subheader } from "./ui/subheader.js";
import { LinkedInput, type LinkMode } from "./ui/linked-input.js";
import { CheckboxRow } from "./ui/checkbox-row.js";
import { SelectField } from "./ui/select-field.js";
import { FlipHorizontal, FlipVertical, Minus, SlidersHorizontal } from "./icons.js";
import * as Popover from "@radix-ui/react-popover";
import { usePortalContainer } from "../lib/portal-container.js";
import { cn } from "../lib/utils.js";
import { radiusSuffixToPx, pxToRadiusSuffix } from "../lib/tailwind-length.js";
import {
  DISPLAY_OPTS, FLEX_DIR_OPTS,
  OPACITY_MAP,
  ALIGN_OPTIONS,
  SHADOW_PRESETS, POSITION_OPTIONS, OVERFLOW_OPTIONS, Z_INDEX_PRESETS, SIZE_PRESETS,
  GRID_COLS_PRESETS, FLEX_ITEM_PRESETS,
  BORDER_STYLE_PRESETS,
  INSET_PRESETS,
  SPACING_PRESETS, FONT_SIZE_PRESETS, BORDER_WIDTH_PRESETS, RADIUS_PRESETS,
  LEADING_PRESETS, TRACKING_PRESETS,
} from "./PropertiesPanel.constants.js";
import {
  ASPECT_RATIO_PRESETS,
  OBJECT_FIT_OPTIONS, OBJECT_POSITION_PRESETS,
  FLEX_WRAP_OPTIONS, ALIGN_CONTENT_OPTIONS,
  BLEND_MODE_OPTIONS,
} from "./PropertiesPanel.presets.js";
import { Slider } from "./ui/slider.js";
import { ColorField } from "./ui/color-field.js";
import { FieldGroup } from "./ui/field-group.js";
import { GradientEditor, gradientToCss, type GradientValue } from "./ui/gradient-editor.js";
import { ImageFillEditor, imageFillToCss, type ImageFillValue } from "./ui/image-fill-editor.js";
import {
  X,
  MoveRight, MoveDown,
  Square, Columns3, Grid3x3, Eye, EyeOff, Plus, BorderAll,
  CircleDot,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from "./icons.js";
import { THEME } from "../theme.js";
import { arbitraryColorValue, clearInlineAfterClassUpdate, type ClassHelpers, type Sel } from "./properties/shared.js";

// Each section now lives in its own file under `./properties/`. They're
// imported eagerly (rather than via `React.lazy`) because the synchronous
// test harness — 77 `mount()` call sites — queries the DOM immediately
// after render and doesn't await Suspense. Code organisation is the win
// here; chunking can come back if/when the tests move to async flushing.
import { ShadowSection, InnerShadowSection } from "./properties/shadow-section.js";
import { TransformSection } from "./properties/transform-section.js";
import { BlendingSection } from "./properties/blending-section.js";
import { TypographySection } from "./properties/typography-section.js";
import { SelectionColorsSection } from "./properties/selection-colors-section.js";
import { FiltersSection, BackdropFiltersSection } from "./properties/filters-section.js";
import { TransitionsSection } from "./properties/transitions-section.js";
import { InteractivitySection } from "./properties/interactivity-section.js";

const C = THEME;

// `ClassHelpers` + `clearInlineAfterClassUpdate` moved to
// `./properties/shared.js` so lazy-loaded section chunks can share them
// without bringing the whole PropertiesPanel module back in.

// ══════════════════════════════════════════════════════════════════════════════
// LengthRow — scrubbable label + free-entry ValueInput for px lengths.
//
// Replaces the fixed-max SliderInput for padding/margin/radius so users can
// enter arbitrary values (1.5rem, 50%, calc(...), -12px) while still getting
// scrub-drag on the label for quick px tweaks.
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// Main PropertiesPanel — thin shell that delegates to memoized sections
// ══════════════════════════════════════════════════════════════════════════════

export const PropertiesPanel = React.memo(function PropertiesPanel() {
  const sel = useEditorStore((s) => s.selectedElement);
  const open = useEditorStore((s) => s.propertiesOpen);
  const toggle = useEditorStore((s) => s.toggleProperties);
  const helpers = useClassHelpers();
  const readonlyEntries = useReadonlyStyleStore((s) => s.entries);

  if (!open) return null;
  // Show an empty state when no element is selected — the panel used to
  // unmount entirely without a selection, but keeping it visible on the
  // right is a clearer "this is where you'll edit things" cue and avoids
  // layout jumps every time the user selects/deselects.
  if (!sel) {
    return (
      <div style={panelStyle} data-canvas-overlay="true">
        <div style={headerStyle}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.fgDim, fontFamily: C.mono }}>
            No selection
          </span>
          <IconBtn icon={<X size={14} />} onClick={toggle} title="Close" />
        </div>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "24px 16px", gap: 8, textAlign: "center",
        }}>
          <span style={{ fontSize: 11, color: C.fgDim, lineHeight: 1.5 }}>
            Click an element on the canvas to edit its properties.
          </span>
          <span style={{ fontSize: 10, color: C.fgMuted, lineHeight: 1.5 }}>
            Shift-click for multi-select · Escape walks up the tree.
          </span>
        </div>
      </div>
    );
  }

  // Collect unmutable properties from prior modify-style failures (source
  // uses a computed value — template, ternary, or identifier).
  const unmutableProps: string[] = [];
  if (sel.source) {
    const keyPrefix = `${sel.source.filePath}:${sel.source.line}:`;
    for (const key of Object.keys(readonlyEntries)) {
      if (key.startsWith(keyPrefix)) unmutableProps.push(key.slice(keyPrefix.length));
    }
  }

  return (
    <div style={panelStyle} data-canvas-overlay="true">
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{
            background: C.accent, color: "#fff", fontSize: 10,
            padding: "2px 7px", borderRadius: 4, fontFamily: C.mono,
            fontWeight: 600, lineHeight: "1.6", flexShrink: 0,
          }}>
            {sel.tagName}
          </span>
          {sel.source && (
            <span style={{ fontSize: 10, color: C.fgMuted, fontFamily: C.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sel.source.filePath.split("/").pop()}:{sel.source.line}
            </span>
          )}
          {helpers.bpPrefix && (
            <span style={{
              background: C.canvasLayerSoft, color: C.canvasLayer, fontSize: 9,
              padding: "1px 6px", borderRadius: 3, fontFamily: C.mono,
              fontWeight: 600, lineHeight: "1.6", flexShrink: 0,
            }}>
              {helpers.bpPrefix}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <IconBtn icon={<X size={14} />} onClick={toggle} title="Close" />
        </div>
      </div>

      {unmutableProps.length > 0 && (
        <div style={{
          padding: "6px 10px",
          fontSize: 10,
          color: C.danger,
          background: C.dangerSoft,
          borderBottom: `1px solid ${C.border}`,
          lineHeight: 1.4,
          fontFamily: C.mono,
        }}>
          Read-only: <strong>{unmutableProps.join(", ")}</strong>. Source uses
          a computed value (template, ternary, or variable) — edit the source
          directly or swap to a className.
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overlay-scroll-stable">
        <LayoutSection h={helpers} sel={sel} />
        <SpacingSection h={helpers} sel={sel} />
        <TypographySection h={helpers} sel={sel} />
        <RadiusSection h={helpers} sel={sel} />
        <TransformSection h={helpers} sel={sel} />
        <BlendingSection h={helpers} sel={sel} />
        <FillSection h={helpers} sel={sel} />
        <OutlineSection h={helpers} sel={sel} />
        <BorderSection h={helpers} sel={sel} />
        <ShadowSection h={helpers} sel={sel} />
        <InnerShadowSection h={helpers} sel={sel} />
        <SelectionColorsSection h={helpers} sel={sel} />
        <FiltersSection h={helpers} sel={sel} />
        <BackdropFiltersSection h={helpers} sel={sel} />
        <TransitionsSection h={helpers} sel={sel} />
        <InteractivitySection h={helpers} sel={sel} />
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Memoized Sections
// ══════════════════════════════════════════════════════════════════════════════

// Compact icon + input row. Unlike PropRow (52px label column), this gives
// the input ~26px for the glyph and the rest of the row for the value —
// much more usable at 280px panel width.
// Gap glyph — rotates with the flex direction so the dashed separator tracks
// whichever axis the gap actually lives on (horizontal for row, vertical for col).
// Stroke-weight glyph — thin line over a thick line. Reads as "border/outline
// thickness" in the same way Figma/Framer's weight control does.
const StrokeWeightGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <line x1="1" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <line x1="1" y1="8.5" x2="11" y2="8.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const GapGlyphRow = () => (
  <svg width="13" height="12" viewBox="0 0 13 12" fill="none" stroke="currentColor" aria-hidden>
    <rect x="0.5" y="1.5" width="3" height="9" rx="0.5" />
    <rect x="9.5" y="1.5" width="3" height="9" rx="0.5" />
    <line x1="6.5" y1="0" x2="6.5" y2="12" strokeDasharray="1.5 1.5" />
  </svg>
);
const GapGlyphCol = () => (
  <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" aria-hidden>
    <rect x="1.5" y="0.5" width="9" height="3" rx="0.5" />
    <rect x="1.5" y="9.5" width="9" height="3" rx="0.5" />
    <line x1="0" y1="6.5" x2="12" y2="6.5" strokeDasharray="1.5 1.5" />
  </svg>
);

// Padding edge glyphs — small box with a thicker accent on one side.
// Kept inline per CLAUDE.md: these are edge indicators, not general icons.
const PadLGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden>
    <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="1.5" strokeOpacity="0.45" />
    <line x1="2" y1="2.75" x2="2" y2="9.25" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const PadRGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden>
    <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="1.5" strokeOpacity="0.45" />
    <line x1="10" y1="2.75" x2="10" y2="9.25" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const PadTGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden>
    <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="1.5" strokeOpacity="0.45" />
    <line x1="2.75" y1="2" x2="9.25" y2="2" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const PadBGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden>
    <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="1.5" strokeOpacity="0.45" />
    <line x1="2.75" y1="10" x2="9.25" y2="10" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const PadAllGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" aria-hidden>
    <rect x="0.75" y="0.75" width="11.5" height="11.5" rx="1.5" />
    <rect x="3.5" y="3.5" width="6" height="6" strokeDasharray="1.25 1.25" strokeOpacity="0.7" />
  </svg>
);

// Padding block inside the Flex sub-section. Mirrors Figma's auto-layout:
// split mode lays out 2x2 per-side inputs; linked mode collapses to a single
// `p-*` input. Side-by-side with the pad-link toggle in the outer 3-col grid
// so the toggle aligns with the sliders icon in the row above.
function FlexPadding({
  h, sel, cs, phPx,
}: {
  h: ClassHelpers;
  sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]>;
  cs: CSSStyleDeclaration | null;
  phPx: (raw: string | undefined, fallback?: string) => string;
}) {
  void sel;
  const plRaw = h.get("pl"), prRaw = h.get("pr"), ptRaw = h.get("pt"), pbRaw = h.get("pb");
  const hasSplit = !!(plRaw || prRaw || ptRaw || pbRaw);
  const [mode, setMode] = useState<LinkMode>(hasSplit ? "split" : "linked");

  const toggleBtn = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setMode(mode === "linked" ? "split" : "linked")}
      className={cn(
        "size-7 row-span-2 self-center text-canvas-muted-fg hover:text-canvas-fg",
        mode === "split" && "text-canvas-fg bg-canvas-muted",
      )}
      title={mode === "linked" ? "Split padding into sides" : "Link padding sides"}
      aria-label="Toggle padding link"
    >
      <PadAllGlyph />
    </Button>
  );

  if (mode === "linked") {
    return (
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
        <div className="col-span-2">
          <ScrubField
            label={<PadAllGlyph />}
            title="Padding"
            {...lengthProps(h, "p", phPx(cs?.paddingLeft, "0"))}
          />
        </div>
        {toggleBtn}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
      <ScrubField label={<PadLGlyph />} title="Padding left"
        {...lengthProps(h, "pl", phPx(cs?.paddingLeft, "0"))} />
      <ScrubField label={<PadRGlyph />} title="Padding right"
        {...lengthProps(h, "pr", phPx(cs?.paddingRight, "0"))} />
      {toggleBtn}
      <ScrubField label={<PadTGlyph />} title="Padding top"
        {...lengthProps(h, "pt", phPx(cs?.paddingTop, "0"))} />
      <ScrubField label={<PadBGlyph />} title="Padding bottom"
        {...lengthProps(h, "pb", phPx(cs?.paddingBottom, "0"))} />
    </div>
  );
}

// "Clip content" — bound to overflow-hidden. Full Overflow CustomSelect
// remains available further down the Layout section for scroll/auto/visible.
function ClipContent({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const isClipping = !!h.has("overflow-hidden");
  const toggle = (next: boolean) => {
    if (!next) {
      const actual = h.actual("overflow-hidden") || "overflow-hidden";
      h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: [actual] });
    } else {
      h.sendPrefixed({ type: "modify-class", source: sel.source!, add: ["overflow-hidden"] });
    }
  };
  return (
    <CheckboxRow
      checked={isClipping}
      onChange={toggle}
      label="Clip content"
      kbd="⌥C"
    />
  );
}

// ── Length display helpers ──────────────────────────────────────────────────
// The sidebar always SHOWS px / % / keywords to the user. Tailwind scale
// classes (`p-4`, `w-1/2`, `m-[18px]`) get decoded to the user-facing form for
// display, and any user input is re-encoded back to the canonical Tailwind
// value for `h.set()` — preferring scale matches, falling back to bracket
// forms when nothing matches.
const TW_SCALE_PX: Record<string, number> = {
  "0": 0, "0.5": 2, "1": 4, "1.5": 6, "2": 8, "2.5": 10, "3": 12, "3.5": 14,
  "4": 16, "5": 20, "6": 24, "7": 28, "8": 32, "9": 36, "10": 40, "11": 44,
  "12": 48, "14": 56, "16": 64, "20": 80, "24": 96, "28": 112, "32": 128,
  "36": 144, "40": 160, "44": 176, "48": 192, "56": 224, "64": 256, "72": 288,
  "80": 320, "96": 384,
};

function pxToScale(px: number): string {
  if (px === 0) return "0";
  for (const [k, v] of Object.entries(TW_SCALE_PX)) if (v === px) return k;
  return `[${px}px]`;
}

const SIZE_KEYWORDS = new Set(["auto", "none", "full", "screen", "fit", "min", "max", "px"]);

// Every length-shaped field in the sidebar shows px or % (with suffix), so
// scale classes and bracket values decode to the same user-facing format.
function lengthDisplay(v: string): string {
  if (!v) return "";
  const bracketPx = v.match(/^\[(-?\d+(?:\.\d+)?)(?:px)?\]$/);
  if (bracketPx) return `${parseFloat(bracketPx[1])}px`;
  const bracketRem = v.match(/^\[(-?\d+(?:\.\d+)?)rem\]$/);
  if (bracketRem) return `${Math.round(parseFloat(bracketRem[1]) * 16)}px`;
  const bracketPct = v.match(/^\[(-?\d+(?:\.\d+)?)%\]$/);
  if (bracketPct) return `${parseFloat(bracketPct[1])}%`;
  const bracketAny = v.match(/^\[(.+)\]$/);
  if (bracketAny) return bracketAny[1].replace(/_/g, " ");
  if (v === "full" || v === "screen") return "100%";
  if (SIZE_KEYWORDS.has(v)) return v;
  const frac = v.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const pct = (+frac[1] / +frac[2]) * 100;
    return `${Math.round(pct * 100) / 100}%`;
  }
  if (TW_SCALE_PX[v] !== undefined) return `${TW_SCALE_PX[v]}px`;
  if (v.startsWith("-") && TW_SCALE_PX[v.slice(1)] !== undefined) return `-${TW_SCALE_PX[v.slice(1)]}px`;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return `${v}px`;
  return v;
}

// Prefixes where Tailwind exposes fraction classes (`w-1/2`, `h-2/3`, …).
// Other length utilities (padding, margin, gap, insets, radius) treat a
// percent input as arbitrary → bracket form so the written class stays valid.
const FRACTIONAL_PREFIXES = new Set([
  "w", "h", "min-w", "max-w", "min-h", "max-h", "basis",
]);

function lengthToTailwind(raw: string, prefix?: string): string {
  const t = raw.trim();
  if (!t) return "";
  const px = t.match(/^(-?\d+(?:\.\d+)?)\s*(?:px)?$/);
  if (px) return pxToScale(Math.round(parseFloat(px[1])));
  const pct = t.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (pct) {
    const n = parseFloat(pct[1]);
    if (!prefix || FRACTIONAL_PREFIXES.has(prefix)) {
      if (n === 100) return "full";
      if (n === 50) return "1/2";
      if (Math.abs(n - 33.33) < 0.5) return "1/3";
      if (Math.abs(n - 66.66) < 0.5 || Math.abs(n - 66.67) < 0.5) return "2/3";
      if (n === 25) return "1/4";
      if (n === 75) return "3/4";
      if (n === 20) return "1/5";
      if (n === 40) return "2/5";
      if (n === 60) return "3/5";
      if (n === 80) return "4/5";
    }
    return `[${n}%]`;
  }
  if (SIZE_KEYWORDS.has(t)) return t;
  if (/^\d+\/\d+$/.test(t)) return t;
  if (/^\[.+\]$/.test(t)) return t;
  const rem = t.match(/^(-?\d+(?:\.\d+)?)rem$/);
  if (rem) return pxToScale(Math.round(parseFloat(rem[1]) * 16));
  return `[${t.replace(/\s+/g, "_")}]`;
}

const NUMERIC_PREFIX_RE = /^(-?\d+(?:\.\d+)?)/;

/** Spread-ready props for a length-flavoured ScrubField bound to `prefix`.
 * The displayed value is always px / % (or a keyword); writes encode back.
 * `format`/`parse` keep the current unit while scrubbing — dragging "50%"
 * yields "51%" (not a bare "51"), and "16px" yields "17px". */
function lengthProps(h: ClassHelpers, prefix: string, placeholder?: string) {
  const display = lengthDisplay(h.get(prefix));
  const suffix = display.endsWith("%") ? "%" : "px";
  return {
    value: display,
    placeholder,
    onChange: (raw: string) => h.set(prefix, lengthToTailwind(raw, prefix)),
    format: (n: number) => `${Math.round(n)}${suffix}`,
    parse: (v: string) => {
      const m = v.match(NUMERIC_PREFIX_RE);
      return m ? parseFloat(m[1]) : NaN;
    },
  };
}

// Option shim — presets carry label?: string to stay compatible with the old
// CustomSelect. SelectField demands a concrete label, so we normalize once.
const opts = <T extends { value: string; label?: string }>(arr: readonly T[]) =>
  arr.map(o => ({ value: o.value, label: o.label ?? o.value }));

const FLEX_WRAP_SELECT = opts(FLEX_WRAP_OPTIONS);
const ALIGN_CONTENT_SELECT = opts(ALIGN_CONTENT_OPTIONS);
const ALIGN_SELECT = opts(ALIGN_OPTIONS);
const POSITION_SELECT = opts(POSITION_OPTIONS);
const OVERFLOW_SELECT = opts(OVERFLOW_OPTIONS);
const OBJECT_FIT_SELECT = opts(OBJECT_FIT_OPTIONS);
const BORDER_STYLE_SELECT = opts(BORDER_STYLE_PRESETS);
const BORDER_SIDE_SELECT = [
  { value: "", label: "All" },
  { value: "t", label: "Top" },
  { value: "r", label: "Right" },
  { value: "b", label: "Bottom" },
  { value: "l", label: "Left" },
];

// Flex advanced popover — absorbs wrap, reverse, align-content, and the
// old FlexItemSection's grow/shrink/self/order. Opens from a sliders icon
// in the Flex sub-block's Subheader actions.
function FlexAdvancedPopover({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const portalContainer = usePortalContainer();
  const flexDir = h.findPrefixedCls("flex-", FLEX_DIR_OPTS);
  const flexDirVal = flexDir ? flexDir.replace("flex-", "") : "row";
  const baseAxis = flexDirVal.startsWith("col") ? "col" : "row";
  const isReversed = flexDirVal.endsWith("-reverse");

  // Wrap: detect which wrap class (if any) is present.
  const currentWrap = h.findCls(FLEX_WRAP_OPTIONS.map(o => o.value).filter(Boolean)) || "";

  // Flex-item controls only make sense when this element is itself an item
  // of a flex parent. Toggle visibility so the popover doesn't render
  // irrelevant rows.
  const parentIsFlex = sel.element?.parentElement
    ? getCachedStyle(sel.element.parentElement).display.includes("flex")
    : false;

  // Flex shorthand preset match: "flex-1", "flex-auto", etc. Bare numbers
  // (e.g. "flex-2") are preserved too.
  const flexPresetValues = FLEX_ITEM_PRESETS.map(o => o.value).filter(Boolean);
  const currentFlex = h.findCls(flexPresetValues)
    || h.classes.find(c => { const b = h.stripBpPrefix(c); return /^flex-\d+$/.test(b) || /^flex-\[/.test(b); })
    || "";

  const setWrap = useCallback((v: string) => {
    const oldActual = FLEX_WRAP_OPTIONS
      .map(o => o.value)
      .filter(Boolean)
      .map(c => h.actual(c))
      .filter(Boolean) as string[];
    h.sendPrefixed({
      type: "modify-class", source: sel.source!,
      remove: oldActual.length ? oldActual : undefined,
      add: v ? [v] : undefined,
    });
  }, [h, sel]);

  const setReversed = useCallback((next: boolean) => {
    const nextDir = next ? `${baseAxis}-reverse` : baseAxis;
    const oldActual = flexDir ? (h.actual(flexDir) || flexDir) : undefined;
    h.sendPrefixed({
      type: "modify-class", source: sel.source!,
      remove: oldActual ? [oldActual] : undefined,
      add: nextDir === "row" ? undefined : [`flex-${nextDir}`],
    });
  }, [h, sel, baseAxis, flexDir]);

  const setFlex = useCallback((v: string) => {
    const old = flexPresetValues.map(c => h.actual(c)).filter(Boolean) as string[];
    const numericExisting = h.classes.filter(c => { const b = h.stripBpPrefix(c); return /^flex-\d+$/.test(b) || /^flex-\[/.test(b); });
    const removeList = [...old, ...numericExisting];
    h.sendPrefixed({
      type: "modify-class", source: sel.source!,
      remove: removeList.length ? removeList : undefined,
      add: v ? [v.startsWith("flex-") ? v : `flex-${v}`] : undefined,
    });
  }, [h, sel, flexPresetValues]);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Advanced flex options"
          aria-label="Advanced flex options"
          className="size-5 text-canvas-muted-fg hover:text-canvas-fg"
        >
          <SlidersHorizontal size={12} />
        </Button>
      </Popover.Trigger>
      <Popover.Portal container={portalContainer}>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            // See SelectField: portaled popover must opt back into pointer
            // events since the shadow-DOM mount point disables them.
            "pointer-events-auto z-[2147483647] w-60 rounded-md border border-canvas-border bg-canvas-bg",
            "shadow-md p-2.5 space-y-2 text-xs",
          )}
        >
          <div className="text-[11px] font-medium text-canvas-fg">Advanced flex</div>

          <CheckboxRow
            checked={isReversed}
            onChange={setReversed}
            label={`Reverse ${baseAxis === "row" ? "row" : "column"}`}
          />

          <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
            <span className="text-canvas-muted-fg">Wrap</span>
            <SelectField value={currentWrap} options={FLEX_WRAP_SELECT} onChange={setWrap} />
            <span className="text-canvas-muted-fg">Content</span>
            <SelectField value={h.get("content")} options={ALIGN_CONTENT_SELECT} onChange={v => h.set("content", v)} />
          </div>

          {parentIsFlex && (
            <>
              <div className="pt-1 text-[11px] font-medium text-canvas-fg">As item</div>
              <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
                <span className="text-canvas-muted-fg">Flex</span>
                <ScrubField value={currentFlex}
                  presets={FLEX_ITEM_PRESETS.map(p => ({ value: p.value, label: p.label ?? p.value }))}
                  onChange={setFlex} placeholder="default" title="Flex shorthand" />
                <span className="text-canvas-muted-fg">Self</span>
                <SelectField value={h.get("self")} options={ALIGN_SELECT} onChange={v => h.set("self", v)} />
                <span className="text-canvas-muted-fg">Order</span>
                <ScrubField
                  value={h.get("order")}
                  onChange={v => h.set("order", v)}
                  placeholder="0"
                />
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const LayoutSection = React.memo(function LayoutSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const display = h.findCls(DISPLAY_OPTS);
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";
  const flexDir = h.findPrefixedCls("flex-", FLEX_DIR_OPTS);
  const flexDirVal = flexDir ? flexDir.replace("flex-", "") : "row";
  const positionType = h.findCls(["relative","absolute","fixed","sticky"]);
  const isPositioned = positionType !== "";

  // Computed-style placeholders: let the user see the real current value
  // even when no Tailwind class is set.
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  // Always returns a px-suffixed string ("0px", "16px", "auto", "none") so
  // placeholders match the user-facing display in length-shaped ScrubFields.
  const phPx = (v: string | undefined, fallback = "0px") => {
    if (!cs || v === undefined) return fallback;
    const n = parseFloat(v);
    return Number.isFinite(n) && n !== 0 ? `${Math.round(n)}px` : fallback;
  };
  const phInset = (side: "top" | "right" | "bottom" | "left") => {
    if (!cs) return "auto";
    const v = cs[side];
    if (v === "auto") return "auto";
    const n = parseFloat(v);
    return Number.isFinite(n) ? `${Math.round(n)}px` : "auto";
  };

  // h.set with isExact=false already concatenates `${prefix}-${value}`, so
  // bracket values like "[27px]" correctly emit `top-[27px]`. We only route
  // through a helper to keep the JSX short.
  const setLengthClass = useCallback((prefix: string, v: string) => {
    h.set(prefix, v);
  }, [h]);

  // `h.has` only checks bare + current-breakpoint prefix, so a `-scale-y-100`
  // applied via `md:` (outside the active breakpoint) would read as "off".
  // Walk the full class list via stripBpPrefix so we catch every prefix.
  const findActualFlip = (cls: string): string | undefined =>
    h.classes.find(c => h.stripBpPrefix(c) === cls);
  const flipX = !!findActualFlip("-scale-x-100");
  const flipY = !!findActualFlip("-scale-y-100");
  const toggleScale = (cls: string) => {
    const actual = findActualFlip(cls);
    if (actual) {
      h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: [actual] });
    } else {
      h.sendPrefixed({ type: "modify-class", source: sel.source!, add: [cls] });
    }
  };
  const sizePresets = SIZE_PRESETS.map(p => ({ value: p.value, label: p.label }));

  return (
    <Section title="Layout" defaultOpen>
      {/* W · H · mirror */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        <ScrubField label="W" presets={sizePresets} {...lengthProps(h, "w", phPx(cs?.width, "auto"))} />
        <ScrubField label="H" presets={sizePresets} {...lengthProps(h, "h", phPx(cs?.height, "auto"))} />
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon"
            aria-pressed={flipX}
            className={cn("size-7", flipX ? "text-canvas-accent" : "text-canvas-muted-fg")}
            title="Flip horizontal" onClick={() => toggleScale("-scale-x-100")}>
            <FlipHorizontal size={12} />
          </Button>
          <Button variant="ghost" size="icon"
            aria-pressed={flipY}
            className={cn("size-7", flipY ? "text-canvas-accent" : "text-canvas-muted-fg")}
            title="Flip vertical" onClick={() => toggleScale("-scale-y-100")}>
            <FlipVertical size={12} />
          </Button>
        </div>
      </div>

      {/* Min/Max W·H — heavily-used Tailwind constraints, paired with W/H */}
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField label="MIN W" presets={sizePresets} {...lengthProps(h, "min-w", phPx(cs?.minWidth, "0"))} />
        <ScrubField label="MAX W" presets={sizePresets} {...lengthProps(h, "max-w", phPx(cs?.maxWidth, "none"))} />
        <ScrubField label="MIN H" presets={sizePresets} {...lengthProps(h, "min-h", phPx(cs?.minHeight, "0"))} />
        <ScrubField label="MAX H" presets={sizePresets} {...lengthProps(h, "max-h", phPx(cs?.maxHeight, "none"))} />
      </div>

      <SubLabel>Display Mode</SubLabel>
      <ToggleGroup
        value={display}
        items={[
          { value: "block", icon: <Square size={14} />, label: "Block", title: "Display: Block" },
          { value: "flex", icon: <Columns3 size={14} />, label: "Flex", title: "Display: Flex" },
          { value: "grid", icon: <Grid3x3 size={14} />, label: "Grid", title: "Display: Grid" },
          { value: "hidden", icon: <EyeOff size={14} />, label: "Hide", title: "Display: Hidden" },
        ]}
        showLabels
        onChange={v => {
          const oldActual = DISPLAY_OPTS.map(c => h.actual(c)).filter(Boolean) as string[];
          h.sendPrefixed({
            type: "modify-class", source: sel.source!,
            remove: oldActual.length ? oldActual : undefined,
            add: v && v !== display ? [v] : undefined,
          });
        }}
      />
      {isFlex && (
        <div className="grid gap-1.5 mt-2.5">
          <Subheader
            actions={
              <Button variant="ghost" size="icon" className="size-6 text-canvas-muted-fg hover:text-canvas-fg"
                title="Remove flex"
                onClick={() => {
                  const actualFlex = h.actual("flex") || "flex";
                  h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: [actualFlex] });
                }}>
                <Minus size={12} />
              </Button>
            }
          >
            Flex
          </Subheader>
          {/* Row 1: direction | alignment (rowspan 2) | sliders.
              Row 2: gap (col 1). Alignment picker fills col 2 across both rows
              so its 3x3 grid has enough height without squishing. */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
            <ToggleGroup
              value={flexDirVal.startsWith("col") ? "col" : "row"}
              items={[
                { value: "row", icon: <MoveRight size={14} />, title: "Row" },
                { value: "col", icon: <MoveDown size={14} />, title: "Column" },
              ]}
              onChange={v => {
                const oldActual = flexDir ? (h.actual(flexDir) || flexDir) : undefined;
                h.sendPrefixed({
                  type: "modify-class", source: sel.source!,
                  remove: oldActual ? [oldActual] : undefined,
                  add: v && v !== "row" ? [`flex-${v}`] : undefined,
                });
              }}
            />
            <div className="row-span-2 self-stretch">
              <AlignmentPicker
                direction={flexDirVal.startsWith("col") ? "col" : "row"}
                justify={h.get("justify")}
                align={h.get("items")}
                onChange={(j, a) => {
                  h.set("justify", j);
                  h.set("items", a);
                }}
              />
            </div>
            <FlexAdvancedPopover h={h} sel={sel} />
            <ScrubField
              label={flexDirVal.startsWith("col") ? <GapGlyphCol /> : <GapGlyphRow />}
              title="Gap"
              {...lengthProps(h, "gap", phPx(cs?.gap, "0"))}
            />
            <div />
          </div>
          <FlexPadding h={h} sel={sel} cs={cs} phPx={phPx} />
          <ClipContent h={h} sel={sel} />
        </div>
      )}
      {isGrid && (
        <div className="grid grid-cols-2 gap-1.5">
          <ScrubField label="Cols" value={h.get("grid-cols")}
            presets={GRID_COLS_PRESETS.map(p => ({ value: p.value, label: p.label ?? p.value }))}
            onChange={v => h.set("grid-cols", v)} placeholder="1" title="Grid columns" />
          <ScrubField label="Gap"
            presets={INSET_PRESETS.map(p => ({ value: p.value, label: p.label ?? p.value }))}
            title="Gap"
            {...lengthProps(h, "gap", phPx(cs?.gap, "0"))}
          />
        </div>
      )}
      <div className="grid grid-cols-[1fr_1fr] gap-1.5">
        <SelectField value={positionType} options={POSITION_SELECT}
          placeholder="Static"
          title="Position"
          onChange={v => {
            const oldActual = ["relative","absolute","fixed","sticky"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
          }}
        />
        <ScrubField label="Z" value={h.get("z")}
          presets={Z_INDEX_PRESETS.map(p => ({ value: p.value, label: p.label ?? p.value }))}
          onChange={v => h.set("z", v)}
          placeholder={cs?.zIndex && cs.zIndex !== "auto" ? cs.zIndex : "auto"}
          title="Z-Index"
        />
      </div>
      {isPositioned && (
        <div className="grid grid-cols-2 gap-1.5">
          <ScrubField label="T" title="Top"    presets={INSET_PRESETS} {...lengthProps(h, "top",    phInset("top"))} />
          <ScrubField label="R" title="Right"  presets={INSET_PRESETS} {...lengthProps(h, "right",  phInset("right"))} />
          <ScrubField label="B" title="Bottom" presets={INSET_PRESETS} {...lengthProps(h, "bottom", phInset("bottom"))} />
          <ScrubField label="L" title="Left"   presets={INSET_PRESETS} {...lengthProps(h, "left",   phInset("left"))} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField value={h.get("overflow")} options={OVERFLOW_SELECT}
          placeholder="Visible" title="Overflow"
          onChange={v => h.set("overflow", v)} />
        <ScrubField label="AR" value={h.get("aspect")}
          presets={ASPECT_RATIO_PRESETS.map(p => ({ value: p.value, label: p.label ?? p.value }))}
          onChange={v => h.set("aspect", v)} placeholder="auto" title="Aspect ratio" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField
          value={["contain","cover","fill","none","scale-down"].find(c => h.has(`object-${c}`)) || ""}
          options={OBJECT_FIT_SELECT}
          placeholder="Fill" title="Object fit"
          onChange={v => {
            const oldActual = ["contain","cover","fill","none","scale-down"].map(c => h.actual(`object-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`object-${v}`] : undefined });
          }}
        />
        <ScrubField label="Pos" value={h.get("object")}
          presets={OBJECT_POSITION_PRESETS.map(p => ({ value: p.value, label: p.label ?? p.value }))}
          onChange={v => h.set("object", v)} placeholder="center" title="Object position" />
      </div>
    </Section>
  );
});

// Padding uses h.get/h.set directly — values are non-negative.
// Margin allows negatives, so we read/write through helpers that
// inspect the element's classList for both `mx-N` and `-mx-N` forms.
function readMargin(el: Element | null, axis: string): string {
  if (!el) return "";
  const classList = (typeof el.className === "string" ? el.className : (el.getAttribute?.("class") ?? ""))
    .split(/\s+/).filter(Boolean);
  for (const c of classList) {
    const bare = c.replace(/^[a-z0-9]+:/, ""); // strip bp prefix
    if (bare === `-${axis}` || bare.startsWith(`-${axis}-`)) {
      return bare === `-${axis}` ? "" : `-${bare.slice(axis.length + 2)}`;
    }
    if (bare === axis || bare.startsWith(`${axis}-`)) {
      return bare === axis ? "" : bare.slice(axis.length + 1);
    }
  }
  return "";
}

function findMarginActuals(el: Element | null, axis: string): string[] {
  if (!el) return [];
  const classList = (typeof el.className === "string" ? el.className : (el.getAttribute?.("class") ?? ""))
    .split(/\s+/).filter(Boolean);
  return classList.filter(c => {
    const bare = c.replace(/^[a-z0-9]+:/, "");
    return bare === axis || bare.startsWith(`${axis}-`)
      || bare === `-${axis}` || bare.startsWith(`-${axis}-`);
  });
}

const SpacingSection = React.memo(function SpacingSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const el = sel.element;
  const cs = el ? getCachedStyle(el) : null;

  // Padding values
  const px = h.get("px"), py = h.get("py");
  const pt = h.get("pt"), pr = h.get("pr"), pb = h.get("pb"), pl = h.get("pl");
  const padHasIndividual = !!(pt || pr || pb || pl);
  const [padMode, setPadMode] = useState<LinkMode>(padHasIndividual ? "split" : "linked");

  // Margin values
  const mx = readMargin(el, "mx"), my = readMargin(el, "my");
  const mt = readMargin(el, "mt"), mr = readMargin(el, "mr"), mb = readMargin(el, "mb"), ml = readMargin(el, "ml");
  const marHasIndividual = !!(mt || mr || mb || ml);
  const [marMode, setMarMode] = useState<LinkMode>(marHasIndividual ? "split" : "linked");

  // Maps the margin axis to the CSS inline properties we paint optimistically.
  // Mirrors PREFIX_TO_PREVIEW in useClassHelpers; duplicated because
  // writeMargin builds the class itself to support negative values (`-mx-4`),
  // which h.set doesn't encode.
  const marginPreviewProps = (axis: string): string[] => {
    if (axis === "mx") return ["marginLeft", "marginRight"];
    if (axis === "my") return ["marginTop", "marginBottom"];
    if (axis === "m") return ["margin"];
    if (axis === "mt") return ["marginTop"];
    if (axis === "mr") return ["marginRight"];
    if (axis === "mb") return ["marginBottom"];
    if (axis === "ml") return ["marginLeft"];
    return [];
  };
  const decodeMarginPx = (v: string): string | null => {
    if (!v) return "0px";
    const bracket = v.match(/^\[(.+)\]$/);
    if (bracket) return bracket[1];
    const n = Number(v);
    if (Number.isFinite(n)) return `${n * 4}px`;
    return null;
  };

  const writeMargin = useCallback((axis: string, v: string) => {
    if (!sel.source) return;
    const remove = findMarginActuals(el, axis);
    const trimmed = v.trim();
    if (!trimmed) {
      // Anti-flash: paint 0 immediately so the margin drops live.
      if (el) {
        for (const p of marginPreviewProps(axis)) setStyleProp(el, p, "0px");
      }
      if (remove.length) h.sendPrefixed({ type: "modify-class", source: sel.source, remove });
      if (el) {
        for (const p of marginPreviewProps(axis)) clearInlineAfterClassUpdate(el, p);
      }
      return;
    }
    const n = parseFloat(trimmed);
    const isNumericNeg = Number.isFinite(n) && n < 0 && /^-?\d+(\.\d+)?$/.test(trimmed);
    const cls = isNumericNeg ? `-${axis}-${Math.abs(n)}` : `${axis}-${trimmed}`;
    // Anti-flash: paint the new margin inline so the user sees it change
    // without waiting for the debounced file write → HMR round trip.
    if (el) {
      const raw = isNumericNeg ? `-${Math.abs(n) * 4}px` : decodeMarginPx(trimmed);
      if (raw !== null) {
        for (const p of marginPreviewProps(axis)) setStyleProp(el, p, raw);
      }
    }
    h.sendPrefixed({
      type: "modify-class",
      source: sel.source,
      remove: remove.length ? remove : undefined,
      add: [cls],
    });
    if (el) {
      for (const p of marginPreviewProps(axis)) clearInlineAfterClassUpdate(el, p);
    }
  }, [el, sel.source, h]);

  const phPx = (raw: string | undefined, fallback = "0px") => {
    if (!raw) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n !== 0 ? `${Math.round(n)}px` : fallback;
  };

  // Expand when any padding or margin token is present on the element —
  // otherwise this is just clutter for a freshly-selected element.
  const hasSpacing = !!(
    h.get("p") || h.get("px") || h.get("py") ||
    h.get("pt") || h.get("pr") || h.get("pb") || h.get("pl") ||
    mx || my || mt || mr || mb || ml
  );

  return (
    <Section title="Spacing" defaultOpen autoOpenKey={sel.element} hasValue={hasSpacing}>
      {/* Padding */}
      <Subheader>Padding</Subheader>
      <LinkedInput
        mode={padMode}
        onModeChange={setPadMode}
        toggleTitle={padMode === "linked" ? "Individual sides" : "Linked sides"}
        splitIcon={<EdgesGlyph mode="linked" />}
        linkIcon={<EdgesGlyph mode="split" />}
      >
        {mode => mode === "linked" ? (
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField label="PX" presets={SPACING_PRESETS} {...lengthProps(h, "px", phPx(cs?.paddingLeft))} />
            <ScrubField label="PY" presets={SPACING_PRESETS} {...lengthProps(h, "py", phPx(cs?.paddingTop))} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField label="L" presets={SPACING_PRESETS} {...lengthProps(h, "pl", phPx(cs?.paddingLeft))} />
            <ScrubField label="T" presets={SPACING_PRESETS} {...lengthProps(h, "pt", phPx(cs?.paddingTop))} />
            <ScrubField label="R" presets={SPACING_PRESETS} {...lengthProps(h, "pr", phPx(cs?.paddingRight))} />
            <ScrubField label="B" presets={SPACING_PRESETS} {...lengthProps(h, "pb", phPx(cs?.paddingBottom))} />
          </div>
        )}
      </LinkedInput>

      {/* Margin (supports negatives) — `writeMargin` handles `-mx-N` form. */}
      <Subheader>Margin</Subheader>
      <LinkedInput
        mode={marMode}
        onModeChange={setMarMode}
        toggleTitle={marMode === "linked" ? "Individual sides" : "Linked sides"}
        splitIcon={<EdgesGlyph mode="linked" />}
        linkIcon={<EdgesGlyph mode="split" />}
      >
        {mode => mode === "linked" ? (
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField label="MX" presets={SPACING_PRESETS} value={lengthDisplay(mx)} placeholder={phPx(cs?.marginLeft)}
              onChange={v => writeMargin("mx", lengthToTailwind(v))} />
            <ScrubField label="MY" presets={SPACING_PRESETS} value={lengthDisplay(my)} placeholder={phPx(cs?.marginTop)}
              onChange={v => writeMargin("my", lengthToTailwind(v))} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField label="L" presets={SPACING_PRESETS} value={lengthDisplay(ml)} placeholder={phPx(cs?.marginLeft)}
              onChange={v => writeMargin("ml", lengthToTailwind(v))} />
            <ScrubField label="T" presets={SPACING_PRESETS} value={lengthDisplay(mt)} placeholder={phPx(cs?.marginTop)}
              onChange={v => writeMargin("mt", lengthToTailwind(v))} />
            <ScrubField label="R" presets={SPACING_PRESETS} value={lengthDisplay(mr)} placeholder={phPx(cs?.marginRight)}
              onChange={v => writeMargin("mr", lengthToTailwind(v))} />
            <ScrubField label="B" presets={SPACING_PRESETS} value={lengthDisplay(mb)} placeholder={phPx(cs?.marginBottom)}
              onChange={v => writeMargin("mb", lengthToTailwind(v))} />
          </div>
        )}
      </LinkedInput>
    </Section>
  );
});

// Tiny 2-state edges glyph: filled inner square (linked) vs vertical+horizontal grid (split).
function EdgesGlyph({ mode }: { mode: LinkMode }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden>
      <rect x="0.5" y="0.5" width="11" height="11" rx="1.5" />
      {mode === "linked"
        ? <rect x="3.5" y="3.5" width="5" height="5" />
        : <>
            <line x1="3.5" y1="1" x2="3.5" y2="11" />
            <line x1="8.5" y1="1" x2="8.5" y2="11" />
            <line x1="1" y1="3.5" x2="11" y2="3.5" />
            <line x1="1" y1="8.5" x2="11" y2="8.5" />
          </>}
    </svg>
  );
}

// ── Fill tab state ────────────────────────────────────────────────────────
// The Fill section supports three mutually exclusive types:
//   - Solid:    bg-[<color>] arbitrary class (and inherits any bg-<name> set
//               outside the overlay)
//   - Gradient: bg-[linear-gradient(...)] / bg-[radial-gradient(...)]
//   - Image:    bg-[url(...)]
// Switching tabs keeps the in-progress editor state so flipping back and
// forth doesn't reset — persistence lives in whatever bg-* class is on the
// element.
type FillType = "solid" | "gradient" | "image";

const FILL_TYPE_OPTS = [
  { value: "solid", label: "Solid" },
  { value: "gradient", label: "Gradient" },
  { value: "image", label: "Image" },
];

const BG_BRACKET_RE = /^bg-\[(.+)\]$/;

function classifyFillClass(cls: string | undefined): FillType | null {
  if (!cls) return null;
  const m = cls.match(BG_BRACKET_RE);
  if (!m) return "solid";
  const v = m[1];
  if (/^(linear|radial|conic)-gradient/i.test(v)) return "gradient";
  if (/^url\(/i.test(v)) return "image";
  return "solid";
}

// Tailwind arbitrary values treat `_` as a literal space, so we swap spaces
// for underscores before writing the class.
function cssToArbitrary(css: string): string {
  return css.replace(/\s+/g, "_").replace(/,_/g, ",");
}

// When a hex exactly matches a named Tailwind color (as of the default
// palette), prefer the named class — this is the "if it happens to map to
// a Tailwind class" rule. Anything else rides the arbitrary-value track.
const NAMED_BG_COLORS: Record<string, string> = {
  "#FFFFFF": "white",
  "#FFF":    "white",
  "#000000": "black",
  "#000":    "black",
  "TRANSPARENT": "transparent",
};

function hexToNamedBgClass(color: string): string | null {
  const normalized = color.trim().replace(/\s+/g, "").toUpperCase();
  return NAMED_BG_COLORS[normalized] ?? null;
}

const DEFAULT_GRADIENT: GradientValue = {
  type: "linear",
  angle: 90,
  stops: [
    { position: 0, color: "#FFFFFF" },
    { position: 100, color: "#BEBEBE" },
  ],
};

const DEFAULT_IMAGE: ImageFillValue = {
  url: "",
  fit: "cover",
  positionX: 50,
  positionY: 50,
  repeat: "no-repeat",
};

// Classes that describe background *behavior* (size, position, repeat) —
// excluded from the "current fill value" lookup so they don't get nuked
// when the user picks a new colour.
const BG_MODIFIER_RE = /^bg-(cover|contain|auto|fixed|local|scroll|top|bottom|left|right|center|(bottom|top)-(right|left))$/;
const BG_MODIFIER_PREFIX_RE = /^bg-(repeat|origin|clip)(-|$)/;

const FillSection = React.memo(function FillSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const inlineBg = sel.element && (
    sourceStyleHasProperty(sel.element, "background-color") ||
    sourceStyleHasProperty(sel.element, "background")
  );
  const warning = inlineBg ? "background is set in style={{ ... }} — edit the source or remove the inline declaration" : undefined;
  const cs = sel.element ? getCachedStyle(sel.element) : null;

  const currentBg = h.classes.find(c => {
    const bare = h.stripBpPrefix(c);
    if (!bare.startsWith("bg-")) return false;
    if (BG_MODIFIER_RE.test(bare)) return false;
    if (BG_MODIFIER_PREFIX_RE.test(bare)) return false;
    return true;
  });

  const detectedType = classifyFillClass(currentBg);
  const [type, setType] = useState<FillType>(detectedType ?? "solid");
  const [gradient, setGradient] = useState<GradientValue>(DEFAULT_GRADIENT);
  const [image, setImage] = useState<ImageFillValue>(DEFAULT_IMAGE);
  const [visible, setVisible] = useState(true);

  // If the class list changes to a type we weren't on (e.g. undo brings
  // back a gradient while we're looking at Solid), follow the class.
  React.useEffect(() => {
    if (detectedType && detectedType !== type) setType(detectedType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedType]);

  const removeCurrentBg = useCallback((): string[] | undefined => {
    return currentBg ? [currentBg] : undefined;
  }, [currentBg]);

  // Local preview so the swatch reflects the drag immediately without
  // waiting for HMR; cleared when `solidValue` from the class list catches
  // up with what we last wrote.
  const [solidPreview, setSolidPreview] = useState<string | null>(null);
  const writeSolidHex = useCallback((color: string) => {
    if (!sel.source) return;
    setSolidPreview(color);
    const cleaned = color.replace(/\s+/g, "");
    if (!cleaned) {
      h.debouncedSendPrefixed("color:bg", {
        type: "modify-class",
        source: sel.source,
        remove: removeCurrentBg(),
      }, 120);
      return;
    }
    const named = hexToNamedBgClass(cleaned);
    const add = [named ? `bg-${named}` : `bg-[${arbitraryColorValue(cleaned)}]`];
    h.debouncedSendPrefixed("color:bg", {
      type: "modify-class",
      source: sel.source,
      remove: removeCurrentBg(),
      add,
    }, 120);
  }, [h, sel, removeCurrentBg]);

  const writeGradient = useCallback((g: GradientValue) => {
    if (!sel.source) return;
    const css = gradientToCss(g);
    h.sendPrefixed({
      type: "modify-class",
      source: sel.source,
      remove: removeCurrentBg(),
      add: [`bg-[${cssToArbitrary(css)}]`],
    });
  }, [h, sel, removeCurrentBg]);

  const writeImage = useCallback((v: ImageFillValue) => {
    if (!sel.source || !v.url) return;
    const { backgroundImage } = imageFillToCss(v);
    h.sendPrefixed({
      type: "modify-class",
      source: sel.source,
      remove: removeCurrentBg(),
      add: [`bg-[${cssToArbitrary(backgroundImage)}]`],
    });
  }, [h, sel, removeCurrentBg]);

  const handleTypeChange = useCallback((next: string) => {
    if (!next) return;
    const nextType = next as FillType;
    setType(nextType);
    // Commit whatever the new tab has so the element visibly matches the
    // tab we just switched to.
    if (nextType === "gradient") writeGradient(gradient);
    else if (nextType === "image" && image.url) writeImage(image);
  }, [gradient, image, writeGradient, writeImage]);

  const handleAddFill = useCallback(() => {
    if (currentBg) return;
    // Default to a visible neutral — white-on-white (or on a white page) is
    // invisible and makes the Add Fill click feel like a no-op.
    const defaultColor = "#E5E7EB";
    if (sel.element) setStyleProp(sel.element, "backgroundColor", defaultColor);
    writeSolidHex(defaultColor);
    if (sel.element) clearInlineAfterClassUpdate(sel.element, "backgroundColor");
  }, [currentBg, writeSolidHex, sel.element]);

  const handleRemoveFill = useCallback(() => {
    if (!sel.source) return;
    // Strip every bg-* (and bg-modifier) class on the element, not just the
    // one our type-detection settled on. Prevents stale color/gradient/image
    // classes lingering after a remove when multiple bg-* tokens coexist.
    const remove = h.classes.filter(c => {
      const bare = h.stripBpPrefix(c);
      return bare.startsWith("bg-");
    });
    if (!remove.length) return;
    // Anti-flash: clear the visible bg before HMR lands.
    if (sel.element) setStyleProp(sel.element, "background", "");
    h.sendPrefixed({
      type: "modify-class",
      source: sel.source,
      remove,
    });
    if (sel.element) clearInlineAfterClassUpdate(sel.element, "background");
  }, [h, sel]);

  // Visibility is a UI-only dim today. Multi-layer fills would back this
  // with a persisted hidden flag.
  const handleVisibilityToggle = useCallback(() => setVisible(v => !v), []);

  const bracket = currentBg?.match(BG_BRACKET_RE)?.[1];
  // Strip the `color:` type hint we prefix onto var() arbitrary values so the
  // ColorField shows the bare value the browser actually renders.
  const bracketDisplay = bracket?.replace(/^color:/, "");
  const solidValue = type === "solid"
    ? ((bracketDisplay && !/^(linear|radial|conic)-gradient|^url\(/i.test(bracketDisplay) ? bracketDisplay : "")
      || (cs?.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : ""))
    : "";

  // Clear the preview once the class list reflects what we wrote.
  useEffect(() => {
    if (solidPreview === null) return;
    const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    if (norm(solidValue) === norm(solidPreview)) setSolidPreview(null);
  }, [solidValue, solidPreview]);

  const hasFill = !!currentBg || (!!cs?.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)");
  return (
    <Section
      title="Fill"
      defaultOpen
      autoOpenKey={sel.element}
      hasValue={hasFill}
      warning={warning}
      headerAction={
        <Button
          variant="ghost"
          size="icon"
          className="size-5 text-canvas-muted-fg hover:text-canvas-fg"
          title="Add fill"
          onClick={handleAddFill}
          disabled={!!warning}
        >
          <Plus size={12} />
        </Button>
      }
    >
      <div className={cn("flex flex-col gap-1.5", !visible && "opacity-50")}>
        <div className="flex items-center gap-1">
          <ToggleGroup
            value={type}
            items={FILL_TYPE_OPTS}
            onChange={handleTypeChange}
            showLabels
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg"
            title={visible ? "Hide fill" : "Show fill"}
            onClick={handleVisibilityToggle}
          >
            {visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg"
            title="Remove fill"
            onClick={handleRemoveFill}
            disabled={!!warning}
          >
            <Minus size={12} />
          </Button>
        </div>

        {type === "solid" && (
          <ColorField
            value={solidPreview ?? solidValue}
            onChange={writeSolidHex}
            title="Fill color"
          />
        )}

        {type === "gradient" && (
          <GradientEditor
            value={gradient}
            onChange={(g) => { setGradient(g); writeGradient(g); }}
          />
        )}

        {type === "image" && (
          <ImageFillEditor
            value={image}
            onChange={(v) => { setImage(v); writeImage(v); }}
          />
        )}
      </div>
    </Section>
  );
});

const BORDER_WIDTH_CLASS_RE = /^border(?:-(?:t|r|b|l|x|y))?(?:-(?:\d+|\[(?:-?\d+(?:\.\d+)?)(?:px|rem|em)?\]))?$/;
const BORDER_STYLE_CLASSES = ["border-solid","border-dashed","border-dotted","border-double","border-hidden","border-none"];

const BorderSection = React.memo(function BorderSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const inlineBorder = sel.element && (
    sourceStyleHasProperty(sel.element, "border-color") ||
    sourceStyleHasProperty(sel.element, "border")
  );
  const warning = inlineBorder ? "border is set in style={{ ... }} — edit the source or remove the inline declaration" : undefined;
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const computedBorderPx = cs ? Math.round(parseFloat(cs.borderTopWidth) || 0) : 0;

  // Detect the currently-active side. Priority: single side > all. Strip the
  // responsive prefix when matching so `md:border-t-2` still counts as top.
  const currentSide = (() => {
    for (const s of ["t", "r", "b", "l"] as const) {
      const pre = `border-${s}`;
      if (h.classes.some(c => {
        const bare = h.stripBpPrefix(c);
        return bare === pre ||
          new RegExp(`^${pre}-\\d+$`).test(bare) ||
          new RegExp(`^${pre}-\\[`).test(bare);
      })) return s;
    }
    return "";
  })();
  const widthPrefix = currentSide ? `border-${currentSide}` : "border";

  const readBorderWidth = (): string => {
    const findBare = (re: RegExp) => {
      const hit = h.classes.find(c => re.test(h.stripBpPrefix(c)));
      return hit ? h.stripBpPrefix(hit) : undefined;
    };
    const bracket = findBare(new RegExp(`^${widthPrefix}-\\[(\\d+(?:\\.\\d+)?)(?:px)?\\]$`));
    if (bracket) return bracket.match(/\[(\d+(?:\.\d+)?)(?:px)?\]/)![1];
    const numbered = findBare(new RegExp(`^${widthPrefix}-\\d+$`));
    if (numbered) return numbered.replace(`${widthPrefix}-`, "");
    if (h.has(widthPrefix)) return "1";
    return "";
  };
  const currentBorderWidth = readBorderWidth();
  const currentBorderPx = currentBorderWidth ? parseInt(currentBorderWidth, 10) : computedBorderPx;

  // Strip the responsive prefix before matching so `md:border-2` counts as a
  // border-width class just like bare `border-2`. The class list (with prefix)
  // is still what we pass to `remove`, so HMR removes the correct token.
  const hasBorderClass = h.classes.some(c => BORDER_WIDTH_CLASS_RE.test(h.stripBpPrefix(c)));
  const hasBorder = hasBorderClass || computedBorderPx > 0;
  const isHidden = h.has("border-none") || h.has("border-hidden");

  const allBorderWidthClasses = () => h.classes.filter(c => BORDER_WIDTH_CLASS_RE.test(h.stripBpPrefix(c)));

  const writeSideAndWidth = useCallback((side: string, n: number) => {
    if (!sel.source) return;
    const remove = allBorderWidthClasses();
    const prefix = side ? `border-${side}` : "border";
    // Tailwind border-width scale: bare `border` = 1px, then 2/4/8. Anything
    // else uses bracket notation with the raw px value.
    let add: string | undefined;
    if (n <= 0) add = undefined;
    else if (n === 1) add = prefix;
    else if ([2, 4, 8].includes(n)) add = `${prefix}-${n}`;
    else add = `${prefix}-[${n}px]`;
    // Anti-flash: paint the new width inline now so the user sees the change
    // without waiting for the file-write → HMR round trip. Width alone
    // renders nothing without a style — paint `solid` too, cleared on HMR.
    if (sel.element) {
      const sideProp = side === "t" ? "borderTopWidth"
        : side === "r" ? "borderRightWidth"
        : side === "b" ? "borderBottomWidth"
        : side === "l" ? "borderLeftWidth"
        : "borderWidth";
      setStyleProp(sel.element, sideProp, n > 0 ? `${n}px` : "0px");
      if (n > 0) setStyleProp(sel.element, "borderStyle", "solid");
    }
    h.debouncedSendPrefixed("border-width", {
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: add ? [add] : undefined,
    }, 120);
    if (sel.element) {
      clearInlineAfterClassUpdate(sel.element, "borderWidth");
      clearInlineAfterClassUpdate(sel.element, "borderTopWidth");
      clearInlineAfterClassUpdate(sel.element, "borderRightWidth");
      clearInlineAfterClassUpdate(sel.element, "borderBottomWidth");
      clearInlineAfterClassUpdate(sel.element, "borderLeftWidth");
      clearInlineAfterClassUpdate(sel.element, "borderStyle");
    }
  }, [h, sel]);

  const writeBorderWidth = (n: number) => writeSideAndWidth(currentSide, n);
  const setSide = (s: string) => writeSideAndWidth(s, currentBorderPx > 0 ? currentBorderPx : 1);

  const borderStyleVal = ["solid","dashed","dotted","double","hidden","none"].find(s => h.has(`border-${s}`)) || "";
  const setBorderStyle = (v: string) => {
    if (!sel.source) return;
    const remove = BORDER_STYLE_CLASSES.map(c => h.actual(c)).filter(Boolean) as string[];
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`border-${v}`] : undefined,
    });
  };

  const addBorder = () => {
    writeSideAndWidth(currentSide, currentBorderPx > 0 ? currentBorderPx : 1);
    // Tailwind v4 dropped preflight's default border color, so bare `border`
    // alone can render as currentColor and look invisible. Seed a visible
    // neutral when no border-color class is already set — the user can
    // recolor from the picker, and this makes the first click land visibly
    // regardless of Tailwind version.
    if (!sel.source) return;
    const hasBorderColor = h.classes.some(c => {
      const bare = h.stripBpPrefix(c);
      if (!/^border-/.test(bare)) return false;
      if (BORDER_WIDTH_CLASS_RE.test(bare)) return false;
      if (BORDER_STYLE_CLASSES.includes(bare)) return false;
      if (/^border-(t|r|b|l|x|y|s|e)(-|$)/.test(bare)) return false;
      return true;
    });
    if (!hasBorderColor) {
      h.sendPrefixed({
        type: "modify-class",
        source: sel.source,
        add: ["border-gray-300"],
      });
    }
  };

  const removeBorder = () => {
    if (!sel.source) return;
    const widths = allBorderWidthClasses();
    const styles = BORDER_STYLE_CLASSES.map(c => h.actual(c)).filter(Boolean) as string[];
    const colors = h.classes.filter(c => {
      const m = h.stripBpPrefix(c).match(/^border-\[(.+)\]$/);
      return !!m && /^(#|rgb|rgba|hsl|hsla|lch|color\(|var\(|color:)/i.test(m[1]);
    });
    const remove = [...widths, ...styles, ...colors];
    // Anti-flash: drop the border visually before the class update lands.
    if (sel.element) {
      setStyleProp(sel.element, "borderWidth", "0px");
      setStyleProp(sel.element, "borderStyle", "none");
    }
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
    });
    if (sel.element) {
      clearInlineAfterClassUpdate(sel.element, "borderWidth");
      clearInlineAfterClassUpdate(sel.element, "borderStyle");
    }
  };

  const toggleVisibility = () => {
    if (!sel.source) return;
    if (isHidden) {
      const remove = [h.actual("border-none"), h.actual("border-hidden")].filter(Boolean) as string[];
      h.sendPrefixed({
        type: "modify-class", source: sel.source,
        remove: remove.length ? remove : undefined,
      });
    } else {
      h.sendPrefixed({
        type: "modify-class", source: sel.source,
        add: ["border-none"],
      });
    }
  };

  const headerAction = (
    <Button
      variant="ghost"
      size="icon"
      title={hasBorder ? "Reset border" : "Add border"}
      aria-label={hasBorder ? "Reset border" : "Add border"}
      onClick={addBorder}
      className="size-5 text-canvas-muted-fg hover:text-canvas-fg"
    >
      <Plus size={12} />
    </Button>
  );

  return (
    <Section title="Border" defaultOpen={false} warning={warning} headerAction={headerAction}
      autoOpenKey={sel.element} hasValue={hasBorder}>
      <div className={cn("flex flex-col gap-1.5", isHidden && "opacity-50")}>
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-1 items-center">
          <ScrubField
            label={<StrokeWeightGlyph />}
            value={currentBorderWidth ? `${currentBorderWidth}px` : ""}
            onChange={raw => {
              const n = parseInt(raw, 10);
              writeBorderWidth(Number.isFinite(n) ? n : 0);
            }}
            placeholder={`${computedBorderPx}px`}
            title="Border weight"
            format={n => `${Math.round(n)}px`}
            presets={BORDER_WIDTH_PRESETS}
          />
          <SelectField
            icon={<BorderAll size={12} />}
            value={currentSide}
            options={BORDER_SIDE_SELECT}
            onChange={setSide}
            placeholder="All"
            title="Border sides"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg disabled:opacity-40"
            onClick={toggleVisibility}
            disabled={!hasBorder}
            title={isHidden ? "Show border" : "Hide border"}
            aria-label={isHidden ? "Show border" : "Hide border"}
          >
            {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg disabled:opacity-40"
            onClick={removeBorder}
            disabled={!hasBorder}
            title="Remove border"
            aria-label="Remove border"
          >
            <Minus size={12} />
          </Button>
        </div>
        {/* Border style used to live in a header popover — moved inline so the
            control stays anchored to the border row it belongs to, and so
            clicking the dropdown doesn't collide with Radix outside-click
            detection inside a shadow DOM (which was dismissing the popover
            before it could interact). */}
        <SelectField
          icon={<Square size={12} />}
          value={borderStyleVal}
          options={BORDER_STYLE_SELECT}
          onChange={setBorderStyle}
          placeholder="Solid"
          title="Border style"
        />
        <ClassColorField h={h} sel={sel} prefix="border"
          computed={cs?.borderTopColor} title="Border color" />
      </div>
    </Section>
  );
});

// ── Tailwind-class ↔ CSS-color bridge ──────────────────────────────────────
// ColorField speaks CSS strings ("#ff0000", "rgba(…)") but our mutations are
// Tailwind classes. This helper reads the current color class (bracketed
// forms like `outline-[#abc]`, `bg-[rgba(0,0,0,.5)]`), falls back to the
// computed style, and writes the next class as `{prefix}-[<color>]` while
// stripping any prior bracketed color of the same prefix.
//
// Width/length classes (e.g. `outline-2`, `outline-[2px]`) are preserved —
// we only touch bracket values whose contents look like a color.
const COLOR_CONTENT = /^(#|rgb|rgba|hsl|hsla|lch|color\(|var\(|color:)/i;

// `arbitraryColorValue` lives in `./properties/shared.js` (shared with
// extracted sections).

function ClassColorField({
  h, sel, prefix, computed, title,
}: {
  h: ClassHelpers;
  sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]>;
  prefix: string;
  computed?: string;
  title?: string;
}) {
  // Find a `{prefix}-[<color>]` class (bracketed form only — named Tailwind
  // color classes stay intact until the user picks a new color). The class
  // list may carry a responsive prefix (e.g. `md:border-[#abc]`), so we match
  // on the bare form and keep the prefixed token for removals.
  const bracketRe = useMemo(() => new RegExp(`^${prefix}-\\[(.+)\\]$`), [prefix]);
  const colorClass = h.classes.find(c => {
    const m = h.stripBpPrefix(c).match(bracketRe);
    return m ? COLOR_CONTENT.test(m[1]) : false;
  });
  const currentBracketed = colorClass ? h.stripBpPrefix(colorClass).match(bracketRe)?.[1] : undefined;
  // `color:var(--x)` is how we write var references into arbitrary values for
  // Tailwind type-inference. Strip the `color:` prefix for display so the
  // ColorField pill/swatch shows the actual value CSS will render.
  const currentDisplay = currentBracketed?.replace(/^color:/, "");
  const current = currentDisplay ?? (computed && computed !== "rgba(0, 0, 0, 0)" ? computed : "");

  // Local preview so the pill + swatch update instantly while the mutation is
  // still in flight. Without this, the ColorField reads `current` from props,
  // which only changes after HMR lands — so the user sees stale display +
  // resets between drag frames. Cleared when the incoming `current` catches
  // up (i.e. the mutation landed).
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (preview === null) return;
    const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    if (norm(current) === norm(preview)) setPreview(null);
  }, [current, preview]);

  const onChange = useCallback((next: string) => {
    if (!sel.source) return;
    setPreview(next);
    // Remove any prior bracketed color class for this prefix.
    const remove = h.classes.filter(c => {
      const m = h.stripBpPrefix(c).match(bracketRe);
      return m ? COLOR_CONTENT.test(m[1]) : false;
    });
    const cleaned = next.replace(/\s+/g, "");
    const add = cleaned ? [`${prefix}-[${arbitraryColorValue(cleaned)}]`] : undefined;
    // Debounce under a per-prefix key — during a SV-area drag the picker
    // emits a new colour every pointermove (~60/s). Each mutation would hit
    // the server + HMR the file. 120ms coalesces drags into a single write
    // without making the live swatch feel laggy.
    h.debouncedSendPrefixed(`color:${prefix}`, {
      type: "modify-class",
      source: sel.source,
      remove: remove.length ? remove : undefined,
      add,
    }, 120);
  }, [h, sel, prefix, bracketRe]);

  return <ColorField value={preview ?? current} onChange={onChange} title={title} />;
}

// Is this class a WIDTH (length) class for the given prefix? Matches bare,
// numeric (e.g. `outline-2`, `border-4`), and bracketed-length (`outline-[2px]`).
// Used to target only width classes during width edits so we don't nuke the
// color class (which also starts with `outline-…`).
const LEN_BRACKET = /^\[(-?\d+(?:\.\d+)?)(?:px|rem|em)?\]$/;
function isWidthClassBare(bare: string, prefix: string): boolean {
  if (bare === prefix) return true;
  if (!bare.startsWith(prefix + "-")) return false;
  const rest = bare.slice(prefix.length + 1);
  if (/^\d+$/.test(rest)) return true;
  return LEN_BRACKET.test(rest);
}
// Keeps the old call sites working — they pass raw (possibly-prefixed) class
// names but only care whether the bare token is a width class.
function isWidthClass(cls: string, prefix: string, stripBp?: (c: string) => string): boolean {
  return isWidthClassBare(stripBp ? stripBp(cls) : cls, prefix);
}

const OUTLINE_STYLE_CLASSES = ["outline-solid","outline-dashed","outline-dotted","outline-double","outline-hidden","outline-none"];
const OUTLINE_STYLE_SELECT = opts(BORDER_STYLE_PRESETS);

const OutlineSection = React.memo(function OutlineSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const inlineOutline = sel.element && (
    sourceStyleHasProperty(sel.element, "outline-color") ||
    sourceStyleHasProperty(sel.element, "outline")
  );
  const warning = inlineOutline ? "outline is set in style={{ ... }} — edit the source or remove the inline declaration" : undefined;
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const outlineWidthPx = cs ? Math.round(parseFloat(cs.outlineWidth) || 0) : 0;
  const outlineOffsetPx = cs ? Math.round(parseFloat(cs.outlineOffset) || 0) : 0;

  const readWidth = (): string => {
    const hit = h.classes.find(c => isWidthClass(c, "outline", h.stripBpPrefix));
    if (!hit) return "";
    const bare = h.stripBpPrefix(hit);
    if (bare === "outline") return "1";
    const rest = bare.slice("outline-".length);
    const m = rest.match(LEN_BRACKET);
    if (m) return m[1];
    return rest;
  };
  const readOffset = (): string => {
    const v = h.get("outline-offset");
    const m = v.match(LEN_BRACKET);
    if (m) return m[1];
    return v || "";
  };

  const currentWidth = readWidth();
  const currentWidthPx = currentWidth ? parseInt(currentWidth, 10) : outlineWidthPx;
  const hasOutline = h.classes.some(c => isWidthClass(c, "outline", h.stripBpPrefix)) || outlineWidthPx > 0;
  const isHidden = h.has("outline-none") || h.has("outline-hidden");

  const writeWidth = useCallback((n: number) => {
    if (!sel.source) return;
    const remove = h.classes.filter(c => isWidthClass(c, "outline", h.stripBpPrefix));
    // Tailwind outline-width scale: bare `outline` = 1px, then 2/4/8.
    // Bracket notation for anything off-scale.
    let add: string | undefined;
    if (n <= 0) add = undefined;
    else if (n === 1) add = "outline";
    else if ([2, 4, 8].includes(n)) add = `outline-${n}`;
    else add = `outline-[${n}px]`;
    // Anti-flash: paint outline inline now so change lands before HMR.
    if (sel.element) {
      setStyleProp(sel.element, "outlineWidth", n > 0 ? `${n}px` : "0px");
      if (n > 0) setStyleProp(sel.element, "outlineStyle", "solid");
    }
    h.debouncedSendPrefixed("outline-width", {
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: add ? [add] : undefined,
    }, 120);
    if (sel.element) {
      clearInlineAfterClassUpdate(sel.element, "outlineWidth");
      clearInlineAfterClassUpdate(sel.element, "outlineStyle");
    }
  }, [h, sel]);

  const writeOffset = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) { h.set("outline-offset", ""); return; }
    h.set("outline-offset", n === 0 ? "" : `[${n}px]`);
  }, [h]);

  const outlineStyleVal = ["solid","dashed","dotted","double","hidden","none"].find(s => h.has(`outline-${s}`)) || "";
  const setOutlineStyle = (v: string) => {
    if (!sel.source) return;
    const remove = OUTLINE_STYLE_CLASSES.map(c => h.actual(c)).filter(Boolean) as string[];
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`outline-${v}`] : undefined,
    });
  };

  const addOutline = () => writeWidth(currentWidthPx > 0 ? currentWidthPx : 1);

  const removeOutline = () => {
    if (!sel.source) return;
    const widths = h.classes.filter(c => isWidthClass(c, "outline", h.stripBpPrefix));
    const styles = OUTLINE_STYLE_CLASSES.map(c => h.actual(c)).filter(Boolean) as string[];
    const offsets = h.classes.filter(c => /^outline-offset(?:-|$)/.test(h.stripBpPrefix(c)));
    const colors = h.classes.filter(c => {
      const m = h.stripBpPrefix(c).match(/^outline-\[(.+)\]$/);
      return !!m && /^(#|rgb|rgba|hsl|hsla|lch|color\(|var\(|color:)/i.test(m[1]);
    });
    const remove = [...widths, ...styles, ...offsets, ...colors];
    // Anti-flash: drop the outline visually before the class update lands.
    if (sel.element) {
      setStyleProp(sel.element, "outlineWidth", "0px");
      setStyleProp(sel.element, "outlineStyle", "none");
    }
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
    });
    if (sel.element) {
      clearInlineAfterClassUpdate(sel.element, "outlineWidth");
      clearInlineAfterClassUpdate(sel.element, "outlineStyle");
    }
  };

  const toggleVisibility = () => {
    if (!sel.source) return;
    if (isHidden) {
      const remove = [h.actual("outline-none"), h.actual("outline-hidden")].filter(Boolean) as string[];
      h.sendPrefixed({
        type: "modify-class", source: sel.source,
        remove: remove.length ? remove : undefined,
      });
    } else {
      h.sendPrefixed({
        type: "modify-class", source: sel.source,
        add: ["outline-none"],
      });
    }
  };

  const headerAction = (
    <Button
      variant="ghost"
      size="icon"
      title={hasOutline ? "Reset outline" : "Add outline"}
      aria-label={hasOutline ? "Reset outline" : "Add outline"}
      onClick={addOutline}
      className="size-5 text-canvas-muted-fg hover:text-canvas-fg"
    >
      <Plus size={12} />
    </Button>
  );

  return (
    <Section title="Outline" defaultOpen={false} warning={warning} headerAction={headerAction}
      autoOpenKey={sel.element} hasValue={hasOutline}>
      <div className={cn("flex flex-col gap-1.5", isHidden && "opacity-50")}>
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-1 items-center">
          <ScrubField
            label={<StrokeWeightGlyph />}
            value={currentWidth ? `${currentWidth}px` : ""}
            onChange={raw => {
              const n = parseInt(raw, 10);
              writeWidth(Number.isFinite(n) ? n : 0);
            }}
            placeholder={`${outlineWidthPx}px`}
            title="Outline weight"
            format={n => `${Math.round(n)}px`}
            presets={BORDER_WIDTH_PRESETS}
          />
          <SelectField
            icon={<Square size={12} />}
            value={outlineStyleVal}
            options={OUTLINE_STYLE_SELECT}
            onChange={setOutlineStyle}
            placeholder="Solid"
            title="Outline style"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg disabled:opacity-40"
            onClick={toggleVisibility}
            disabled={!hasOutline}
            title={isHidden ? "Show outline" : "Hide outline"}
            aria-label={isHidden ? "Show outline" : "Hide outline"}
          >
            {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-canvas-muted-fg hover:text-canvas-fg disabled:opacity-40"
            onClick={removeOutline}
            disabled={!hasOutline}
            title="Remove outline"
            aria-label="Remove outline"
          >
            <Minus size={12} />
          </Button>
        </div>
        {/* Offset moved out of the header popover — a Radix popover inside the
            already-scrolling panel was closing on its own trigger click under
            shadow-DOM event retargeting. Inline keeps it anchored to the
            outline row and always interactable. */}
        <ScrubField
          label="Off"
          value={readOffset() ? `${readOffset()}px` : ""}
          onChange={writeOffset}
          placeholder={`${outlineOffsetPx}px`}
          title="Outline offset"
          format={n => `${Math.round(n)}px`}
        />
        <ClassColorField h={h} sel={sel} prefix="outline"
          computed={cs?.outlineColor} title="Outline color" />
      </div>
    </Section>
  );
});

// Tiny corner glyphs — kept inline, allowed per CLAUDE.md as edge indicators.
const CornerGlyph = ({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
    {corner === "tl" && <path d="M9 1H5a4 4 0 0 0-4 4v4" strokeLinecap="round" />}
    {corner === "tr" && <path d="M1 1h4a4 4 0 0 1 4 4v4" strokeLinecap="round" />}
    {corner === "bl" && <path d="M9 9H5a4 4 0 0 1-4-4V1" strokeLinecap="round" />}
    {corner === "br" && <path d="M1 9h4a4 4 0 0 0 4-4V1" strokeLinecap="round" />}
  </svg>
);

// Four corner brackets enclosing a box — signals "per-corner" radius mode.
// Shown in the Radius section header as the linked→split toggle.
const CornersGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 4V2a1 1 0 0 1 1-1h2" />
    <path d="M11 4V2a1 1 0 0 0-1-1H8" />
    <path d="M1 8v2a1 1 0 0 0 1 1h2" />
    <path d="M11 8v2a1 1 0 0 1-1 1H8" />
  </svg>
);

// All radius Tailwind prefixes: the linked one + every side/corner variant.
const RADIUS_PREFIXES = ["rounded", "rounded-t", "rounded-r", "rounded-b", "rounded-l",
  "rounded-tl", "rounded-tr", "rounded-bl", "rounded-br"];

const RadiusSection = React.memo(function RadiusSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const computedRadius = cs ? Math.round(parseFloat(cs.borderRadius) || 0) : 0;

  const tl = h.get("rounded-tl");
  const tr = h.get("rounded-tr");
  const br = h.get("rounded-br");
  const bl = h.get("rounded-bl");
  const hasSplit = !!(tl || tr || br || bl);
  const [mode, setMode] = useState<LinkMode>(hasSplit ? "split" : "linked");

  // Decode whatever Tailwind form the class is in (named scale like `md`,
  // bracket like `[8px]`, or bare `rounded`) back to a px number. If the
  // suffix doesn't name a scale we fall back to the computed CSS value so
  // the panel always shows what the element actually renders.
  const decodeCornerPx = (suffix: string, cssProp: "borderTopLeftRadius" | "borderTopRightRadius" | "borderBottomLeftRadius" | "borderBottomRightRadius"): number => {
    const fromSuffix = radiusSuffixToPx(suffix);
    if (fromSuffix !== null) return Math.round(fromSuffix);
    if (cs) {
      const n = parseFloat(cs[cssProp]);
      if (Number.isFinite(n)) return Math.round(n);
    }
    return 0;
  };

  // Linked writer: remove every existing radius class (whole + per-side +
  // per-corner) so the linked value is canonical and we never leave a
  // stale `rounded-tl-*` contradicting it.
  const writeLinked = useCallback((n: number) => {
    if (!sel.source) return;
    const remove = h.classes.filter(c => {
      const bare = h.stripBpPrefix(c);
      return RADIUS_PREFIXES.some(p => bare === p || bare.startsWith(p + "-"));
    });
    const suffix = pxToRadiusSuffix(n);
    // `suffix === ""` represents the bare `rounded` class (4px) — emit it
    // as-is instead of `rounded-` which isn't a valid utility.
    const add = n <= 0 ? undefined : [suffix === "" ? "rounded" : `rounded-${suffix}`];
    if (sel.element) {
      setStyleProp(sel.element, "borderRadius", `${Math.max(0, n)}px`);
      clearInlineAfterClassUpdate(sel.element, "borderRadius");
    }
    h.debouncedSendPrefixed("rounded", {
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add,
    }, 120);
  }, [h, sel]);

  const writeCorner = useCallback((corner: "tl" | "tr" | "bl" | "br", n: number) => {
    h.set(`rounded-${corner}`, pxToRadiusSuffix(n));
  }, [h]);

  const linkedPx = (() => {
    const decoded = radiusSuffixToPx(h.get("rounded"));
    return decoded !== null ? Math.round(decoded) : computedRadius;
  })();

  const tlPx = decodeCornerPx(tl, "borderTopLeftRadius");
  const trPx = decodeCornerPx(tr, "borderTopRightRadius");
  const blPx = decodeCornerPx(bl, "borderBottomLeftRadius");
  const brPx = decodeCornerPx(br, "borderBottomRightRadius");

  const toggle = (
    <button
      type="button"
      onClick={() => setMode(mode === "linked" ? "split" : "linked")}
      title={mode === "linked" ? "Per-corner radius" : "Linked radius"}
      aria-label={mode === "linked" ? "Switch to per-corner radius" : "Switch to linked radius"}
      aria-pressed={mode === "split"}
      className={cn(
        "inline-flex items-center justify-center h-6 w-6 rounded-md",
        "text-canvas-muted-fg hover:text-canvas-fg hover:bg-canvas-muted/60",
        "transition-colors",
        mode === "split" && "text-canvas-fg bg-canvas-muted",
      )}
    >
      <CornersGlyph />
    </button>
  );

  return (
    <Section title="Radius" defaultOpen={false}
      autoOpenKey={sel.element}
      hasValue={computedRadius > 0 || !!h.classes.find(c => /^rounded(?:-|$)/.test(h.stripBpPrefix(c)))}>
      {mode === "linked" ? (
        <div className="grid grid-cols-[1fr_4rem_auto] gap-1.5 items-center">
          <Slider
            value={linkedPx}
            min={0} max={80} step={1}
            onChange={n => { if (sel.element) setStyleProp(sel.element, "borderRadius", `${n}px`); }}
            onCommit={n => {
              writeLinked(n);
              if (sel.element) clearInlineAfterClassUpdate(sel.element, "borderRadius");
            }}
            showValue={false}
          />
          <ScrubField
            value={`${linkedPx}px`}
            onChange={raw => {
              const n = parseInt(raw, 10);
              writeLinked(Number.isFinite(n) ? n : 0);
            }}
            placeholder={`${computedRadius}px`}
            format={n => `${Math.round(n)}px`}
            presets={RADIUS_PRESETS}
          />
          {toggle}
        </div>
      ) : (
        <div className="flex gap-1.5 items-center">
          <div className="grid grid-cols-2 gap-1.5 flex-1 min-w-0">
            <ScrubField label={<CornerGlyph corner="tl" />} value={`${tlPx}px`}
              onChange={v => writeCorner("tl", parseInt(v, 10) || 0)}
              placeholder={`${tlPx}px`} title="Top-left"
              format={n => `${Math.round(n)}px`} presets={RADIUS_PRESETS} />
            <ScrubField label={<CornerGlyph corner="tr" />} value={`${trPx}px`}
              onChange={v => writeCorner("tr", parseInt(v, 10) || 0)}
              placeholder={`${trPx}px`} title="Top-right"
              format={n => `${Math.round(n)}px`} presets={RADIUS_PRESETS} />
            <ScrubField label={<CornerGlyph corner="bl" />} value={`${blPx}px`}
              onChange={v => writeCorner("bl", parseInt(v, 10) || 0)}
              placeholder={`${blPx}px`} title="Bottom-left"
              format={n => `${Math.round(n)}px`} presets={RADIUS_PRESETS} />
            <ScrubField label={<CornerGlyph corner="br" />} value={`${brPx}px`}
              onChange={v => writeCorner("br", parseInt(v, 10) || 0)}
              placeholder={`${brPx}px`} title="Bottom-right"
              format={n => `${Math.round(n)}px`} presets={RADIUS_PRESETS} />
          </div>
          {toggle}
        </div>
      )}
    </Section>
  );
});

// Shadow + InnerShadow sections live in `./properties/shadow-section.js`
// and load on demand via `React.lazy`. The whole block — layer parser,
// row editor, preset select — was ~280 lines and ~8KB that only runs
// when a user opens the shadow drawer. Moved out so the main chunk isn't
// paying for it on every cold overlay boot.

// ──────────────────────────────────────────────────────────────────────────
// Transform
// ──────────────────────────────────────────────────────────────────────────
// Rotate + scale scrubs. Tailwind's rotate/scale utilities are a mix of
// named scale steps and negative-prefix utilities (`-rotate-45`, `-scale-x-100`)
// — we emit arbitrary `rotate-[Ndeg]` and `scale-[N]` so the scrub isn't
// constrained to the 10-ish preset values.

// Transform section lives in `./properties/transform-section.js`.
// Typography section lives in `./properties/typography-section.js`.
// Blending section lives in `./properties/blending-section.js`.

// ══════════════════════════════════════════════════════════════════════════════
// New sections: Background / Transforms / Filters / Transitions / Interactivity / SVG / Tables
// Every numeric knob below uses SliderValueInput (slider + free-entry input)
// instead of a preset-only dropdown.
// ══════════════════════════════════════════════════════════════════════════════

// `Sel` type imported from `./properties/shared.js` (see top of file).

// ── Sub-components ──

function IconBtn({ icon, onClick, title }: { icon: React.ReactNode; onClick?: () => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 26, borderRadius: 5,
        border: "none", background: "transparent",
        color: C.fgMuted, cursor: "pointer",
        transition: "all 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.fg; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgMuted; }}
    >
      {icon}
    </button>
  );
}

// ── Styles ──
const panelStyle: React.CSSProperties = {
  position: "fixed", top: 8, right: 8, bottom: 8, width: 280,
  background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
  overflow: "visible", display: "flex", flexDirection: "column",
  pointerEvents: "auto", fontFamily: C.font, fontSize: 11,
  color: C.fg, WebkitFontSmoothing: "antialiased", userSelect: "none",
  zIndex: 2147483647,
  animation: "canvasPanelSlideInRight 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 10px", borderBottom: `1px solid ${C.border}`,
  minHeight: 38,
};
