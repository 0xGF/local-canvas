import React, { useCallback } from "react";
import { Section, SubLabel } from "../ui/section.js";
import { SelectField } from "../ui/select-field.js";
import { ScrubField } from "../ui/scrub-field.js";
import { CheckboxRow } from "../ui/checkbox-row.js";
import { Slider } from "../ui/slider.js";
import { sourceStyleHasProperty } from "../../utils/inline-style-source.js";
import { OPACITY_MAP } from "../PropertiesPanel.constants.js";
import { BLEND_MODE_OPTIONS } from "../PropertiesPanel.presets.js";
import type { ClassHelpers, Sel } from "./shared.js";

// Normalize BLEND_MODE_OPTIONS: presets' Option.label is optional, and the
// array also contains `{ separator: true }` markers that we pass through.
const BLEND_MODE_SELECT = BLEND_MODE_OPTIONS.map(o =>
  "separator" in o ? o : { value: o.value, label: o.label ?? o.value },
);

export const BlendingSection = React.memo(function BlendingSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  // Opacity — decode Tailwind scale (0..100) or bracket (`[0.37]`, `[50%]`).
  const opacityVal = h.get("opacity");
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
  const encodeOpacity = (v: number): string => {
    if (v === 100) return "";
    const scaleKey = Object.entries(OPACITY_MAP).find(([, n]) => n === v)?.[0];
    if (scaleKey !== undefined) return scaleKey;
    return `[${(v / 100).toFixed(2).replace(/\.?0+$/, "") || "0"}]`;
  };

  // Mix-blend-mode. Read from Tailwind class first, then fall back to the
  // CSS value in inline style — so the dropdown reflects what's actually
  // applied regardless of which path wrote it.
  const hasInlineBlend = !!(sel.element && sourceStyleHasProperty(sel.element, "mix-blend-mode"));
  const blendMode = (() => {
    const found = h.classes.find(c => /^mix-blend-/.test(h.stripBpPrefix(c)));
    if (found) return h.stripBpPrefix(found).replace(/^mix-blend-/, "");
    if (sel.element) {
      const raw = sel.element.getAttribute("style") || "";
      const m = raw.match(/(?:^|;)\s*mix-blend-mode\s*:\s*([^;]+)/i);
      if (m) return m[1].trim();
    }
    return "";
  })();
  const setBlend = useCallback((v: string) => {
    if (!sel.source) return;
    // If the source already sets mix-blend-mode inline, edit the inline style.
    // Adding a utility class here would lose to inline-style specificity, so
    // the sidebar change would silently no-op.
    if (hasInlineBlend) {
      h.trackedSendMutation({
        type: "modify-style",
        source: sel.source,
        property: "mixBlendMode",
        value: v,
      });
      return;
    }
    const remove = h.classes.filter(c => /^mix-blend-/.test(h.stripBpPrefix(c)));
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`mix-blend-${v}`] : undefined,
    });
  }, [h, sel, hasInlineBlend]);

  // ── Background blend mode (bg-blend-*) ───────────────────────────────────
  // Blends the element's background image against its background colour —
  // separate from `mix-blend-mode`, which blends the whole element against
  // its backdrop. Useful for image-over-colour treatments.
  const bgBlendMode = (() => {
    const found = h.classes.find(c => /^bg-blend-/.test(h.stripBpPrefix(c)));
    return found ? h.stripBpPrefix(found).replace(/^bg-blend-/, "") : "";
  })();
  const setBgBlend = useCallback((v: string) => {
    if (!sel.source) return;
    const remove = h.classes.filter(c => /^bg-blend-/.test(h.stripBpPrefix(c)));
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`bg-blend-${v}`] : undefined,
    });
  }, [h, sel]);

  // ── Isolation ────────────────────────────────────────────────────────────
  // Blend modes without `isolation: isolate` can leak through to ancestors
  // (whatever is painted below the nearest stacking context). Exposing the
  // toggle here means picking a blend mode can actually land predictably
  // without the user having to remember a separate utility class.
  const isolated = h.classes.some(c => h.stripBpPrefix(c) === "isolate");
  const isolateAuto = h.classes.some(c => h.stripBpPrefix(c) === "isolation-auto");
  const toggleIsolate = useCallback(() => {
    if (!sel.source) return;
    const isoClass = h.classes.find(c => {
      const bare = h.stripBpPrefix(c);
      return bare === "isolate" || bare === "isolation-auto";
    });
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: isoClass ? [isoClass] : undefined,
      add: isolated ? undefined : ["isolate"],
    });
  }, [h, sel.source, isolated]);

  const hasBlending = opacityNum !== 100 || !!blendMode || !!bgBlendMode || isolated || isolateAuto;
  return (
    <Section title="Blending" defaultOpen={false}
      autoOpenKey={sel.element} hasValue={hasBlending}>
      <SubLabel>Opacity</SubLabel>
      {/* px-1 on the slider column keeps the track from butting right up
          against the value pill — the thumb has its own radius and visually
          "touches" the pill without the padding. */}
      <div className="grid grid-cols-[1fr_4.25rem] gap-2 items-center">
        <div className="px-1">
          <Slider
            value={opacityNum}
            min={0} max={100} step={1}
            onChange={() => { /* live preview via slider's own drag state */ }}
            onCommit={n => h.set("opacity", encodeOpacity(n))}
            showValue={false}
          />
        </div>
        <ScrubField
          value={`${opacityNum}%`}
          onChange={raw => {
            const n = Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
            h.set("opacity", encodeOpacity(n));
          }}
          placeholder="100%"
          title="Opacity"
          format={n => `${Math.max(0, Math.min(100, Math.round(n)))}%`}
        />
      </div>
      <SubLabel>Mix blend</SubLabel>
      <SelectField value={blendMode} options={BLEND_MODE_SELECT} onChange={setBlend}
        placeholder="Normal" title="Mix blend mode — blends the element against what's behind it" />
      <SubLabel>Background blend</SubLabel>
      <SelectField value={bgBlendMode} options={BLEND_MODE_SELECT} onChange={setBgBlend}
        placeholder="Normal" title="Background blend mode — blends the element's own background image against its colour" />
      <CheckboxRow
        label="Isolate (contain blend)"
        checked={isolated}
        onChange={toggleIsolate}
      />
    </Section>
  );
});
