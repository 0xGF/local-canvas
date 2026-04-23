import React from "react";
import { Section } from "../ui/section.js";
import { Slider } from "../ui/slider.js";
import { ScrubField } from "../ui/scrub-field.js";
import type { ClassHelpers, Sel } from "./shared.js";

// A filter row: slider + scrub input for a single filter function.
function FilterRow({
  h, label, prefix, min, max, step, suffix, encode, decode, defaultN,
}: {
  h: ClassHelpers; label: string; prefix: string;
  min: number; max: number; step: number;
  /** Display unit appended to the scrub value ("px" / "%" / "°"). */
  suffix: "px" | "%" | "°";
  encode: (n: number) => string;
  decode: (v: string) => number;
  defaultN: number;
}) {
  const current = h.get(prefix);
  const n = current ? decode(current) : defaultN;
  return (
    <div className="grid grid-cols-[1fr_5rem] gap-1.5 items-center">
      <Slider
        value={n}
        min={min} max={max} step={step}
        onChange={() => { /* live preview only via Tailwind class */ }}
        onCommit={v => h.set(prefix, encode(v))}
        showValue={false}
      />
      <ScrubField
        label={label}
        value={`${n}${suffix}`}
        onChange={raw => {
          const v = parseInt(raw, 10);
          h.set(prefix, encode(Number.isFinite(v) ? v : defaultN));
        }}
        format={x => `${Math.round(x)}${suffix}`}
      />
    </div>
  );
}

const FILTER_PREFIXES = ["blur", "brightness", "contrast", "saturate", "hue-rotate", "grayscale", "invert", "sepia", "drop-shadow"];
const BACKDROP_FILTER_PREFIXES = ["backdrop-blur", "backdrop-brightness", "backdrop-contrast", "backdrop-saturate", "backdrop-hue-rotate", "backdrop-grayscale", "backdrop-invert", "backdrop-sepia", "backdrop-opacity"];

// Degree-valued filter (hue-rotate): `[Ndeg]` brackets or bare scale.
const degFilter = {
  encode: (n: number) => n === 0 ? "" : `[${n}deg]`,
  decode: (v: string) => { const m = v.match(/^\[(-?\d+)deg\]$/); return m ? parseInt(m[1], 10) : 0; },
};
// Percent filter (brightness/contrast/saturate/grayscale/invert/sepia): bare scale is percent.
const pctFilter = (neutral: number) => ({
  encode: (n: number) => n === neutral ? "" : String(n),
  decode: (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : neutral; },
});
// Px-bracket filter (blur, backdrop-blur).
const pxBracketFilter = {
  encode: (n: number) => n === 0 ? "" : `[${n}px]`,
  decode: (v: string) => { const m = v.match(/^\[(\d+)px\]$/); return m ? parseInt(m[1], 10) : 0; },
};

export const FiltersSection = React.memo(function FiltersSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const hasFilter = h.classes.some(c => {
    const bare = h.stripBpPrefix(c);
    return FILTER_PREFIXES.some(p => bare === p || bare.startsWith(p + "-"));
  });
  return (
    <Section title="Filters" defaultOpen={false}
      autoOpenKey={sel?.element} hasValue={hasFilter}>
      <FilterRow h={h} label="Blur"       prefix="blur"       min={0}    max={64}  step={1} suffix="px" {...pxBracketFilter} defaultN={0} />
      <FilterRow h={h} label="Bright"     prefix="brightness" min={0}    max={200} step={5} suffix="%"  {...pctFilter(100)}  defaultN={100} />
      <FilterRow h={h} label="Cntr"       prefix="contrast"   min={0}    max={200} step={5} suffix="%"  {...pctFilter(100)}  defaultN={100} />
      <FilterRow h={h} label="Satur"      prefix="saturate"   min={0}    max={200} step={5} suffix="%"  {...pctFilter(100)}  defaultN={100} />
      <FilterRow h={h} label="Hue"        prefix="hue-rotate" min={-180} max={180} step={5} suffix="°"  {...degFilter}       defaultN={0} />
      <FilterRow h={h} label="Gray"       prefix="grayscale"  min={0}    max={100} step={5} suffix="%"  {...pctFilter(0)}    defaultN={0} />
      <FilterRow h={h} label="Invert"     prefix="invert"     min={0}    max={100} step={5} suffix="%"  {...pctFilter(0)}    defaultN={0} />
      <FilterRow h={h} label="Sepia"      prefix="sepia"      min={0}    max={100} step={5} suffix="%"  {...pctFilter(0)}    defaultN={0} />
    </Section>
  );
});

export const BackdropFiltersSection = React.memo(function BackdropFiltersSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const hasBackdrop = h.classes.some(c => {
    const bare = h.stripBpPrefix(c);
    return BACKDROP_FILTER_PREFIXES.some(p => bare === p || bare.startsWith(p + "-"));
  });
  return (
    <Section title="Backdrop filter" defaultOpen={false}
      autoOpenKey={sel?.element} hasValue={hasBackdrop}>
      <FilterRow h={h} label="Blur"   prefix="backdrop-blur"       min={0}    max={64}  step={1} suffix="px" {...pxBracketFilter} defaultN={0} />
      <FilterRow h={h} label="Bright" prefix="backdrop-brightness" min={0}    max={200} step={5} suffix="%"  {...pctFilter(100)}  defaultN={100} />
      <FilterRow h={h} label="Cntr"   prefix="backdrop-contrast"   min={0}    max={200} step={5} suffix="%"  {...pctFilter(100)}  defaultN={100} />
      <FilterRow h={h} label="Satur"  prefix="backdrop-saturate"   min={0}    max={200} step={5} suffix="%"  {...pctFilter(100)}  defaultN={100} />
      <FilterRow h={h} label="Opac"   prefix="backdrop-opacity"    min={0}    max={100} step={5} suffix="%"  {...pctFilter(100)}  defaultN={100} />
      <FilterRow h={h} label="Hue"    prefix="backdrop-hue-rotate" min={-180} max={180} step={5} suffix="°"  {...degFilter}       defaultN={0} />
      <FilterRow h={h} label="Gray"   prefix="backdrop-grayscale"  min={0}    max={100} step={5} suffix="%"  {...pctFilter(0)}    defaultN={0} />
    </Section>
  );
});
