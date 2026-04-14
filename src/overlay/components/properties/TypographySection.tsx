import React from "react";
import { usePropertyHelpers } from "./PropertyContext.js";
import { Section, PropRow } from "../ui/section.js";
import { CustomSelect } from "../ui/custom-select.js";
import { SliderInput } from "../ui/slider-input.js";
import { ToggleGroup } from "../ui/toggle-group.js";
import { AlignLeft, AlignCenter, AlignRight } from "../icons.js";
import { THEME } from "../../theme.js";

const C = THEME;

const FONT_WEIGHTS: Record<number, string> = { 100: "thin", 200: "extralight", 300: "light", 400: "normal", 500: "medium", 600: "semibold", 700: "bold", 800: "extrabold", 900: "black" };
const LEADING_OPTIONS = [
  { value: "", label: "Normal" },
  { value: "none", label: "None (1)" }, { value: "tight", label: "Tight (1.25)" },
  { value: "snug", label: "Snug (1.375)" }, { value: "normal", label: "Normal (1.5)" },
  { value: "relaxed", label: "Relaxed (1.625)" }, { value: "loose", label: "Loose (2)" },
];
const TRACKING_OPTIONS = [
  { value: "", label: "Normal" },
  { value: "tighter", label: "Tighter" }, { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" }, { value: "wide", label: "Wide" },
  { value: "wider", label: "Wider" }, { value: "widest", label: "Widest" },
];

export const TypographySection = React.memo(function TypographySection() {
  const { sel, get, set, has, actual, prefixCls, trackedSendMutation } = usePropertyHelpers();
  if (!sel) return null;

  const cs = sel.element ? getComputedStyle(sel.element) : null;
  const computedFont = cs?.fontFamily?.split(",")[0]?.replace(/['"]/g, "").trim() || "";
  const computedWeight = cs?.fontWeight || "400";
  const computedSize = cs ? Math.round(parseFloat(cs.fontSize)) : 16;

  const setTextAlign = (v: string) => {
    const map: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
    const remove = ["text-left", "text-center", "text-right"].map(c => actual(c)).filter(Boolean) as string[];
    const add = map[v] ? [prefixCls(map[v])] : [];
    if (sel.source) trackedSendMutation({ type: "modify-class", source: sel.source, remove: remove.length ? remove : undefined, add: add.length ? add : undefined });
  };

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
          if (twMap[v] !== undefined) best = twMap[v];
          set("text", best);
          if (sel.element) requestAnimationFrame(() => sel.element.style.fontSize = "");
        }}
      />
      <SliderInput
        label="Weight"
        value={parseInt(computedWeight) || 400}
        min={100} max={900} step={100} suffix=""
        onDrag={v => { if (sel.element) sel.element.style.fontWeight = String(v); }}
        onChange={v => {
          set("font", FONT_WEIGHTS[v] || String(v));
          if (sel.element) requestAnimationFrame(() => sel.element.style.fontWeight = "");
        }}
      />
      <PropRow label="Leading">
        <CustomSelect value={get("leading")} options={LEADING_OPTIONS} onChange={v => set("leading", v)} />
      </PropRow>
      <PropRow label="Tracking">
        <CustomSelect value={get("tracking")} options={TRACKING_OPTIONS} onChange={v => set("tracking", v)} />
      </PropRow>
      <ToggleGroup
        value={has("text-left") ? "left" : has("text-center") ? "center" : has("text-right") ? "right" : ""}
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
