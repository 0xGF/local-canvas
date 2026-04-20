import React, { useState, useCallback, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useReadonlyStyleStore } from "../stores/readonly-style-store.js";
import { useClassHelpers } from "../hooks/useClassHelpers.js";
import { sourceStyleHasProperty } from "../utils/inline-style-source.js";
import { getCachedStyle } from "../utils/style-cache.js";
import { setStyleProp } from "../utils/dom-style.js";
import { useCSSVariables, filterVariables } from "../hooks/useCSSVariables.js";
import { Section, PropRow, SubLabel } from "./ui/section.js";
import { CustomSelect } from "./ui/custom-select.js";
import { NumberInput } from "./ui/number-input.js";
import { ToggleGroup } from "./ui/toggle-group.js";
import { ColorPicker } from "./ui/color-picker.js";
import { VariableSuggest } from "./ui/variable-suggest.js";
import { ValueInput } from "./ui/value-input.js";
import { SliderValueInput } from "./ui/slider-value-input.js";
import { LENGTH, INTEGER, GRID_COLS, KEYWORD, ANGLE, DURATION, NUMBER } from "./ui/value-input.parsers.js";
import { THEME } from "../theme.js";
import { PREFIX_TO_CSS } from "../canvas/constants.js";
import {
  DISPLAY_OPTS, FLEX_DIR_OPTS,
  OPACITY_MAP,
  JUSTIFY_OPTIONS, ALIGN_OPTIONS,
  SHADOW_PRESETS, POSITION_OPTIONS, OVERFLOW_OPTIONS, Z_INDEX_PRESETS, SIZE_PRESETS,
  INSET_PRESETS, LEADING_PRESETS, TRACKING_PRESETS, GRID_COLS_PRESETS, FLEX_ITEM_PRESETS,
  BORDER_STYLE_PRESETS, RADIUS_PRESETS, FONT_WEIGHT_PRESETS,
  pxToTwScale, twValueToPx,
} from "./PropertiesPanel.constants.js";
import {
  ASPECT_RATIO_PRESETS, BOX_SIZING_OPTIONS, FLOAT_OPTIONS, CLEAR_OPTIONS,
  OBJECT_FIT_OPTIONS, OBJECT_POSITION_PRESETS, VISIBILITY_OPTIONS,
  TEXT_TRANSFORM_OPTIONS, TEXT_OVERFLOW_OPTIONS, TEXT_WRAP_OPTIONS,
  WHITE_SPACE_OPTIONS, WORD_BREAK_OPTIONS, FONT_STYLE_OPTIONS,
  TEXT_DECORATION_LINE_OPTIONS, TEXT_DECORATION_STYLE_OPTIONS,
  ROTATE_PRESETS, SCALE_PRESETS, TRANSFORM_ORIGIN_OPTIONS,
  BLUR_PRESETS, FILTER_PERCENT_PRESETS, HUE_ROTATE_PRESETS,
  DURATION_PRESETS, TIMING_FUNCTION_OPTIONS, ANIMATION_OPTIONS, TRANSITION_PROPERTY_OPTIONS,
  CURSOR_OPTIONS, POINTER_EVENTS_OPTIONS, USER_SELECT_OPTIONS,
  RESIZE_OPTIONS, SCROLL_BEHAVIOR_OPTIONS, WILL_CHANGE_OPTIONS,
  BG_ATTACHMENT_OPTIONS, BG_CLIP_OPTIONS, BG_ORIGIN_OPTIONS,
  BG_REPEAT_OPTIONS, BG_SIZE_OPTIONS, BG_POSITION_PRESETS, BG_IMAGE_PRESETS,
  BLEND_MODE_OPTIONS,
  BORDER_COLLAPSE_OPTIONS, TABLE_LAYOUT_OPTIONS, CAPTION_SIDE_OPTIONS,
} from "./PropertiesPanel.presets.js";
import {
  X,
  AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  MoveRight, MoveDown, MoveLeft, MoveUp,
  Square, Columns3, Grid3x3, EyeOff,
} from "./icons.js";

const C = THEME;

// ── Font-size presets (keyword + px label) ──
const FONT_SIZE_PRESETS = [
  { value: "xs", label: "12px" },
  { value: "sm", label: "14px" },
  { value: "base", label: "16px" },
  { value: "lg", label: "18px" },
  { value: "xl", label: "20px" },
  { value: "2xl", label: "24px" },
  { value: "3xl", label: "30px" },
  { value: "4xl", label: "36px" },
  { value: "5xl", label: "48px" },
  { value: "6xl", label: "60px" },
  { value: "7xl", label: "72px" },
  { value: "8xl", label: "96px" },
  { value: "9xl", label: "128px" },
];

// ── Type for shared helpers ──
type ClassHelpers = ReturnType<typeof useClassHelpers>;

// ══════════════════════════════════════════════════════════════════════════════
// LengthRow — scrubbable label + free-entry ValueInput for px lengths.
//
// Replaces the fixed-max SliderInput for padding/margin/radius so users can
// enter arbitrary values (1.5rem, 50%, calc(...), -12px) while still getting
// scrub-drag on the label for quick px tweaks.
// ══════════════════════════════════════════════════════════════════════════════

interface LengthRowProps {
  label: string;
  value: string;                                    // Tailwind value (scale key or "[...]")
  presets?: { value: string; label?: string }[];
  /** Called during scrub drag — emit live preview CSS value */
  onLivePreview?: (px: number) => void;
  /** Called when user commits via scrub end / typed entry */
  onCommit: (value: string) => void;
  /** Optional: starting px value used as scrub base (override auto-decoded). */
  initialPx?: number;
  placeholder?: string;
}

function LengthRow({
  label,
  value,
  presets,
  onLivePreview,
  onCommit,
  initialPx,
  placeholder,
}: LengthRowProps) {
  const startRef = useRef({ x: 0, v: 0 });
  const scrubbing = useRef(false);

  const handleLabelDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const base = initialPx ?? twValueToPx(value);
    startRef.current = { x: e.clientX, v: base };
    scrubbing.current = true;

    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startRef.current.x;
      const step = ev.shiftKey ? 10 : 1;
      // 0.5 px per pixel travelled feels right for spacing work
      const next = Math.round(startRef.current.v + dx * step * 0.5);
      onLivePreview?.(next);
    };

    const handleUp = (ev: MouseEvent) => {
      const dx = ev.clientX - startRef.current.x;
      const step = ev.shiftKey ? 10 : 1;
      const next = Math.round(startRef.current.v + dx * step * 0.5);
      onCommit(pxToTwScale(next));
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      scrubbing.current = false;
    };

    document.body.style.cursor = "ew-resize";
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [value, initialPx, onLivePreview, onCommit]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        onMouseDown={handleLabelDown}
        title={`Drag to scrub — shift for ×10. Click the input to type any value.`}
        style={{
          fontSize: 10, color: C.fgDim, width: 52, flexShrink: 0,
          cursor: "ew-resize", userSelect: "none", fontWeight: 400,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ValueInput
          value={value}
          presets={presets}
          onChange={onCommit}
          strategy={LENGTH}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main PropertiesPanel — thin shell that delegates to memoized sections
// ══════════════════════════════════════════════════════════════════════════════

export const PropertiesPanel = React.memo(function PropertiesPanel() {
  const sel = useEditorStore((s) => s.selectedElement);
  const open = useEditorStore((s) => s.propertiesOpen);
  const toggle = useEditorStore((s) => s.toggleProperties);
  const helpers = useClassHelpers();
  const readonlyEntries = useReadonlyStyleStore((s) => s.entries);

  if (!open || !sel) return null;

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
              background: "rgba(168,85,247,0.15)", color: "#a855f7", fontSize: 9,
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
          color: "#f87171",
          background: "rgba(248, 113, 113, 0.08)",
          borderBottom: `1px solid ${C.border}`,
          lineHeight: 1.4,
          fontFamily: C.mono,
        }}>
          Read-only: <strong>{unmutableProps.join(", ")}</strong>. Source uses
          a computed value (template, ternary, or variable) — edit the source
          directly or swap to a className.
        </div>
      )}

      <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}>
        <PositionSection h={helpers} sel={sel} />
        <LayoutSection h={helpers} sel={sel} />
        <SizeSection h={helpers} />
        <FlexItemSection h={helpers} sel={sel} />
        <SpacingSection h={helpers} sel={sel} />
        <TypographySection h={helpers} sel={sel} />
        <TextColorSection h={helpers} sel={sel} />
        <FillSection h={helpers} sel={sel} />
        <BorderSection h={helpers} sel={sel} />
        <OutlineSection h={helpers} sel={sel} />
        <RadiusSection h={helpers} sel={sel} />
        <ShadowSection h={helpers} />
        <OpacitySection h={helpers} />
        <BackgroundSection h={helpers} sel={sel} />
        <TransformsSection h={helpers} sel={sel} />
        <FiltersSection h={helpers} sel={sel} />
        <BackdropFiltersSection h={helpers} sel={sel} />
        <TransitionsSection h={helpers} sel={sel} />
        <InteractivitySection h={helpers} sel={sel} />
        <SvgSection h={helpers} sel={sel} />
        <TablesSection h={helpers} sel={sel} />
        <CSSVariablesSection h={helpers} sel={sel} />
        <ClassesSection h={helpers} sel={sel} />
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Memoized Sections
// ══════════════════════════════════════════════════════════════════════════════

