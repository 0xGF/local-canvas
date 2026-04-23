import React, { useCallback } from "react";
import { Section } from "../ui/section.js";
import { SelectField } from "../ui/select-field.js";
import { ScrubField } from "../ui/scrub-field.js";
import type { ClassHelpers, Sel } from "./shared.js";

const TRANSITION_PROPERTY_SELECT = [
  { value: "",           label: "None" },
  { value: "all",        label: "All" },
  { value: "colors",     label: "Colors" },
  { value: "opacity",    label: "Opacity" },
  { value: "shadow",     label: "Shadow" },
  { value: "transform",  label: "Transform" },
];
const TIMING_SELECT = [
  { value: "",        label: "Default" },
  { value: "linear",  label: "Linear" },
  { value: "in",      label: "Ease in" },
  { value: "out",     label: "Ease out" },
  { value: "in-out",  label: "Ease in-out" },
];
const ANIMATE_SELECT = [
  { value: "",       label: "None" },
  { value: "none",   label: "None" },
  { value: "spin",   label: "Spin" },
  { value: "ping",   label: "Ping" },
  { value: "pulse",  label: "Pulse" },
  { value: "bounce", label: "Bounce" },
];

// Shared scrub helpers for `duration-N` / `delay-N` (Tailwind bare values are
// in ms; bracket form `[Nms]` allowed for off-scale values).
function readScaleValue(h: ClassHelpers, prefix: string, defaultN: number): number {
  const cls = h.classes.find(c => new RegExp(`^${prefix}(?:-|$)`).test(h.stripBpPrefix(c)));
  if (!cls) return defaultN;
  const bare = h.stripBpPrefix(cls);
  if (bare === prefix) return defaultN;
  const rest = bare.slice(prefix.length + 1);
  const bracket = rest.match(/^\[(\d+)ms\]$/);
  if (bracket) return parseInt(bracket[1], 10);
  const n = parseInt(rest, 10);
  return Number.isFinite(n) ? n : defaultN;
}

function writeScaleValue(
  h: ClassHelpers,
  sel: Sel | null,
  prefix: string,
  raw: string,
  _format: (n: number) => string,
): void {
  if (!sel?.source) return;
  const trimmed = raw.trim();
  const remove = h.classes.filter(c => new RegExp(`^${prefix}(?:-|$)`).test(h.stripBpPrefix(c)));
  if (!trimmed) {
    if (remove.length) h.debouncedSendPrefixed(prefix, { type: "modify-class", source: sel.source, remove }, 120);
    return;
  }
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) {
    if (remove.length) h.debouncedSendPrefixed(prefix, { type: "modify-class", source: sel.source, remove }, 120);
    return;
  }
  // Tailwind duration/delay scale (75/100/150/200/300/500/700/1000). Use the
  // named class when it matches exactly; bracket for anything else.
  const NAMED = new Set([0, 75, 100, 150, 200, 300, 500, 700, 1000]);
  const add = NAMED.has(n) ? [`${prefix}-${n}`] : [`${prefix}-[${n}ms]`];
  h.debouncedSendPrefixed(prefix, {
    type: "modify-class", source: sel.source,
    remove: remove.length ? remove : undefined,
    add,
  }, 120);
}

export const TransitionsSection = React.memo(function TransitionsSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const transitionCls = h.classes.find(c => /^transition(?:-|$)/.test(h.stripBpPrefix(c)));
  const transitionVal = transitionCls
    ? (() => { const b = h.stripBpPrefix(transitionCls); return b === "transition" ? "" : b.slice("transition-".length); })()
    : "";
  const setTransition = useCallback((v: string) => {
    if (!sel?.source) return;
    const remove = h.classes.filter(c => /^transition(?:-|$)/.test(h.stripBpPrefix(c)));
    const add = v === "all" ? ["transition-all"]
      : v === "" ? ["transition"]
      : v ? [`transition-${v}`]
      : undefined;
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add,
    });
  }, [h, sel]);

  const durationN = readScaleValue(h, "duration", 0);
  const delayN = readScaleValue(h, "delay", 0);
  const easingCls = h.classes.find(c => /^ease-/.test(h.stripBpPrefix(c)));
  const easingVal = easingCls ? h.stripBpPrefix(easingCls).slice("ease-".length) : "";
  const setEasing = useCallback((v: string) => {
    if (!sel?.source) return;
    const remove = h.classes.filter(c => /^ease-/.test(h.stripBpPrefix(c)));
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`ease-${v}`] : undefined,
    });
  }, [h, sel]);

  const animateCls = h.classes.find(c => /^animate-/.test(h.stripBpPrefix(c)));
  const animateVal = animateCls ? h.stripBpPrefix(animateCls).slice("animate-".length) : "";
  const setAnimate = useCallback((v: string) => {
    if (!sel?.source) return;
    const remove = h.classes.filter(c => /^animate-/.test(h.stripBpPrefix(c)));
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`animate-${v}`] : undefined,
    });
  }, [h, sel]);

  const hasTransition = !!(transitionCls || durationN > 0 || delayN > 0 || easingCls || animateCls);

  return (
    <Section title="Transitions" defaultOpen={false}
      autoOpenKey={sel?.element} hasValue={hasTransition}>
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField
          value={transitionVal}
          options={TRANSITION_PROPERTY_SELECT}
          onChange={setTransition}
          placeholder="None"
          title="Transition property"
        />
        <SelectField
          value={easingVal}
          options={TIMING_SELECT}
          onChange={setEasing}
          placeholder="Default"
          title="Timing function"
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField label="Dur"
          value={durationN ? `${durationN}ms` : ""}
          onChange={raw => writeScaleValue(h, sel, "duration", raw, v => `${v}ms`)}
          placeholder="0ms"
          format={n => `${Math.max(0, Math.round(n))}ms`}
          title="Duration (ms)"
        />
        <ScrubField label="Delay"
          value={delayN ? `${delayN}ms` : ""}
          onChange={raw => writeScaleValue(h, sel, "delay", raw, v => `${v}ms`)}
          placeholder="0ms"
          format={n => `${Math.max(0, Math.round(n))}ms`}
          title="Delay (ms)"
        />
      </div>
      <SelectField
        value={animateVal}
        options={ANIMATE_SELECT}
        onChange={setAnimate}
        placeholder="None"
        title="Animation"
      />
    </Section>
  );
});
