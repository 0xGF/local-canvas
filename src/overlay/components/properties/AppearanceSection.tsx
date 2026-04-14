import React from "react";
import { usePropertyHelpers } from "./PropertyContext.js";
import { Section, PropRow } from "../ui/section.js";
import { CustomSelect } from "../ui/custom-select.js";
import { NumberInput } from "../ui/number-input.js";
import { SliderInput } from "../ui/slider-input.js";
import { Slider } from "../ui/slider.js";
import { ColorPicker } from "../ui/color-picker.js";

const OPACITY_MAP: Record<string, number> = {
  "0":0,"5":5,"10":10,"20":20,"25":25,"30":30,"40":40,"50":50,
  "60":60,"70":70,"75":75,"80":80,"90":90,"95":95,"100":100
};
const OPACITY_VALUES = ["0","5","10","20","25","30","40","50","60","70","75","80","90","95","100"];
const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "", label: "Default" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "XL" },
  { value: "2xl", label: "2XL" },
];

export const TextColorSection = React.memo(function TextColorSection() {
  const { sel, classes, sendPrefixed } = usePropertyHelpers();
  if (!sel) return null;

  return (
    <Section title="Text" defaultOpen={false}>
      <ColorPicker
        label="Color"
        prefix="text"
        classes={classes}
        onApply={(remove, add) => {
          if (sel.source) sendPrefixed({ type: "modify-class", source: sel.source, remove, add });
        }}
      />
    </Section>
  );
});

export const FillSection = React.memo(function FillSection() {
  const { sel, classes, sendPrefixed } = usePropertyHelpers();
  if (!sel) return null;

  return (
    <Section title="Fill" defaultOpen>
      <ColorPicker
        label="BG"
        prefix="bg"
        classes={classes}
        onApply={(remove, add) => {
          if (sel.source) sendPrefixed({ type: "modify-class", source: sel.source, remove, add });
        }}
      />
    </Section>
  );
});

export const BorderSection = React.memo(function BorderSection() {
  const { sel, classes, bpPrefix, get, has, actual, sendPrefixed } = usePropertyHelpers();
  if (!sel) return null;

  return (
    <Section title="Border" defaultOpen={false}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <NumberInput
          label="W"
          value={has("border") ? 1 : parseInt(get("border")) || 0}
          suffix="px"
          onChange={v => {
            const n = parseInt(v) || 0;
            const bareBorder = classes.find(c => c === "border" || /^border-[0-9]+$/.test(c));
            const prefixedBorder = bpPrefix ? classes.find(c => c === `${bpPrefix}:border` || new RegExp(`^${bpPrefix}:border-[0-9]+$`).test(c)) : undefined;
            const old = prefixedBorder || bareBorder;
            sendPrefixed({
              type: "modify-class", source: sel.source!,
              remove: old ? [old] : undefined,
              add: n === 1 ? ["border"] : n > 0 ? [`border-${n}`] : undefined,
            });
          }}
        />
        <CustomSelect
          value={get("border-style") || ""}
          options={[{ value: "", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }, { value: "none", label: "None" }]}
          onChange={v => {
            const oldActual = ["border-solid","border-dashed","border-dotted","border-none"].map(c => actual(c)).filter(Boolean) as string[];
            sendPrefixed({ type: "modify-class", source: sel.source!, remove: oldActual.length ? oldActual : undefined, add: v ? [`border-${v}`] : undefined });
          }}
        />
      </div>
      <ColorPicker label="Color" prefix="border" classes={classes} onApply={(remove, add) => { if (sel.source) sendPrefixed({ type: "modify-class", source: sel.source, remove, add }); }} />
    </Section>
  );
});

export const OutlineSection = React.memo(function OutlineSection() {
  const { sel, classes, get, set, sendPrefixed } = usePropertyHelpers();
  if (!sel) return null;

  return (
    <Section title="Outline" defaultOpen={false}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <NumberInput label="W" value={parseInt(get("outline")) || 0} suffix="px" onChange={v => set("outline", String(parseInt(v) || 0))} />
        <NumberInput label="Offset" value={parseInt(get("outline-offset")) || 0} suffix="px" onChange={v => set("outline-offset", String(parseInt(v) || 0))} />
      </div>
      <ColorPicker label="Color" prefix="outline" classes={classes} onApply={(remove, add) => { if (sel.source) sendPrefixed({ type: "modify-class", source: sel.source, remove, add }); }} />
    </Section>
  );
});

export const RadiusSection = React.memo(function RadiusSection() {
  const { sel, get, set } = usePropertyHelpers();
  if (!sel) return null;

  const cs = sel.element ? getComputedStyle(sel.element) : null;
  const computedRadius = cs ? Math.round(parseFloat(cs.borderRadius) || 0) : 0;
  const currentVal = parseInt(get("rounded") || "0") || computedRadius;

  return (
    <Section title="Radius" defaultOpen={false}>
      <SliderInput
        label="Radius"
        value={currentVal}
        min={0} max={100} suffix="px"
        onChange={v => {
          if (v === 0) set("rounded", "");
          else {
            const map: Record<number, string> = { 2: "sm", 4: "", 6: "md", 8: "lg", 12: "xl", 16: "2xl", 24: "3xl", 9999: "full" };
            let best = `[${v}px]`;
            if (map[v] !== undefined) best = map[v];
            set("rounded", best);
          }
        }}
      />
    </Section>
  );
});

export const ShadowSection = React.memo(function ShadowSection() {
  const { get, set } = usePropertyHelpers();
  return (
    <Section title="Shadow" defaultOpen={false}>
      <CustomSelect value={get("shadow")} options={SHADOW_OPTIONS} onChange={v => set("shadow", v)} />
    </Section>
  );
});

export const OpacitySection = React.memo(function OpacitySection() {
  const { get, set } = usePropertyHelpers();
  const opacityVal = get("opacity");
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
          set("opacity", nearest === "100" ? "" : nearest);
        }}
        suffix="%"
      />
    </Section>
  );
});