const PositionSection = React.memo(function PositionSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const cs0 = sel.element ? getCachedStyle(sel.element) : null;
  const rect = {
    x: sel.element?.offsetLeft ?? sel.rect.left,
    y: sel.element?.offsetTop ?? sel.rect.top,
    width: parseFloat(cs0?.width || "") || sel.rect.width,
    height: parseFloat(cs0?.height || "") || sel.rect.height,
  };

  const setTextAlign = (v: string) => {
    const map: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
    const remove = ["text-left", "text-center", "text-right"].map(c => h.actual(c)).filter(Boolean) as string[];
    const add = map[v] ? [h.prefixCls(map[v])] : [];
    if (sel.source) h.trackedSendMutation({ type: "modify-class", source: sel.source, remove: remove.length ? remove : undefined, add: add.length ? add : undefined });
  };

  const setVerticalAlign = (v: string) => {
    const map: Record<string, string> = { start: "self-start", center: "self-center", end: "self-end" };
    const remove = ["self-start", "self-center", "self-end"].map(c => h.actual(c)).filter(Boolean) as string[];
    const add = map[v] ? [h.prefixCls(map[v])] : [];
    if (sel.source) h.trackedSendMutation({ type: "modify-class", source: sel.source, remove: remove.length ? remove : undefined, add: add.length ? add : undefined });
  };

  return (
    <Section title="Position" defaultOpen>
      <SubLabel>Text Alignment</SubLabel>
      <div style={{ display: "flex", gap: 6 }}>
        <ToggleGroup
          value={h.has("text-left") ? "left" : h.has("text-center") ? "center" : h.has("text-right") ? "right" : ""}
          items={[
            { value: "left", icon: <AlignLeft size={14} />, title: "Align Text Left" },
            { value: "center", icon: <AlignCenter size={14} />, title: "Align Text Center" },
            { value: "right", icon: <AlignRight size={14} />, title: "Align Text Right" },
          ]}
          onChange={setTextAlign}
        />
        <ToggleGroup
          value={h.has("self-start") ? "start" : h.has("self-center") ? "center" : h.has("self-end") ? "end" : ""}
          items={[
            { value: "start", icon: <AlignStartVertical size={14} />, title: "Align Self: Top" },
            { value: "center", icon: <AlignCenterVertical size={14} />, title: "Align Self: Center" },
            { value: "end", icon: <AlignEndVertical size={14} />, title: "Align Self: Bottom" },
          ]}
          onChange={setVerticalAlign}
        />
      </div>
      <SubLabel>Dimensions</SubLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <NumberInput label="X" value={Math.round(rect.x)} readOnly suffix="px" />
        <NumberInput label="Y" value={Math.round(rect.y)} readOnly suffix="px" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
        <PropRow label="W">
          <ValueInput value={h.get("w")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("w", v)} placeholder={`${Math.round(rect.width)}px`} />
        </PropRow>
        <PropRow label="H">
          <ValueInput value={h.get("h")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("h", v)} placeholder={`${Math.round(rect.height)}px`} />
        </PropRow>
      </div>
    </Section>
  );
});

