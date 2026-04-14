import React from "react";
import { usePropertyHelpers } from "./PropertyContext.js";
import { Section, PropRow } from "../ui/section.js";
import { CustomSelect } from "../ui/custom-select.js";
import { NumberInput } from "../ui/number-input.js";
import { ToggleGroup } from "../ui/toggle-group.js";
import {
  AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  MoveRight, MoveDown, MoveLeft, MoveUp,
  Square, Columns3, Grid3x3, EyeOff,
} from "../icons.js";

const DISPLAY_OPTS = ["block","inline-block","inline","flex","inline-flex","grid","hidden"];
const JUSTIFY_OPTS = ["start","center","end","between","around","evenly"];
const ALIGN_OPTS = ["start","center","end","stretch","baseline"];
const FLEX_DIR_OPTS = ["row","row-reverse","col","col-reverse"];
const GRID_COLS_OPTIONS = [
  { value: "", label: "None" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "12", label: "12" },
];
const JUSTIFY_OPTIONS = JUSTIFY_OPTS.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
const ALIGN_OPTIONS = ALIGN_OPTS.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
const POSITION_OPTIONS = [
  { value: "", label: "Static" },
  { value: "relative", label: "Relative" },
  { value: "absolute", label: "Absolute" },
  { value: "fixed", label: "Fixed" },
  { value: "sticky", label: "Sticky" },
];
const OVERFLOW_OPTIONS = [
  { value: "", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "auto", label: "Auto" },
  { value: "scroll", label: "Scroll" },
];
const Z_INDEX_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "0", label: "0" }, { value: "10", label: "10" },
  { value: "20", label: "20" }, { value: "30", label: "30" },
  { value: "40", label: "40" }, { value: "50", label: "50" },
];
const INSET_OPTIONS = [
  { value: "", label: "Auto" }, { value: "0", label: "0" },
  { value: "1", label: "4px" }, { value: "2", label: "8px" }, { value: "4", label: "16px" },
  { value: "8", label: "32px" }, { value: "16", label: "64px" },
  { value: "px", label: "1px" }, { value: "full", label: "100%" }, { value: "1/2", label: "50%" },
];
const SIZE_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "full", label: "100%" }, { value: "screen", label: "100vw/vh" },
  { value: "min", label: "Min" }, { value: "max", label: "Max" }, { value: "fit", label: "Fit" },
  { value: "1/2", label: "50%" }, { value: "1/3", label: "33%" }, { value: "2/3", label: "67%" },
  { value: "1/4", label: "25%" }, { value: "3/4", label: "75%" },
];
const FLEX_ITEM_OPTIONS = [
  { value: "", label: "Default" },
  { value: "flex-1", label: "1 (fill)" }, { value: "flex-auto", label: "Auto" },
  { value: "flex-initial", label: "Initial" }, { value: "flex-none", label: "None" },
];

function SubLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 9, color: "rgba(255,255,255,0.35)",
      textTransform: "uppercase", letterSpacing: "0.05em",
      fontWeight: 600, marginTop: 2, marginBottom: -2,
    }}>
      {children}
    </div>
  );
}

export const PositionSection = React.memo(function PositionSection() {
  const { sel, get, set, has, actual, sendPrefixed, trackedSendMutation, prefixCls } = usePropertyHelpers();
  if (!sel) return null;

  const cs0 = sel.element ? getComputedStyle(sel.element) : null;
  const rect = {
    x: sel.element?.offsetLeft ?? sel.rect.left,
    y: sel.element?.offsetTop ?? sel.rect.top,
    width: parseFloat(cs0?.width || "") || sel.rect.width,
    height: parseFloat(cs0?.height || "") || sel.rect.height,
  };

  const setTextAlign = (v: string) => {
    const map: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
    const remove = ["text-left", "text-center", "text-right"].map(c => actual(c)).filter(Boolean) as string[];
    const add = map[v] ? [prefixCls(map[v])] : [];
    if (sel.source) trackedSendMutation({ type: "modify-class", source: sel.source, remove: remove.length ? remove : undefined, add: add.length ? add : undefined });
  };

  const setVerticalAlign = (v: string) => {
    const map: Record<string, string> = { start: "self-start", center: "self-center", end: "self-end" };
    const remove = ["self-start", "self-center", "self-end"].map(c => actual(c)).filter(Boolean) as string[];
    const add = map[v] ? [prefixCls(map[v])] : [];
    if (sel.source) trackedSendMutation({ type: "modify-class", source: sel.source, remove: remove.length ? remove : undefined, add: add.length ? add : undefined });
  };

  return (
    <Section title="Position" defaultOpen>
      <SubLabel>Text Alignment</SubLabel>
      <div style={{ display: "flex", gap: 6 }}>
        <ToggleGroup
          value={has("text-left") ? "left" : has("text-center") ? "center" : has("text-right") ? "right" : ""}
          items={[
            { value: "left", icon: <AlignLeft size={14} />, title: "Align Text Left" },
            { value: "center", icon: <AlignCenter size={14} />, title: "Align Text Center" },
            { value: "right", icon: <AlignRight size={14} />, title: "Align Text Right" },
          ]}
          onChange={setTextAlign}
        />
        <ToggleGroup
          value={has("self-start") ? "start" : has("self-center") ? "center" : has("self-end") ? "end" : ""}
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
        <NumberInput label="W" value={get("w") || Math.round(rect.width)} onChange={v => set("w", v)} suffix="px" />
        <NumberInput label="H" value={get("h") || Math.round(rect.height)} onChange={v => set("h", v)} suffix="px" />
      </div>
    </Section>
  );
});

