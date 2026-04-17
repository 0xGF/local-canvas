import React, { useState, useCallback } from "react";
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
import { SliderInput } from "./ui/slider-input.js";
import { ToggleGroup } from "./ui/toggle-group.js";
import { ColorPicker } from "./ui/color-picker.js";
import { Slider } from "./ui/slider.js";
import { VariableSuggest } from "./ui/variable-suggest.js";
import { THEME } from "../theme.js";
import { PREFIX_TO_CSS } from "../canvas/constants.js";
import {
  DISPLAY_OPTS, FLEX_DIR_OPTS,
  OPACITY_MAP, OPACITY_VALUES,
  JUSTIFY_OPTIONS, ALIGN_OPTIONS,
  SHADOW_OPTIONS, POSITION_OPTIONS, OVERFLOW_OPTIONS, Z_INDEX_OPTIONS, SIZE_OPTIONS,
  INSET_OPTIONS, LEADING_OPTIONS, TRACKING_OPTIONS, GRID_COLS_OPTIONS, FLEX_ITEM_OPTIONS,
  pxToTwScale, twValueToPx,
} from "./PropertiesPanel.constants.js";
import {
  X,
  AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  MoveRight, MoveDown, MoveLeft, MoveUp,
  Square, Columns3, Grid3x3, EyeOff,
} from "./icons.js";

const C = THEME;

// ── Type for shared helpers ──
type ClassHelpers = ReturnType<typeof useClassHelpers>;

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
        <PaddingSection h={helpers} sel={sel} />
        <MarginSection h={helpers} sel={sel} />
        <TypographySection h={helpers} sel={sel} />
        <TextColorSection h={helpers} sel={sel} />
        <FillSection h={helpers} sel={sel} />
        <BorderSection h={helpers} sel={sel} />
        <OutlineSection h={helpers} sel={sel} />
        <RadiusSection h={helpers} sel={sel} />
        <ShadowSection h={helpers} />
        <OpacitySection h={helpers} />
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
        <NumberInput label="W" value={h.get("w") || Math.round(rect.width)} onChange={v => h.set("w", v)} suffix="px" />
        <NumberInput label="H" value={h.get("h") || Math.round(rect.height)} onChange={v => h.set("h", v)} suffix="px" />
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
            <NumberInput label="" value={twValueToPx(h.get("gap"))} suffix="px" onChange={v => h.set("gap", pxToTwScale(Math.max(0, parseInt(v) || 0)))} />
          </PropRow>
        </>
      )}
      {isGrid && (
        <>
          <PropRow label="Columns">
            <CustomSelect value={h.get("grid-cols")} options={GRID_COLS_OPTIONS} onChange={v => h.set("grid-cols", v)} />
          </PropRow>
          <PropRow label="Gap">
            <NumberInput label="" value={twValueToPx(h.get("gap"))} suffix="px" onChange={v => h.set("gap", pxToTwScale(Math.max(0, parseInt(v) || 0)))} />
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
          <PropRow label="Top"><CustomSelect value={h.get("top")} options={INSET_OPTIONS} onChange={v => h.set("top", v)} /></PropRow>
          <PropRow label="Right"><CustomSelect value={h.get("right")} options={INSET_OPTIONS} onChange={v => h.set("right", v)} /></PropRow>
          <PropRow label="Bottom"><CustomSelect value={h.get("bottom")} options={INSET_OPTIONS} onChange={v => h.set("bottom", v)} /></PropRow>
          <PropRow label="Left"><CustomSelect value={h.get("left")} options={INSET_OPTIONS} onChange={v => h.set("left", v)} /></PropRow>
        </div>
      )}
      <PropRow label="Z-Index">
        <CustomSelect value={h.get("z")} options={Z_INDEX_OPTIONS} onChange={v => h.set("z", v)} />
      </PropRow>
      <PropRow label="Overflow">
        <CustomSelect value={h.get("overflow")} options={OVERFLOW_OPTIONS} onChange={v => h.set("overflow", v)} />
      </PropRow>
    </Section>
  );
});

const SizeSection = React.memo(function SizeSection({ h }: { h: ClassHelpers }) {
  return (
    <Section title="Size" defaultOpen={false}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <PropRow label="W"><CustomSelect value={h.get("w")} options={SIZE_OPTIONS} onChange={v => h.set("w", v)} /></PropRow>
        <PropRow label="H"><CustomSelect value={h.get("h")} options={SIZE_OPTIONS} onChange={v => h.set("h", v)} /></PropRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
        <PropRow label="Min W"><CustomSelect value={h.get("min-w")} options={SIZE_OPTIONS} onChange={v => h.set("min-w", v)} /></PropRow>
        <PropRow label="Max W"><CustomSelect value={h.get("max-w")} options={SIZE_OPTIONS} onChange={v => h.set("max-w", v)} /></PropRow>
      </div>
    </Section>
  );
});