const LayoutSection = React.memo(function LayoutSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const display = h.findCls(DISPLAY_OPTS);
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";
  const flexDir = h.findPrefixedCls("flex-", FLEX_DIR_OPTS);
  const flexDirVal = flexDir ? flexDir.replace("flex-", "") : "row";
  const positionType = h.findCls(["relative","absolute","fixed","sticky"]);
  const isPositioned = positionType !== "";

  // h.set with isExact=false already concatenates `${prefix}-${value}`, so
  // bracket values like "[27px]" correctly emit `top-[27px]`. We only route
  // through a helper to keep the JSX short.
  const setLengthClass = useCallback((prefix: string, v: string) => {
    h.set(prefix, v);
  }, [h]);

  return (
    <Section title="Layout" defaultOpen>
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
        <>
          <SubLabel>Flex Direction</SubLabel>
          <ToggleGroup
            value={flexDirVal}
            items={[
              { value: "row", icon: <MoveRight size={14} />, label: "Row", title: "Flex: Row (horizontal)" },
              { value: "col", icon: <MoveDown size={14} />, label: "Col", title: "Flex: Column (vertical)" },
              { value: "row-reverse", icon: <MoveLeft size={14} />, title: "Flex: Row Reverse" },
              { value: "col-reverse", icon: <MoveUp size={14} />, title: "Flex: Column Reverse" },
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
          <PropRow label="Justify">
            <CustomSelect value={h.get("justify")} options={JUSTIFY_OPTIONS} onChange={v => h.set("justify", v)} />
          </PropRow>
          <PropRow label="Align">
            <CustomSelect value={h.get("items")} options={ALIGN_OPTIONS} onChange={v => h.set("items", v)} />
          </PropRow>
          <PropRow label="Gap">
            <ValueInput value={h.get("gap")} strategy={LENGTH} onChange={v => h.set("gap", v)} placeholder="0" />
          </PropRow>
        </>
      )}
      {isGrid && (
        <>
          <PropRow label="Columns">
            <ValueInput value={h.get("grid-cols")} presets={GRID_COLS_PRESETS} strategy={GRID_COLS} onChange={v => h.set("grid-cols", v)} />
          </PropRow>
          <PropRow label="Gap">
            <ValueInput value={h.get("gap")} strategy={LENGTH} onChange={v => h.set("gap", v)} placeholder="0" />
          </PropRow>
        </>
      )}
      <PropRow label="Position">
        <CustomSelect value={positionType} options={POSITION_OPTIONS} onChange={v => {
          const oldActual = ["relative","absolute","fixed","sticky"].map(c => h.actual(c)).filter(Boolean) as string[];
          h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
        }} />
      </PropRow>
      {isPositioned && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <PropRow label="Top"><ValueInput value={h.get("top")} presets={INSET_PRESETS} strategy={LENGTH} onChange={v => setLengthClass("top", v)} placeholder="auto" /></PropRow>
          <PropRow label="Right"><ValueInput value={h.get("right")} presets={INSET_PRESETS} strategy={LENGTH} onChange={v => setLengthClass("right", v)} placeholder="auto" /></PropRow>
          <PropRow label="Bottom"><ValueInput value={h.get("bottom")} presets={INSET_PRESETS} strategy={LENGTH} onChange={v => setLengthClass("bottom", v)} placeholder="auto" /></PropRow>
          <PropRow label="Left"><ValueInput value={h.get("left")} presets={INSET_PRESETS} strategy={LENGTH} onChange={v => setLengthClass("left", v)} placeholder="auto" /></PropRow>
        </div>
      )}
      <PropRow label="Z-Index">
        <ValueInput value={h.get("z")} presets={Z_INDEX_PRESETS} strategy={INTEGER} onChange={v => h.set("z", v)} placeholder="auto" />
      </PropRow>
      <PropRow label="Overflow">
        <CustomSelect value={h.get("overflow")} options={OVERFLOW_OPTIONS} onChange={v => h.set("overflow", v)} />
      </PropRow>
      <PropRow label="Aspect">
        <ValueInput value={h.get("aspect")} presets={ASPECT_RATIO_PRESETS} strategy={KEYWORD}
          onChange={v => h.set("aspect", v)} placeholder="auto" />
      </PropRow>
      <PropRow label="Box">
        <CustomSelect
          value={["border","content"].find(c => h.has(`box-${c}`)) || ""}
          options={BOX_SIZING_OPTIONS}
          onChange={v => {
            const oldActual = ["border","content"].map(c => h.actual(`box-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`box-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Object fit">
        <CustomSelect
          value={["contain","cover","fill","none","scale-down"].find(c => h.has(`object-${c}`)) || ""}
          options={OBJECT_FIT_OPTIONS}
          onChange={v => {
            const oldActual = ["contain","cover","fill","none","scale-down"].map(c => h.actual(`object-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`object-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Object pos">
        <ValueInput value={h.get("object")} presets={OBJECT_POSITION_PRESETS} strategy={KEYWORD}
          onChange={v => h.set("object", v)} placeholder="center" />
      </PropRow>
      <PropRow label="Visibility">
        <CustomSelect
          value={["visible","invisible","collapse"].find(c => h.has(c)) || ""}
          options={VISIBILITY_OPTIONS}
          onChange={v => {
            const oldActual = ["visible","invisible","collapse"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Float">
        <CustomSelect
          value={["left","right","start","end","none"].find(c => h.has(`float-${c}`)) || ""}
          options={FLOAT_OPTIONS}
          onChange={v => {
            const oldActual = ["left","right","start","end","none"].map(c => h.actual(`float-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`float-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Clear">
        <CustomSelect
          value={["left","right","both","start","end","none"].find(c => h.has(`clear-${c}`)) || ""}
          options={CLEAR_OPTIONS}
          onChange={v => {
            const oldActual = ["left","right","both","start","end","none"].map(c => h.actual(`clear-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`clear-${v}`] : undefined });
          }}
        />
      </PropRow>
    </Section>
  );
});

const SizeSection = React.memo(function SizeSection({ h }: { h: ClassHelpers }) {
  return (
    <Section title="Size" defaultOpen={false}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <PropRow label="W"><ValueInput value={h.get("w")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("w", v)} placeholder="auto" /></PropRow>
        <PropRow label="H"><ValueInput value={h.get("h")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("h", v)} placeholder="auto" /></PropRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
        <PropRow label="Min W"><ValueInput value={h.get("min-w")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("min-w", v)} placeholder="0" /></PropRow>
        <PropRow label="Max W"><ValueInput value={h.get("max-w")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("max-w", v)} placeholder="none" /></PropRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
        <PropRow label="Min H"><ValueInput value={h.get("min-h")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("min-h", v)} placeholder="0" /></PropRow>
        <PropRow label="Max H"><ValueInput value={h.get("max-h")} presets={SIZE_PRESETS} strategy={LENGTH} onChange={v => h.set("max-h", v)} placeholder="none" /></PropRow>
      </div>
    </Section>
  );
});

const FlexItemSection = React.memo(function FlexItemSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const parentIsFlex = sel.element?.parentElement ? getCachedStyle(sel.element.parentElement).display.includes("flex") : false;
  if (!parentIsFlex) return null;

  // "flex-*" classes are emitted as exact class names (presets contain
  // "flex-1", "flex-auto"…). Typing a bare number emits e.g. "flex-2".
  const flexPresetValues = FLEX_ITEM_PRESETS.map(o => o.value).filter(Boolean);
  const currentFlex = h.findCls(flexPresetValues) || h.classes.find(c => /^flex-\d+$/.test(c) || /^flex-\[/.test(c)) || "";

  return (
    <Section title="Flex Item" defaultOpen>
      <PropRow label="Flex">
        <ValueInput
          value={currentFlex}
          presets={FLEX_ITEM_PRESETS}
          strategy={KEYWORD}
          onChange={v => {
            const old = flexPresetValues.map(c => h.actual(c)).filter(Boolean) as string[];
            const numericExisting = h.classes.filter(c => /^flex-\d+$/.test(c) || /^flex-\[/.test(c));
            h.sendPrefixed({
              type: "modify-class", source: sel.source!,
              remove: [...old, ...numericExisting].length ? [...old, ...numericExisting] : undefined,
              add: v ? [v.startsWith("flex-") ? v : `flex-${v}`] : undefined,
            });
          }}
        />
      </PropRow>
      <PropRow label="Self">
        <CustomSelect value={h.get("self")} options={ALIGN_OPTIONS} onChange={v => h.set("self", v)} />
      </PropRow>
      <PropRow label="Order">
        <ValueInput value={h.get("order")} strategy={INTEGER} onChange={v => h.set("order", v)} placeholder="0" />
      </PropRow>
    </Section>
  );
});

// ── Spacing visualizer (combined padding + margin) ──
//
// Figma-style box-in-box diagram: outer rect = margin, inner rect = padding.
// Each of the 8 sides gets a compact ValueInput straddling the matching
// border. Click-and-drag the axis label (Top/Right/…) to scrub; type any
// CSS value (27, 27px, 1.5rem, 50%, -12px, calc(...)) directly.
const SPACING_OUTER_W = 256;
const SPACING_OUTER_H = 170;
const SPACING_INNER_W = 124;
const SPACING_INNER_H = 72;
const SPACING_INPUT_W = 54;
const SPACING_INPUT_H = 22;
const SPACING_SIDE_PAD_X = 22;                           // gap between container edge and outer box
const SPACING_SIDE_PAD_Y = 24;                           // leaves room for the Mt label above and Mb label below
const OUTER_X = SPACING_SIDE_PAD_X;
const OUTER_Y = SPACING_SIDE_PAD_Y;
const OUTER_RIGHT = OUTER_X + (SPACING_OUTER_W - 2 * SPACING_SIDE_PAD_X);
const OUTER_BOTTOM = OUTER_Y + (SPACING_OUTER_H - 2 * SPACING_SIDE_PAD_Y);
const INNER_X = OUTER_X + (OUTER_RIGHT - OUTER_X - SPACING_INNER_W) / 2;
const INNER_Y = OUTER_Y + (OUTER_BOTTOM - OUTER_Y - SPACING_INNER_H) / 2;
const INNER_RIGHT = INNER_X + SPACING_INNER_W;
const INNER_BOTTOM = INNER_Y + SPACING_INNER_H;

// Centered input positions (top-left x/y of the input element).
const pos = {
  mt: { x: (OUTER_X + OUTER_RIGHT) / 2 - SPACING_INPUT_W / 2, y: OUTER_Y - SPACING_INPUT_H / 2 },
  mr: { x: OUTER_RIGHT - SPACING_INPUT_W / 2,                 y: (OUTER_Y + OUTER_BOTTOM) / 2 - SPACING_INPUT_H / 2 },
  mb: { x: (OUTER_X + OUTER_RIGHT) / 2 - SPACING_INPUT_W / 2, y: OUTER_BOTTOM - SPACING_INPUT_H / 2 },
  ml: { x: OUTER_X - SPACING_INPUT_W / 2,                      y: (OUTER_Y + OUTER_BOTTOM) / 2 - SPACING_INPUT_H / 2 },
  pt: { x: (INNER_X + INNER_RIGHT) / 2 - SPACING_INPUT_W / 2, y: INNER_Y - SPACING_INPUT_H / 2 },
  pr: { x: INNER_RIGHT - SPACING_INPUT_W / 2,                  y: (INNER_Y + INNER_BOTTOM) / 2 - SPACING_INPUT_H / 2 },
  pb: { x: (INNER_X + INNER_RIGHT) / 2 - SPACING_INPUT_W / 2, y: INNER_BOTTOM - SPACING_INPUT_H / 2 },
  pl: { x: INNER_X - SPACING_INPUT_W / 2,                      y: (INNER_Y + INNER_BOTTOM) / 2 - SPACING_INPUT_H / 2 },
} as const;

function SpacingInput({
  x, y, value, onScrubStart, onChange, initialPx, title,
}: {
  x: number; y: number; value: string; initialPx: number;
  onScrubStart: (startPx: number) => (ev: MouseEvent, shift: boolean) => number;
  onChange: (v: string) => void;
  title?: string;
}) {
  const startRef = useRef({ x: 0, base: 0 });
  const handleLabelMouseDown = useCallback((e: React.MouseEvent) => {
    // Only scrub when the user drags on the edge "grip" area — clicking the
    // input itself should focus it for typing. We read the mousedown; if
    // movement exceeds a threshold before mouseup, we treat it as a scrub.
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    startRef.current = { x: e.clientX, base: initialPx };
    let moved = false;

    const updater = onScrubStart(initialPx);
    const handleMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientX - startRef.current.x) < 2) return;
      moved = true;
      document.body.style.cursor = "ew-resize";
      updater(ev, ev.shiftKey);
    };
    const handleUp = (ev: MouseEvent) => {
      document.body.style.cursor = "";
      if (moved) {
        const px = updater(ev, ev.shiftKey);
        onChange(pxToTwScale(px));
      }
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [initialPx, onScrubStart, onChange]);

  return (
    <div
      onMouseDown={handleLabelMouseDown}
      title={title}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: SPACING_INPUT_W,
        height: SPACING_INPUT_H,
        cursor: "ew-resize",
      }}
    >
      <ValueInput
        value={value}
        onChange={onChange}
        strategy={LENGTH}
        placeholder="auto"
        height={SPACING_INPUT_H}
        align="center"
        fontSize={10}
      />
    </div>
  );
}

const SpacingSection = React.memo(function SpacingSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const el = sel.element;
  const cs = el ? getCachedStyle(el) : null;

  const currentPx = (prefix: keyof typeof pos): number => {
    if (!cs) return twValueToPx(h.get(prefix));
    switch (prefix) {
      case "mt": return parseFloat(cs.marginTop) || 0;
      case "mr": return parseFloat(cs.marginRight) || 0;
      case "mb": return parseFloat(cs.marginBottom) || 0;
      case "ml": return parseFloat(cs.marginLeft) || 0;
      case "pt": return parseFloat(cs.paddingTop) || 0;
      case "pr": return parseFloat(cs.paddingRight) || 0;
      case "pb": return parseFloat(cs.paddingBottom) || 0;
      case "pl": return parseFloat(cs.paddingLeft) || 0;
    }
  };

  const livePreview = useCallback((prefix: string, px: number) => {
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) setStyleProp(el, cssProp, px + "px");
  }, [el]);

  const commitCls = useCallback((prefix: string, v: string) => {
    h.set(prefix, v, false, true);
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) {
      const observer = new MutationObserver(() => {
        setStyleProp(el, cssProp, "");
        observer.disconnect();
        clearTimeout(fallback);
      });
      observer.observe(el, { attributes: true, attributeFilter: ["class"] });
      const fallback = setTimeout(() => { setStyleProp(el, cssProp, ""); observer.disconnect(); }, 5000);
    }
  }, [el, h]);

  // Build a scrub-updater closure per-side. Returns the new px so the caller
  // can emit both a live preview during move AND a final commit on mouseup.
  const makeScrub = useCallback((prefix: string) => (startPx: number) => {
    let startX: number | null = null;
    return (ev: MouseEvent, shift: boolean) => {
      if (startX === null) startX = ev.clientX;
      const dx = ev.clientX - startX;
      const step = shift ? 10 : 1;
      const next = Math.max(0, Math.round(startPx + dx * step * 0.5));
      livePreview(prefix, next);
      return next;
    };
  }, [livePreview]);

  return (
    <Section title="Spacing" defaultOpen>
      <div style={{ position: "relative", width: SPACING_OUTER_W, height: SPACING_OUTER_H, margin: "0 auto" }}>
        {/* Margin box */}
        <div style={{
          position: "absolute",
          left: OUTER_X, top: OUTER_Y,
          width: OUTER_RIGHT - OUTER_X, height: OUTER_BOTTOM - OUTER_Y,
          border: `1px solid ${C.border}`, borderRadius: 6,
          background: "rgba(254, 115, 56, 0.05)",
        }} />
        {/* Padding box */}
        <div style={{
          position: "absolute",
          left: INNER_X, top: INNER_Y,
          width: INNER_RIGHT - INNER_X, height: INNER_BOTTOM - INNER_Y,
          border: `1px solid ${C.border}`, borderRadius: 5,
          background: "rgba(36, 202, 113, 0.07)",
        }} />
        {/* Labels */}
        <span style={{
          position: "absolute",
          left: OUTER_X + 6, top: OUTER_Y + 3,
          fontSize: 9, color: "#fe7338",
          fontWeight: 600, letterSpacing: "0.04em",
          textTransform: "uppercase", userSelect: "none",
          pointerEvents: "none",
        }}>
          Margin
        </span>
        <span style={{
          position: "absolute",
          left: INNER_X + 6, top: INNER_Y + 3,
          fontSize: 9, color: "#24ca71",
          fontWeight: 600, letterSpacing: "0.04em",
          textTransform: "uppercase", userSelect: "none",
          pointerEvents: "none",
        }}>
          Padding
        </span>

        {/* 8 inputs */}
        {(["mt","mr","mb","ml","pt","pr","pb","pl"] as const).map(prefix => (
          <SpacingInput
            key={prefix}
            x={pos[prefix].x}
            y={pos[prefix].y}
            value={h.get(prefix)}
            initialPx={currentPx(prefix)}
            title={`Drag label to scrub; shift for ×10. Type any value — px, rem, %, calc(), negatives.`}
            onScrubStart={makeScrub(prefix)}
            onChange={v => commitCls(prefix, v)}
          />
        ))}
      </div>
    </Section>
  );
});

const TypographySection = React.memo(function TypographySection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const computedFont = cs?.fontFamily?.split(",")[0]?.replace(/['"]/g, "").trim() || "";

  const setTextAlign = useCallback((v: string) => {
    const map: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
    const remove = ["text-left", "text-center", "text-right"].map(c => h.actual(c)).filter(Boolean) as string[];
    const add = map[v] ? [h.prefixCls(map[v])] : [];
    if (sel.source) h.trackedSendMutation({ type: "modify-class", source: sel.source, remove: remove.length ? remove : undefined, add: add.length ? add : undefined });
  }, [h, sel.source]);

  return (
    <Section title="Typography" defaultOpen>
      <PropRow label="Font">
        <span style={{ fontSize: 10, fontFamily: C.mono, color: C.fgDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {computedFont || "system-ui"}
        </span>
      </PropRow>
      <SliderValueInput
        label="Size"
        value={h.get("text")}
        sliderValue={cs ? Math.round(parseFloat(cs.fontSize) || 16) : 16}
        min={8} max={96} step={1}
        presets={FONT_SIZE_PRESETS}
        strategy={LENGTH}
        encode={n => `[${n}px]`}
        onLivePreview={v => { if (sel.element) sel.element.style.fontSize = v + "px"; }}
        onChange={v => { h.set("text", v, false, true); if (sel.element) requestAnimationFrame(() => { sel.element!.style.fontSize = ""; }); }}
        placeholder="inherit"
      />
      <SliderValueInput
        label="Weight"
        value={h.get("font")}
        sliderValue={cs ? (parseInt(cs.fontWeight, 10) || 400) : 400}
        min={100} max={900} step={100}
        presets={FONT_WEIGHT_PRESETS}
        strategy={KEYWORD}
        encode={n => `[${n}]`}
        onLivePreview={v => { if (sel.element) sel.element.style.fontWeight = String(v); }}
        onChange={v => { h.set("font", v, false, true); if (sel.element) requestAnimationFrame(() => { sel.element!.style.fontWeight = ""; }); }}
        placeholder="inherit"
      />
      <SliderValueInput
        label="Leading"
        value={h.get("leading")}
        sliderValue={cs ? Math.round((parseFloat(cs.lineHeight) / (parseFloat(cs.fontSize) || 16)) * 100) || 150 : 150}
        min={80} max={300} step={5}
        presets={LEADING_PRESETS}
        strategy={KEYWORD}
        encode={n => `[${(n / 100).toFixed(2).replace(/\.?0+$/, "")}]`}
        onLivePreview={v => { if (sel.element) sel.element.style.lineHeight = String(v / 100); }}
        onChange={v => { h.set("leading", v); if (sel.element) requestAnimationFrame(() => { sel.element!.style.lineHeight = ""; }); }}
        placeholder="normal"
        suffix="%"
      />
      <SliderValueInput
        label="Tracking"
        value={h.get("tracking")}
        sliderValue={cs ? Math.round((parseFloat(cs.letterSpacing) || 0) * 1000) / 1000 : 0}
        min={-5} max={10} step={1}
        presets={TRACKING_PRESETS}
        strategy={KEYWORD}
        encode={n => `[${(n / 100).toFixed(3).replace(/\.?0+$/, "")}em]`}
        onLivePreview={v => { if (sel.element) sel.element.style.letterSpacing = `${v / 100}em`; }}
        onChange={v => { h.set("tracking", v); if (sel.element) requestAnimationFrame(() => { sel.element!.style.letterSpacing = ""; }); }}
        placeholder="normal"
      />
      <PropRow label="Style">
        <CustomSelect value={h.has("italic") ? "italic" : h.has("not-italic") ? "not-italic" : ""} options={FONT_STYLE_OPTIONS} onChange={v => {
          const oldActual = ["italic","not-italic"].map(c => h.actual(c)).filter(Boolean) as string[];
          h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
        }} />
      </PropRow>
      <PropRow label="Transform">
        <CustomSelect
          value={["uppercase","lowercase","capitalize","normal-case"].find(c => h.has(c)) || ""}
          options={TEXT_TRANSFORM_OPTIONS}
          onChange={v => {
            const oldActual = ["uppercase","lowercase","capitalize","normal-case"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Decoration">
        <CustomSelect
          value={["underline","overline","line-through","no-underline"].find(c => h.has(c)) || ""}
          options={TEXT_DECORATION_LINE_OPTIONS}
          onChange={v => {
            const oldActual = ["underline","overline","line-through","no-underline"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Deco style">
        <CustomSelect
          value={["decoration-solid","decoration-double","decoration-dotted","decoration-dashed","decoration-wavy"].map(c => c.replace("decoration-", "")).find(c => h.has(`decoration-${c}`)) || ""}
          options={TEXT_DECORATION_STYLE_OPTIONS}
          onChange={v => {
            const oldActual = ["solid","double","dotted","dashed","wavy"].map(c => h.actual(`decoration-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`decoration-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Overflow">
        <CustomSelect
          value={h.has("truncate") ? "truncate" : ["text-ellipsis","text-clip"].map(c => c.replace("text-","")).find(c => h.has(`text-${c}`)) || ""}
          options={TEXT_OVERFLOW_OPTIONS}
          onChange={v => {
            const oldActual = ["truncate","text-ellipsis","text-clip"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v === "truncate" ? ["truncate"] : v ? [`text-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Wrap">
        <CustomSelect
          value={["wrap","nowrap","balance","pretty"].find(c => h.has(`text-${c}`)) || ""}
          options={TEXT_WRAP_OPTIONS}
          onChange={v => {
            const oldActual = ["wrap","nowrap","balance","pretty"].map(c => h.actual(`text-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`text-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Whitespace">
        <CustomSelect
          value={["normal","nowrap","pre","pre-line","pre-wrap","break-spaces"].find(c => h.has(`whitespace-${c}`)) || ""}
          options={WHITE_SPACE_OPTIONS}
          onChange={v => {
            const oldActual = ["normal","nowrap","pre","pre-line","pre-wrap","break-spaces"].map(c => h.actual(`whitespace-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`whitespace-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Word break">
        <CustomSelect
          value={["normal","all","keep"].find(c => h.has(`break-${c}`)) || ""}
          options={WORD_BREAK_OPTIONS}
          onChange={v => {
            const oldActual = ["normal","all","keep"].map(c => h.actual(`break-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`break-${v}`] : undefined });
          }}
        />
      </PropRow>
      <SubLabel>Text Align</SubLabel>
      <ToggleGroup
        value={h.has("text-left") ? "left" : h.has("text-center") ? "center" : h.has("text-right") ? "right" : ""}
        items={[
          { value: "left", icon: <AlignLeft size={14} />, label: "Left", title: "Text Align: Left" },
          { value: "center", icon: <AlignCenter size={14} />, label: "Center", title: "Text Align: Center" },
          { value: "right", icon: <AlignRight size={14} />, label: "Right", title: "Text Align: Right" },
        ]}
        showLabels
        onChange={setTextAlign}
      />
    </Section>
  );
});

const TextColorSection = React.memo(function TextColorSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const inlineColor = sel.element && sourceStyleHasProperty(sel.element, "color");
  const warning = inlineColor ? "color is set in style={{ ... }} — edit the source or remove the inline declaration" : undefined;
  return (
    <Section title="Text" defaultOpen={false} warning={warning}>
      <ColorPicker
        label="Color"
        prefix="text"
        classes={h.classes}
        disabledReason={warning}
        onApply={(remove, add) => {
          if (sel.source) h.sendPrefixed({ type: "modify-class", source: sel.source, remove, add });
        }}
      />
    </Section>
  );
});

const FillSection = React.memo(function FillSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const inlineBg = sel.element && (
    sourceStyleHasProperty(sel.element, "background-color") ||
    sourceStyleHasProperty(sel.element, "background")
  );
  const warning = inlineBg ? "background is set in style={{ ... }} — edit the source or remove the inline declaration" : undefined;
  return (
    <Section title="Fill" defaultOpen warning={warning}>
      <ColorPicker
        label="BG"
        prefix="bg"
        classes={h.classes}
        disabledReason={warning}
        onApply={(remove, add) => {
          if (sel.source) h.sendPrefixed({ type: "modify-class", source: sel.source, remove, add });
        }}
      />
    </Section>
  );
});

const BorderSection = React.memo(function BorderSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const inlineBorder = sel.element && (
    sourceStyleHasProperty(sel.element, "border-color") ||
    sourceStyleHasProperty(sel.element, "border")
  );
  const warning = inlineBorder ? "border is set in style={{ ... }} — edit the source or remove the inline declaration" : undefined;
  // Current border style among presets
  const borderStyleVal = ["dashed","dotted","double","hidden","none"].find(s => h.has(`border-${s}`)) || "";
  // Decode current border width into a px number for the slider.
  const currentBorderPx = (() => {
    const cs = sel.element ? getCachedStyle(sel.element) : null;
    if (cs) return Math.round(parseFloat(cs.borderTopWidth) || 0);
    const arbitrary = h.classes.find(c => /^border-\[(\d+)px\]$/.test(c));
    if (arbitrary) return parseInt(arbitrary.match(/\[(\d+)px\]/)![1], 10);
    const numbered = h.classes.find(c => /^border-\d+$/.test(c));
    if (numbered) return parseInt(numbered.replace("border-", ""), 10);
    if (h.has("border")) return 1;
    return 0;
  })();
  const currentBorderWidthVal = (() => {
    const arbitrary = h.classes.find(c => /^border-\[/.test(c));
    if (arbitrary) return arbitrary;
    const numbered = h.classes.find(c => /^border-\d+$/.test(c));
    if (numbered) return numbered;
    if (h.has("border")) return "border";
    return "";
  })();
  return (
    <Section title="Border" defaultOpen={false} warning={warning}>
      <SliderValueInput
        label="Width"
        value={currentBorderWidthVal}
        sliderValue={currentBorderPx}
        min={0} max={16} step={1}
        presets={[
          { value: "", label: "0" },
          { value: "border", label: "1px" },
          { value: "border-2", label: "2px" },
          { value: "border-4", label: "4px" },
          { value: "border-8", label: "8px" },
        ]}
        strategy={KEYWORD}
        encode={n => n === 0 ? "" : n === 1 ? "border" : [2,4,8].includes(n) ? `border-${n}` : `border-[${n}px]`}
        onLivePreview={v => { if (sel.element) setStyleProp(sel.element, "borderWidth", `${v}px`); }}
        onChange={v => {
          const bareBorder = h.classes.find(c => c === "border" || /^border-[0-9]+$/.test(c) || /^border-\[/.test(c));
          const prefixedBorder = h.bpPrefix ? h.classes.find(c => c === `${h.bpPrefix}:border` || new RegExp(`^${h.bpPrefix}:border-[0-9]+$`).test(c) || new RegExp(`^${h.bpPrefix}:border-\\[`).test(c)) : undefined;
          const old = prefixedBorder || bareBorder;
          let add: string | undefined = v || undefined;
          if (v && /^\[\d+\]$/.test(v)) add = `border-[${v.slice(1, -1)}px]`;
          else if (v === "border" || v === "") add = v || undefined;
          else if (v && !v.startsWith("border")) add = `border-${v.replace(/^\[(.+)\]$/, "[$1]")}`;
          h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: old ? [old] : undefined, add: add ? [add] : undefined });
          if (sel.element) requestAnimationFrame(() => setStyleProp(sel.element!, "borderWidth", ""));
        }}
        suffix="px"
      />
      <PropRow label="Style">
        <CustomSelect
          value={borderStyleVal}
          options={BORDER_STYLE_PRESETS}
          onChange={v => {
            const oldActual = ["border-solid","border-dashed","border-dotted","border-double","border-hidden","border-none"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`border-${v}`] : undefined });
          }}
        />
      </PropRow>
      <ColorPicker
        label="Color"
        prefix="border"
        classes={h.classes}
        disabledReason={warning}
        onApply={(remove, add) => { if (sel.source) h.sendPrefixed({ type: "modify-class", source: sel.source, remove, add }); }}
      />
    </Section>
  );
});

const OutlineSection = React.memo(function OutlineSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const inlineOutline = sel.element && (
    sourceStyleHasProperty(sel.element, "outline-color") ||
    sourceStyleHasProperty(sel.element, "outline")
  );
  const warning = inlineOutline ? "outline is set in style={{ ... }} — edit the source or remove the inline declaration" : undefined;
  const outlineWidthPx = (() => {
    const cs = sel.element ? getCachedStyle(sel.element) : null;
    if (cs) return Math.round(parseFloat(cs.outlineWidth) || 0);
    const v = h.get("outline");
    const m = v.match(/^\[(\d+)(px)?\]$/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  })();
  const outlineOffsetPx = (() => {
    const cs = sel.element ? getCachedStyle(sel.element) : null;
    if (cs) return Math.round(parseFloat(cs.outlineOffset) || 0);
    const v = h.get("outline-offset");
    const m = v.match(/^\[(-?\d+)(px)?\]$/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  })();
  return (
    <Section title="Outline" defaultOpen={false} warning={warning}>
      <SliderValueInput
        label="Width"
        value={h.get("outline")}
        sliderValue={outlineWidthPx}
        min={0} max={16} step={1}
        strategy={INTEGER}
        encode={n => n === 0 ? "" : `[${n}px]`}
        onLivePreview={v => { if (sel.element) setStyleProp(sel.element, "outlineWidth", `${v}px`); }}
        onChange={v => { h.set("outline", v); if (sel.element) requestAnimationFrame(() => setStyleProp(sel.element!, "outlineWidth", "")); }}
        suffix="px"
      />
      <SliderValueInput
        label="Offset"
        value={h.get("outline-offset")}
        sliderValue={outlineOffsetPx}
        min={-8} max={16} step={1}
        strategy={INTEGER}
        encode={n => n === 0 ? "" : `[${n}px]`}
        onLivePreview={v => { if (sel.element) setStyleProp(sel.element, "outlineOffset", `${v}px`); }}
        onChange={v => { h.set("outline-offset", v); if (sel.element) requestAnimationFrame(() => setStyleProp(sel.element!, "outlineOffset", "")); }}
        suffix="px"
      />
      <ColorPicker
        label="Color"
        prefix="outline"
        classes={h.classes}
        disabledReason={warning}
        onApply={(remove, add) => { if (sel.source) h.sendPrefixed({ type: "modify-class", source: sel.source, remove, add }); }}
      />
    </Section>
  );
});

const RadiusSection = React.memo(function RadiusSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const computedRadius = cs ? Math.round(parseFloat(cs.borderRadius) || 0) : 0;

  return (
    <Section title="Radius" defaultOpen={false}>
      <SliderValueInput
        label="Radius"
        value={h.get("rounded")}
        sliderValue={computedRadius}
        min={0} max={80} step={1}
        presets={RADIUS_PRESETS}
        strategy={LENGTH}
        encode={n => n === 0 ? "none" : `[${n}px]`}
        onLivePreview={v => { if (sel.element) setStyleProp(sel.element, "borderRadius", `${v}px`); }}
        onChange={v => {
          h.set("rounded", v);
          if (sel.element) requestAnimationFrame(() => setStyleProp(sel.element!, "borderRadius", ""));
        }}
        suffix="px"
      />
    </Section>
  );
});

const ShadowSection = React.memo(function ShadowSection({ h }: { h: ClassHelpers }) {
  return (
    <Section title="Shadow" defaultOpen={false}>
      <ValueInput
        value={h.get("shadow")}
        presets={SHADOW_PRESETS}
        strategy={KEYWORD}
        onChange={v => h.set("shadow", v)}
        placeholder="none"
      />
    </Section>
  );
});

const OpacitySection = React.memo(function OpacitySection({ h }: { h: ClassHelpers }) {
  const opacityVal = h.get("opacity");
  // Decode: preset step ("50") → 50, bracket ("[0.37]") → 37, bracket ("[50%]") → 50
  const opacityNum = (() => {
    if (!opacityVal) return 100;
    if (OPACITY_MAP[opacityVal] !== undefined) return OPACITY_MAP[opacityVal];
    const pct = opacityVal.match(/^\[(\d+(?:\.\d+)?)%\]$/);
    if (pct) return Math.round(parseFloat(pct[1]));
    const frac = opacityVal.match(/^\[0?\.(\d+)\]$/);
    if (frac) return Math.round(parseFloat(`0.${frac[1]}`) * 100);
    const whole = opacityVal.match(/^\[(\d+)\]$/);
    if (whole) return Math.min(100, parseInt(whole[1], 10));
    return 100;
  })();

  return (
    <Section title="Opacity" defaultOpen={false}>
      <SliderValueInput
        label="Opacity"
        value={h.get("opacity")}
        sliderValue={opacityNum}
        min={0} max={100} step={1}
        strategy={NUMBER}
        encode={v => {
          if (v === 100) return "";
          const scaleKey = Object.entries(OPACITY_MAP).find(([, n]) => n === v)?.[0];
          if (scaleKey !== undefined) return scaleKey;
          return `[${(v / 100).toFixed(2).replace(/\.?0+$/, "") || "0"}]`;
        }}
        onChange={v => h.set("opacity", v)}
        suffix="%"
      />
    </Section>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// New sections: Background / Transforms / Filters / Transitions / Interactivity / SVG / Tables
// Every numeric knob below uses SliderValueInput (slider + free-entry input)
// instead of a preset-only dropdown.
// ══════════════════════════════════════════════════════════════════════════════

type Sel = NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]>;

const BackgroundSection = React.memo(function BackgroundSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  return (
    <Section title="Background" defaultOpen={false}>
      <PropRow label="Image">
        <ValueInput value={h.get("bg")} presets={BG_IMAGE_PRESETS} strategy={KEYWORD}
          onChange={v => h.set("bg", v)} placeholder="none" />
      </PropRow>
      <PropRow label="Repeat">
        <CustomSelect value={["repeat","no-repeat","repeat-x","repeat-y","round","space"].find(c => h.has(`bg-${c}`)) || ""}
          options={BG_REPEAT_OPTIONS}
          onChange={v => {
            const oldActual = ["repeat","no-repeat","repeat-x","repeat-y","round","space"].map(c => h.actual(`bg-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`bg-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Size">
        <CustomSelect value={["auto","cover","contain"].find(c => h.has(`bg-${c}`)) || ""}
          options={BG_SIZE_OPTIONS}
          onChange={v => {
            const oldActual = ["auto","cover","contain"].map(c => h.actual(`bg-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`bg-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Position">
        <ValueInput value={h.get("bg")} presets={BG_POSITION_PRESETS} strategy={KEYWORD}
          onChange={v => h.set("bg", v)} placeholder="center" />
      </PropRow>
      <PropRow label="Attachment">
        <CustomSelect value={["fixed","local","scroll"].find(c => h.has(`bg-${c}`)) || ""}
          options={BG_ATTACHMENT_OPTIONS}
          onChange={v => {
            const oldActual = ["fixed","local","scroll"].map(c => h.actual(`bg-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`bg-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Clip">
        <CustomSelect value={["border","padding","content","text"].find(c => h.has(`bg-clip-${c}`)) || ""}
          options={BG_CLIP_OPTIONS}
          onChange={v => {
            const oldActual = ["border","padding","content","text"].map(c => h.actual(`bg-clip-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`bg-clip-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Origin">
        <CustomSelect value={["border","padding","content"].find(c => h.has(`bg-origin-${c}`)) || ""}
          options={BG_ORIGIN_OPTIONS}
          onChange={v => {
            const oldActual = ["border","padding","content"].map(c => h.actual(`bg-origin-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`bg-origin-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Blend">
        <CustomSelect value={BLEND_MODE_OPTIONS.map(o => o.value).find(v => v && h.has(`bg-blend-${v}`)) || ""}
          options={BLEND_MODE_OPTIONS}
          onChange={v => {
            const oldActual = BLEND_MODE_OPTIONS.map(o => o.value).filter(Boolean).map(c => h.actual(`bg-blend-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`bg-blend-${v}`] : undefined });
          }}
        />
      </PropRow>
    </Section>
  );
});

function decodeAngle(v: string): number {
  const m = v.match(/^\[(-?\d*\.?\d+)deg\]$/);
  if (m) return Math.round(parseFloat(m[1]));
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function decodeScale(v: string): number {
  const m = v.match(/^\[(\d*\.?\d+)\]$/);
  if (m) return Math.round(parseFloat(m[1]) * 100);
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 100;
}

function decodePx(v: string): number {
  const m = v.match(/^\[(-?\d+)px\]$/);
  if (m) return parseInt(m[1], 10);
  return twValueToPx(v);
}

const TransformsSection = React.memo(function TransformsSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  void sel;
  return (
    <Section title="Transforms" defaultOpen={false}>
      <SliderValueInput
        label="Rotate"
        value={h.get("rotate")}
        sliderValue={decodeAngle(h.get("rotate"))}
        min={-180} max={180} step={1}
        presets={ROTATE_PRESETS}
        strategy={ANGLE}
        encode={n => n === 0 ? "" : `[${n}deg]`}
        onChange={v => h.set("rotate", v)}
        suffix="deg"
      />
      <SliderValueInput
        label="Scale"
        value={h.get("scale")}
        sliderValue={decodeScale(h.get("scale"))}
        min={0} max={200} step={1}
        presets={SCALE_PRESETS}
        strategy={NUMBER}
        encode={n => n === 100 ? "" : String(n)}
        onChange={v => h.set("scale", v)}
        suffix="%"
      />
      <SliderValueInput
        label="Scale X"
        value={h.get("scale-x")}
        sliderValue={decodeScale(h.get("scale-x"))}
        min={-200} max={200} step={1}
        strategy={NUMBER}
        encode={n => n === 100 ? "" : String(n)}
        onChange={v => h.set("scale-x", v)}
        suffix="%"
      />
      <SliderValueInput
        label="Scale Y"
        value={h.get("scale-y")}
        sliderValue={decodeScale(h.get("scale-y"))}
        min={-200} max={200} step={1}
        strategy={NUMBER}
        encode={n => n === 100 ? "" : String(n)}
        onChange={v => h.set("scale-y", v)}
        suffix="%"
      />
      <SliderValueInput
        label="Skew X"
        value={h.get("skew-x")}
        sliderValue={decodeAngle(h.get("skew-x"))}
        min={-45} max={45} step={1}
        strategy={ANGLE}
        encode={n => n === 0 ? "" : `[${n}deg]`}
        onChange={v => h.set("skew-x", v)}
        suffix="deg"
      />
      <SliderValueInput
        label="Skew Y"
        value={h.get("skew-y")}
        sliderValue={decodeAngle(h.get("skew-y"))}
        min={-45} max={45} step={1}
        strategy={ANGLE}
        encode={n => n === 0 ? "" : `[${n}deg]`}
        onChange={v => h.set("skew-y", v)}
        suffix="deg"
      />
      <SliderValueInput
        label="Translate X"
        value={h.get("translate-x")}
        sliderValue={decodePx(h.get("translate-x"))}
        min={-200} max={200} step={1}
        strategy={LENGTH}
        encode={n => n === 0 ? "" : `[${n}px]`}
        onChange={v => h.set("translate-x", v)}
        suffix="px"
      />
      <SliderValueInput
        label="Translate Y"
        value={h.get("translate-y")}
        sliderValue={decodePx(h.get("translate-y"))}
        min={-200} max={200} step={1}
        strategy={LENGTH}
        encode={n => n === 0 ? "" : `[${n}px]`}
        onChange={v => h.set("translate-y", v)}
        suffix="px"
      />
      <PropRow label="Origin">
        <CustomSelect value={TRANSFORM_ORIGIN_OPTIONS.map(o => o.value).find(v => v && h.has(`origin-${v}`)) || ""}
          options={TRANSFORM_ORIGIN_OPTIONS}
          onChange={v => {
            const oldActual = TRANSFORM_ORIGIN_OPTIONS.map(o => o.value).filter(Boolean).map(c => h.actual(`origin-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`origin-${v}`] : undefined });
          }}
        />
      </PropRow>
    </Section>
  );
});

// A filter row: slider + input for a single filter function.
function FilterRow({
  h, label, prefix, min, max, step, suffix, presets, encode, decode, defaultN,
}: {
  h: ClassHelpers; label: string; prefix: string;
  min: number; max: number; step: number; suffix?: string;
  presets?: { value: string; label?: string }[];
  encode: (n: number) => string;
  decode: (v: string) => number;
  defaultN: number;
}) {
  const current = h.get(prefix);
  return (
    <SliderValueInput
      label={label}
      value={current}
      sliderValue={current ? decode(current) : defaultN}
      min={min} max={max} step={step}
      presets={presets}
      strategy={KEYWORD}
      encode={encode}
      onChange={v => h.set(prefix, v)}
      suffix={suffix}
    />
  );
}

function makeFilterSection(title: string, isBackdrop: boolean) {
  const pfx = (p: string) => isBackdrop ? `backdrop-${p}` : p;
  return React.memo(function _FilterSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
    void sel;
    return (
      <Section title={title} defaultOpen={false}>
        <FilterRow h={h} label="Blur"      prefix={pfx("blur")}       min={0} max={64} step={1}  suffix="px"  presets={BLUR_PRESETS}
          encode={n => n === 0 ? "" : `[${n}px]`}
          decode={v => { const m = v.match(/^\[(\d+)px\]$/); return m ? parseInt(m[1], 10) : 0; }}
          defaultN={0} />
        <FilterRow h={h} label="Bright"    prefix={pfx("brightness")} min={0} max={200} step={5} suffix="%" presets={FILTER_PERCENT_PRESETS}
          encode={n => n === 100 ? "" : String(n)}
          decode={v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 100; }}
          defaultN={100} />
        <FilterRow h={h} label="Contrast"  prefix={pfx("contrast")}   min={0} max={200} step={5} suffix="%" presets={FILTER_PERCENT_PRESETS}
          encode={n => n === 100 ? "" : String(n)}
          decode={v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 100; }}
          defaultN={100} />
        <FilterRow h={h} label="Saturate"  prefix={pfx("saturate")}   min={0} max={200} step={5} suffix="%" presets={FILTER_PERCENT_PRESETS}
          encode={n => n === 100 ? "" : String(n)}
          decode={v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 100; }}
          defaultN={100} />
        <FilterRow h={h} label="Gray"      prefix={pfx("grayscale")}  min={0} max={100} step={5} suffix="%"
          encode={n => n === 0 ? "" : String(n)}
          decode={v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }}
          defaultN={0} />
        <FilterRow h={h} label="Invert"    prefix={pfx("invert")}     min={0} max={100} step={5} suffix="%"
          encode={n => n === 0 ? "" : String(n)}
          decode={v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }}
          defaultN={0} />
        <FilterRow h={h} label="Sepia"     prefix={pfx("sepia")}      min={0} max={100} step={5} suffix="%"
          encode={n => n === 0 ? "" : String(n)}
          decode={v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }}
          defaultN={0} />
        <FilterRow h={h} label="Hue"       prefix={pfx("hue-rotate")} min={-180} max={180} step={1} suffix="deg" presets={HUE_ROTATE_PRESETS}
          encode={n => n === 0 ? "" : `[${n}deg]`}
          decode={v => { const m = v.match(/^\[(-?\d+)deg\]$/); if (m) return parseInt(m[1], 10); const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }}
          defaultN={0} />
      </Section>
    );
  });
}

const FiltersSection = makeFilterSection("Filters", false);
const BackdropFiltersSection = makeFilterSection("Backdrop filters", true);

const TransitionsSection = React.memo(function TransitionsSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  void sel;
  const durNum = (() => {
    const v = h.get("duration");
    const m = v.match(/^\[(\d+)ms\]$/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  })();
  const delayNum = (() => {
    const v = h.get("delay");
    const m = v.match(/^\[(\d+)ms\]$/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  })();
  return (
    <Section title="Transitions" defaultOpen={false}>
      <PropRow label="Property">
        <CustomSelect
          value={["transition","transition-all","transition-colors","transition-opacity","transition-shadow","transition-transform","transition-none"].find(c => h.has(c)) || ""}
          options={TRANSITION_PROPERTY_OPTIONS}
          onChange={v => {
            const oldActual = ["transition","transition-all","transition-colors","transition-opacity","transition-shadow","transition-transform","transition-none"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v === "all" || v === "none" || v === "colors" || v === "opacity" || v === "shadow" || v === "transform" ? `transition-${v}` : "transition"] : undefined });
          }}
        />
      </PropRow>
      <SliderValueInput
        label="Duration"
        value={h.get("duration")}
        sliderValue={durNum}
        min={0} max={2000} step={25}
        presets={DURATION_PRESETS}
        strategy={DURATION}
        encode={n => n === 0 ? "" : `[${n}ms]`}
        onChange={v => h.set("duration", v)}
        suffix="ms"
      />
      <SliderValueInput
        label="Delay"
        value={h.get("delay")}
        sliderValue={delayNum}
        min={0} max={2000} step={25}
        presets={DURATION_PRESETS}
        strategy={DURATION}
        encode={n => n === 0 ? "" : `[${n}ms]`}
        onChange={v => h.set("delay", v)}
        suffix="ms"
      />
      <PropRow label="Timing">
        <CustomSelect
          value={["linear","in","out","in-out"].find(c => h.has(`ease-${c}`)) || ""}
          options={TIMING_FUNCTION_OPTIONS}
          onChange={v => {
            const oldActual = ["linear","in","out","in-out"].map(c => h.actual(`ease-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`ease-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Animate">
        <CustomSelect
          value={["spin","ping","pulse","bounce","none"].find(c => h.has(`animate-${c}`)) || ""}
          options={ANIMATION_OPTIONS}
          onChange={v => {
            const oldActual = ["spin","ping","pulse","bounce","none"].map(c => h.actual(`animate-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`animate-${v}`] : undefined });
          }}
        />
      </PropRow>
    </Section>
  );
});

const InteractivitySection = React.memo(function InteractivitySection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const cursorVal = CURSOR_OPTIONS.map(o => o.value).find(v => v && h.has(`cursor-${v}`)) || "";
  return (
    <Section title="Interactivity" defaultOpen={false}>
      <PropRow label="Cursor">
        <CustomSelect
          value={cursorVal}
          options={CURSOR_OPTIONS}
          onChange={v => {
            const oldActual = CURSOR_OPTIONS.map(o => o.value).filter(Boolean).map(c => h.actual(`cursor-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`cursor-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Pointer">
        <CustomSelect value={["auto","none"].find(c => h.has(`pointer-events-${c}`)) || ""}
          options={POINTER_EVENTS_OPTIONS}
          onChange={v => {
            const oldActual = ["auto","none"].map(c => h.actual(`pointer-events-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`pointer-events-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Select">
        <CustomSelect value={["none","text","all","auto"].find(c => h.has(`select-${c}`)) || ""}
          options={USER_SELECT_OPTIONS}
          onChange={v => {
            const oldActual = ["none","text","all","auto"].map(c => h.actual(`select-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`select-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Resize">
        <CustomSelect value={["none","y","x"].find(c => h.has(`resize-${c}`)) || (h.has("resize") ? "resize" : "")}
          options={RESIZE_OPTIONS}
          onChange={v => {
            const oldActual = ["resize","resize-none","resize-y","resize-x"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v === "resize" ? "resize" : `resize-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Scroll">
        <CustomSelect value={["auto","smooth"].find(c => h.has(`scroll-${c}`)) || ""}
          options={SCROLL_BEHAVIOR_OPTIONS}
          onChange={v => {
            const oldActual = ["auto","smooth"].map(c => h.actual(`scroll-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`scroll-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Will change">
        <CustomSelect value={WILL_CHANGE_OPTIONS.map(o => o.value).find(v => v && h.has(`will-change-${v}`)) || ""}
          options={WILL_CHANGE_OPTIONS}
          onChange={v => {
            const oldActual = WILL_CHANGE_OPTIONS.map(o => o.value).filter(Boolean).map(c => h.actual(`will-change-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`will-change-${v}`] : undefined });
          }}
        />
      </PropRow>
    </Section>
  );
});

const SvgSection = React.memo(function SvgSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  if (sel.tagName !== "svg" && sel.tagName !== "path" && sel.tagName !== "circle" &&
      sel.tagName !== "rect" && sel.tagName !== "line" && sel.tagName !== "polyline" &&
      sel.tagName !== "polygon" && sel.tagName !== "g") {
    return null;
  }
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const strokeWidthPx = cs ? Math.round(parseFloat(cs.strokeWidth) || 0) : 0;
  return (
    <Section title="SVG" defaultOpen={false}>
      <ColorPicker label="Fill" prefix="fill" classes={h.classes}
        onApply={(remove, add) => { if (sel.source) h.sendPrefixed({ type: "modify-class", source: sel.source, remove, add }); }} />
      <ColorPicker label="Stroke" prefix="stroke" classes={h.classes}
        onApply={(remove, add) => { if (sel.source) h.sendPrefixed({ type: "modify-class", source: sel.source, remove, add }); }} />
      <SliderValueInput
        label="Stroke W"
        value={h.get("stroke")}
        sliderValue={strokeWidthPx}
        min={0} max={16} step={1}
        strategy={INTEGER}
        encode={n => n === 0 ? "" : String(n)}
        onChange={v => h.set("stroke", v)}
        suffix="px"
      />
    </Section>
  );
});

const TablesSection = React.memo(function TablesSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  if (sel.tagName !== "table" && sel.tagName !== "tr" && sel.tagName !== "td" &&
      sel.tagName !== "th" && sel.tagName !== "thead" && sel.tagName !== "tbody") {
    return null;
  }
  return (
    <Section title="Table" defaultOpen={false}>
      <PropRow label="Collapse">
        <CustomSelect value={["collapse","separate"].find(c => h.has(`border-${c}`)) || ""}
          options={BORDER_COLLAPSE_OPTIONS}
          onChange={v => {
            const oldActual = ["border-collapse","border-separate"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`border-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Layout">
        <CustomSelect value={["auto","fixed"].find(c => h.has(`table-${c}`)) || ""}
          options={TABLE_LAYOUT_OPTIONS}
          onChange={v => {
            const oldActual = ["auto","fixed"].map(c => h.actual(`table-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`table-${v}`] : undefined });
          }}
        />
      </PropRow>
      <PropRow label="Caption">
        <CustomSelect value={["top","bottom"].find(c => h.has(`caption-${c}`)) || ""}
          options={CAPTION_SIDE_OPTIONS}
          onChange={v => {
            const oldActual = ["top","bottom"].map(c => h.actual(`caption-${c}`)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`caption-${v}`] : undefined });
          }}
        />
      </PropRow>
    </Section>
  );
});

const CSSVariablesSection = React.memo(function CSSVariablesSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  void h;
  const variables = useCSSVariables(sel.element);
  const [filter, setFilter] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = filterVariables(variables, filter);

  if (variables.length === 0) return null;

  return (
    <Section title="Variables" defaultOpen={false}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          style={{
            width: "100%", height: 28, background: C.bgAlt,
            border: "1px solid transparent", borderRadius: 6,
            color: C.fg, fontSize: 11, fontFamily: C.mono,
            padding: "0 8px", outline: "none",
            transition: "border-color 0.15s",
            boxSizing: "border-box",
          }}
          placeholder="Search variables..."
          value={filter}
          onChange={e => { setFilter(e.target.value); setShowSuggest(true); }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
        />
        {showSuggest && filtered.length > 0 && inputRef.current && (
          <VariableSuggest
            variables={filtered}
            filter={filter}
            anchor={{
              x: inputRef.current.getBoundingClientRect().left,
              y: inputRef.current.getBoundingClientRect().bottom + 4,
            }}
            onSelect={(varExpr) => {
              navigator.clipboard?.writeText(varExpr);
              setFilter("");
              setShowSuggest(false);
            }}
            onClose={() => setShowSuggest(false)}
          />
        )}
      </div>
      <div style={{ fontSize: 9, color: C.fgMuted, marginTop: 2 }}>
        {variables.length} CSS variables available. Click to copy.
      </div>
    </Section>
  );
});

const ClassesSection = React.memo(function ClassesSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const [newCls, setNewCls] = useState("");

  return (
    <Section title="Classes" defaultOpen={false}>
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {h.classes.map((c: string) => (
            <span
              key={c}
              onClick={() => sel.source && h.trackedSendMutation({ type: "modify-class", source: sel.source, remove: [c] })}
              title={`Click to remove: ${c}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: C.bgAlt, border: `1px solid ${C.borderLight}`,
                borderRadius: 4, padding: "2px 6px",
                fontSize: 10, fontFamily: C.mono, color: C.fg,
                cursor: "pointer", transition: "all 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.background = "rgba(242,72,34,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.borderLight; e.currentTarget.style.background = C.bgAlt; }}
            >
              {c}
              <span style={{ color: C.fgMuted, fontSize: 10, transition: "color 0.12s" }}>×</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            style={{
              flex: 1, height: 28, background: C.bgAlt,
              border: "1px solid transparent", borderRadius: 6,
              color: C.fg, fontSize: 11, fontFamily: C.mono,
              padding: "0 8px", outline: "none",
              transition: "border-color 0.15s",
            }}
            placeholder="Add class..."
            value={newCls}
            onChange={e => setNewCls(e.target.value)}
            onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
            onBlur={e => (e.currentTarget.style.borderColor = "transparent")}
            onKeyDown={e => {
              if (e.key === "Enter" && newCls.trim() && sel.source) {
                h.trackedSendMutation({ type: "modify-class", source: sel.source, add: [newCls.trim()] });
                setNewCls("");
              }
            }}
          />
          <button
            onClick={() => {
              if (newCls.trim() && sel.source) {
                h.trackedSendMutation({ type: "modify-class", source: sel.source, add: [newCls.trim()] });
                setNewCls("");
              }
            }}
            style={{
              width: 28, height: 28, background: C.accent,
              border: "none", borderRadius: 6, color: "#fff",
              fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#3da8f5")}
            onMouseLeave={e => (e.currentTarget.style.background = C.accent)}
          >
            +
          </button>
        </div>
      </div>
    </Section>
  );
});

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
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 10px", borderBottom: `1px solid ${C.border}`,
  minHeight: 38,
};
