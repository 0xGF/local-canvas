import React from "react";
import { usePropertyHelpers, PREFIX_TO_CSS, pxToTwScale } from "./PropertyContext.js";
import { Section } from "../ui/section.js";
import { SliderInput } from "../ui/slider-input.js";

export const PaddingSection = React.memo(function PaddingSection() {
  const { sel, get, set } = usePropertyHelpers();
  if (!sel) return null;

  const el = sel.element;
  const cs = el ? getComputedStyle(el) : null;
  const pt = cs ? parseFloat(cs.paddingTop) || 0 : 0;
  const pr = cs ? parseFloat(cs.paddingRight) || 0 : 0;
  const pb = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
  const pl = cs ? parseFloat(cs.paddingLeft) || 0 : 0;

  const livePreview = (prefix: string, v: number) => {
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) (el.style as any)[cssProp] = v + "px";
  };
  const commit = (prefix: string, v: number) => {
    set(prefix, pxToTwScale(v));
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) requestAnimationFrame(() => (el.style as any)[cssProp] = "");
  };

  return (
    <Section title="Padding" defaultOpen>
      <SliderInput label="Top" value={Math.round(pt)} min={0} max={200} suffix="px" onDrag={v => livePreview("pt", v)} onChange={v => commit("pt", v)} />
      <SliderInput label="Right" value={Math.round(pr)} min={0} max={200} suffix="px" onDrag={v => livePreview("pr", v)} onChange={v => commit("pr", v)} />
      <SliderInput label="Bottom" value={Math.round(pb)} min={0} max={200} suffix="px" onDrag={v => livePreview("pb", v)} onChange={v => commit("pb", v)} />
      <SliderInput label="Left" value={Math.round(pl)} min={0} max={200} suffix="px" onDrag={v => livePreview("pl", v)} onChange={v => commit("pl", v)} />
    </Section>
  );
});

export const MarginSection = React.memo(function MarginSection() {
  const { sel, get, set } = usePropertyHelpers();
  if (!sel) return null;

  const el = sel.element;
  const cs = el ? getComputedStyle(el) : null;
  const mt = cs ? parseFloat(cs.marginTop) || 0 : 0;
  const mr = cs ? parseFloat(cs.marginRight) || 0 : 0;
  const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0;
  const ml = cs ? parseFloat(cs.marginLeft) || 0 : 0;

  const livePreview = (prefix: string, v: number) => {
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) (el.style as any)[cssProp] = v + "px";
  };
  const commit = (prefix: string, v: number) => {
    set(prefix, pxToTwScale(v));
    const cssProp = PREFIX_TO_CSS[prefix];
    if (el && cssProp) requestAnimationFrame(() => (el.style as any)[cssProp] = "");
  };

  return (
    <Section title="Margin" defaultOpen={false}>
      <SliderInput label="Top" value={Math.round(mt)} min={0} max={200} suffix="px" onDrag={v => livePreview("mt", v)} onChange={v => commit("mt", v)} />
      <SliderInput label="Right" value={Math.round(mr)} min={0} max={200} suffix="px" onDrag={v => livePreview("mr", v)} onChange={v => commit("mr", v)} />
      <SliderInput label="Bottom" value={Math.round(mb)} min={0} max={200} suffix="px" onDrag={v => livePreview("mb", v)} onChange={v => commit("mb", v)} />
      <SliderInput label="Left" value={Math.round(ml)} min={0} max={200} suffix="px" onDrag={v => livePreview("ml", v)} onChange={v => commit("ml", v)} />
    </Section>
  );
});