const FlexItemSection = React.memo(function FlexItemSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const parentIsFlex = sel.element?.parentElement ? getCachedStyle(sel.element.parentElement).display.includes("flex") : false;
  if (!parentIsFlex) return null;

  return (
    <Section title="Flex Item" defaultOpen>
      <PropRow label="Flex">
        <CustomSelect value={h.findCls(FLEX_ITEM_OPTIONS.map(o => o.value).filter(Boolean))} options={FLEX_ITEM_OPTIONS} onChange={v => {
          const oldActual = FLEX_ITEM_OPTIONS.map(o => o.value).filter(Boolean).map(c => h.actual(c)).filter(Boolean) as string[];
          h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
        }} />
      </PropRow>
      <PropRow label="Self">
        <CustomSelect value={h.get("self")} options={ALIGN_OPTIONS} onChange={v => h.set("self", v)} />
      </PropRow>
    </Section>
  );
});

const PaddingSection = React.memo(function PaddingSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const el = sel.element;
  const cs = el ? getCachedStyle(el) : null;
  const pt = cs ? parseFloat(cs.paddingTop) || 0 : twValueToPx(h.get("pt"));
  const pr = cs ? parseFloat(cs.paddingRight) || 0 : twValueToPx(h.get("pr"));
  const pb = cs ? parseFloat(cs.paddingBottom) || 0 : twValueToPx(h.get("pb"));
  const pl = cs ? parseFloat(cs.paddingLeft) || 0 : twValueToPx(h.get("pl"));

  const livePreview = useCallback((prefix: string, v: number) => {
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) setStyleProp(el, cssProp, v + "px");
  }, [el]);

  const commit = useCallback((prefix: string, v: number) => {
    h.set(prefix, pxToTwScale(v), false, true);
    // Keep inline style until HMR updates the class — prevents flash to old value
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

  return (
    <Section title="Padding" defaultOpen>
      <SliderInput label="Top" value={Math.round(pt)} min={0} max={200} suffix="px" onDrag={v => livePreview("pt", v)} onChange={v => commit("pt", v)} />
      <SliderInput label="Right" value={Math.round(pr)} min={0} max={200} suffix="px" onDrag={v => livePreview("pr", v)} onChange={v => commit("pr", v)} />
      <SliderInput label="Bottom" value={Math.round(pb)} min={0} max={200} suffix="px" onDrag={v => livePreview("pb", v)} onChange={v => commit("pb", v)} />
      <SliderInput label="Left" value={Math.round(pl)} min={0} max={200} suffix="px" onDrag={v => livePreview("pl", v)} onChange={v => commit("pl", v)} />
    </Section>
  );
});

const MarginSection = React.memo(function MarginSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const el = sel.element;
  const cs = el ? getCachedStyle(el) : null;
  const mt = cs ? parseFloat(cs.marginTop) || 0 : twValueToPx(h.get("mt"));
  const mr = cs ? parseFloat(cs.marginRight) || 0 : twValueToPx(h.get("mr"));
  const mb = cs ? parseFloat(cs.marginBottom) || 0 : twValueToPx(h.get("mb"));
  const ml = cs ? parseFloat(cs.marginLeft) || 0 : twValueToPx(h.get("ml"));

  const livePreview = useCallback((prefix: string, v: number) => {
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) setStyleProp(el, cssProp, v + "px");
  }, [el]);

  const commit = useCallback((prefix: string, v: number) => {
    h.set(prefix, pxToTwScale(v), false, true);
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

  return (
    <Section title="Margin" defaultOpen={false}>
      <SliderInput label="Top" value={Math.round(mt)} min={0} max={200} suffix="px" onDrag={v => livePreview("mt", v)} onChange={v => commit("mt", v)} />
      <SliderInput label="Right" value={Math.round(mr)} min={0} max={200} suffix="px" onDrag={v => livePreview("mr", v)} onChange={v => commit("mr", v)} />
      <SliderInput label="Bottom" value={Math.round(mb)} min={0} max={200} suffix="px" onDrag={v => livePreview("mb", v)} onChange={v => commit("mb", v)} />
      <SliderInput label="Left" value={Math.round(ml)} min={0} max={200} suffix="px" onDrag={v => livePreview("ml", v)} onChange={v => commit("ml", v)} />
    </Section>
  );
});