export const LayoutDisplaySection = React.memo(function LayoutDisplaySection() {
  const { sel, get, set, has, actual, findCls, findPrefixedCls, sendPrefixed } = usePropertyHelpers();
  if (!sel) return null;

  const display = findCls(DISPLAY_OPTS);
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";
  const flexDir = findPrefixedCls("flex-", FLEX_DIR_OPTS);
  const flexDirVal = flexDir ? flexDir.replace("flex-", "") : "row";
  const positionType = findCls(["relative","absolute","fixed","sticky"]);
  const isPositioned = positionType !== "";
  const parentIsFlex = sel?.element?.parentElement ? getComputedStyle(sel.element.parentElement).display.includes("flex") : false;

  return (
    <>
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
            const oldActual = DISPLAY_OPTS.map(c => actual(c)).filter(Boolean) as string[];
            sendPrefixed({
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
                { value: "row", icon: <MoveRight size={14} />, label: "Row", title: "Flex: Row" },
                { value: "col", icon: <MoveDown size={14} />, label: "Col", title: "Flex: Column" },
                { value: "row-reverse", icon: <MoveLeft size={14} />, title: "Flex: Row Reverse" },
                { value: "col-reverse", icon: <MoveUp size={14} />, title: "Flex: Column Reverse" },
              ]}
              onChange={v => {
                const oldActual = flexDir ? (actual(flexDir) || flexDir) : undefined;
                sendPrefixed({
                  type: "modify-class", source: sel.source!,
                  remove: oldActual ? [oldActual] : undefined,
                  add: v && v !== "row" ? [`flex-${v}`] : undefined,
                });
              }}
            />
            <PropRow label="Justify">
              <CustomSelect value={get("justify")} options={JUSTIFY_OPTIONS} onChange={v => set("justify", v)} />
            </PropRow>
            <PropRow label="Align">
              <CustomSelect value={get("items")} options={ALIGN_OPTIONS} onChange={v => set("items", v)} />
            </PropRow>
            <PropRow label="Gap">
              <NumberInput label="" value={get("gap")} suffix="" onChange={v => set("gap", v)} />
            </PropRow>
          </>
        )}
        {isGrid && (
          <>
            <PropRow label="Columns">
              <CustomSelect value={get("grid-cols")} options={GRID_COLS_OPTIONS} onChange={v => set("grid-cols", v)} />
            </PropRow>
            <PropRow label="Gap">
              <NumberInput label="" value={get("gap")} suffix="" onChange={v => set("gap", v)} />
            </PropRow>
          </>
        )}
        <PropRow label="Position">
          <CustomSelect value={positionType} options={POSITION_OPTIONS} onChange={v => {
            const oldActual = ["relative","absolute","fixed","sticky"].map(c => actual(c)).filter(Boolean) as string[];
            sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
          }} />
        </PropRow>
        {isPositioned && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <PropRow label="Top"><CustomSelect value={get("top")} options={INSET_OPTIONS} onChange={v => set("top", v)} /></PropRow>
            <PropRow label="Right"><CustomSelect value={get("right")} options={INSET_OPTIONS} onChange={v => set("right", v)} /></PropRow>
            <PropRow label="Bottom"><CustomSelect value={get("bottom")} options={INSET_OPTIONS} onChange={v => set("bottom", v)} /></PropRow>
            <PropRow label="Left"><CustomSelect value={get("left")} options={INSET_OPTIONS} onChange={v => set("left", v)} /></PropRow>
          </div>
        )}
        <PropRow label="Z-Index">
          <CustomSelect value={get("z")} options={Z_INDEX_OPTIONS} onChange={v => set("z", v)} />
        </PropRow>
        <PropRow label="Overflow">
          <CustomSelect value={get("overflow")} options={OVERFLOW_OPTIONS} onChange={v => set("overflow", v)} />
        </PropRow>
      </Section>

      <Section title="Size" defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <PropRow label="W"><CustomSelect value={get("w")} options={SIZE_OPTIONS} onChange={v => set("w", v)} /></PropRow>
          <PropRow label="H"><CustomSelect value={get("h")} options={SIZE_OPTIONS} onChange={v => set("h", v)} /></PropRow>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
          <PropRow label="Min W"><CustomSelect value={get("min-w")} options={SIZE_OPTIONS} onChange={v => set("min-w", v)} /></PropRow>
          <PropRow label="Max W"><CustomSelect value={get("max-w")} options={SIZE_OPTIONS} onChange={v => set("max-w", v)} /></PropRow>
        </div>
      </Section>

      {parentIsFlex && (
        <Section title="Flex Item" defaultOpen>
          <PropRow label="Flex">
            <CustomSelect value={findCls(FLEX_ITEM_OPTIONS.map(o => o.value).filter(Boolean))} options={FLEX_ITEM_OPTIONS} onChange={v => {
              const oldActual = FLEX_ITEM_OPTIONS.map(o => o.value).filter(Boolean).map(c => actual(c)).filter(Boolean) as string[];
              sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [v] : undefined });
            }} />
          </PropRow>
          <PropRow label="Self">
            <CustomSelect value={get("self")} options={ALIGN_OPTIONS} onChange={v => set("self", v)} />
          </PropRow>
        </Section>
      )}
    </>
  );
});