const TypographySection = React.memo(function TypographySection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const computedFont = cs?.fontFamily?.split(",")[0]?.replace(/['"]/g, "").trim() || "";
  const computedWeight = cs?.fontWeight || "400";
  const computedSize = cs ? Math.round(parseFloat(cs.fontSize)) : 16;

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
      <SliderInput
        label="Size"
        value={computedSize}
        min={8} max={120} suffix="px"
        onDrag={v => { if (sel.element) sel.element.style.fontSize = v + "px"; }}
        onChange={v => {
          const twMap: Record<number, string> = { 12: "xs", 14: "sm", 16: "base", 18: "lg", 20: "xl", 24: "2xl", 30: "3xl", 36: "4xl", 48: "5xl", 60: "6xl", 72: "7xl", 96: "8xl", 128: "9xl" };
          let best = `[${v}px]`;
          const exactMatch = twMap[v];
          if (exactMatch !== undefined) best = exactMatch;
          h.set("text", best, false, true);
          if (sel.element) requestAnimationFrame(() => sel.element.style.fontSize = "");
        }}
      />
      <SliderInput
        label="Weight"
        value={parseInt(computedWeight) || 400}
        min={100} max={900} step={100} suffix=""
        onDrag={v => { if (sel.element) sel.element.style.fontWeight = String(v); }}
        onChange={v => {
          const wMap: Record<number, string> = { 100: "thin", 200: "extralight", 300: "light", 400: "normal", 500: "medium", 600: "semibold", 700: "bold", 800: "extrabold", 900: "black" };
          h.set("font", wMap[v] || String(v), false, true);
          if (sel.element) requestAnimationFrame(() => sel.element.style.fontWeight = "");
        }}
      />
      <PropRow label="Leading">
        <CustomSelect value={h.get("leading")} options={LEADING_OPTIONS} onChange={v => h.set("leading", v)} />
      </PropRow>
      <PropRow label="Tracking">
        <CustomSelect value={h.get("tracking")} options={TRACKING_OPTIONS} onChange={v => h.set("tracking", v)} />
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
  return (
    <Section title="Border" defaultOpen={false} warning={warning}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <NumberInput
          label="W"
          value={h.has("border") ? 1 : parseInt(h.get("border")) || 0}
          suffix="px"
          onChange={v => {
            const n = parseInt(v) || 0;
            const bareBorder = h.classes.find(c => c === "border" || /^border-[0-9]+$/.test(c));
            const prefixedBorder = h.bpPrefix ? h.classes.find(c => c === `${h.bpPrefix}:border` || new RegExp(`^${h.bpPrefix}:border-[0-9]+$`).test(c)) : undefined;
            const old = prefixedBorder || bareBorder;
            h.sendPrefixed({
              type: "modify-class", source: sel.source!,
              remove: old ? [old] : undefined,
              add: n === 1 ? ["border"] : n > 0 ? [`border-${n}`] : undefined,
            });
          }}
        />
        <CustomSelect
          value={h.get("border-style") || ""}
          options={[{ value: "", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }, { value: "none", label: "None" }]}
          onChange={v => {
            const oldActual = ["border-solid","border-dashed","border-dotted","border-none"].map(c => h.actual(c)).filter(Boolean) as string[];
            h.sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`border-${v}`] : undefined });
          }}
        />
      </div>
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
  return (
    <Section title="Outline" defaultOpen={false} warning={warning}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <NumberInput label="W" value={parseInt(h.get("outline")) || 0} suffix="px" onChange={v => h.set("outline", String(parseInt(v) || 0))} />
        <NumberInput label="Offset" value={parseInt(h.get("outline-offset")) || 0} suffix="px" onChange={v => h.set("outline-offset", String(parseInt(v) || 0))} />
      </div>
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
  const currentVal = parseInt(h.get("rounded") || "0") || computedRadius;

  return (
    <Section title="Radius" defaultOpen={false}>
      <SliderInput
        label="Radius"
        value={currentVal}
        min={0} max={100} suffix="px"
        onChange={v => {
          if (v === 0) h.set("rounded", "");
          else {
            const map: Record<number, string> = { 2: "sm", 4: "", 6: "md", 8: "lg", 12: "xl", 16: "2xl", 24: "3xl", 9999: "full" };
            let best = `[${v}px]`;
            const exactMatch = map[v];
            if (exactMatch !== undefined) best = exactMatch;
            h.set("rounded", best);
          }
        }}
      />
    </Section>
  );
});

const ShadowSection = React.memo(function ShadowSection({ h }: { h: ClassHelpers }) {
  return (
    <Section title="Shadow" defaultOpen={false}>
      <CustomSelect value={h.get("shadow")} options={SHADOW_OPTIONS} onChange={v => h.set("shadow", v)} />
    </Section>
  );
});

const OpacitySection = React.memo(function OpacitySection({ h }: { h: ClassHelpers }) {
  const opacityVal = h.get("opacity");
  const opacityNum = opacityVal ? (OPACITY_MAP[opacityVal] ?? 100) : 100;

  return (
    <Section title="Opacity" defaultOpen={false}>
      <Slider
        value={opacityNum}
        min={0} max={100} step={5}
        onCommit={v => {
          const nearest = OPACITY_VALUES.reduce((best, cur) =>
            Math.abs(Number(cur) - v) < Math.abs(Number(best) - v) ? cur : best
          );
          h.set("opacity", nearest === "100" ? "" : nearest);
        }}
        suffix="%"
      />
    </Section>
  );
});

const CSSVariablesSection = React.memo(function CSSVariablesSection({ h, sel }: { h: ClassHelpers; sel: NonNullable<ReturnType<typeof useEditorStore.getState>["selectedElement"]> }) {
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
              // Copy to clipboard for user to paste into value fields
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
