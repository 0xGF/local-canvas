import React, { useCallback } from "react";
import { Section } from "../ui/section.js";
import { ScrubField } from "../ui/scrub-field.js";
import { setStyleProp } from "../../utils/dom-style.js";
import { clearInlineAfterClassUpdate, type ClassHelpers, type Sel } from "./shared.js";

const ROTATE_CLASS_RE = /^-?rotate-(\d+|\[.+\])$/;
const SCALE_CLASS_RE = /^-?scale-(\d+|\[.+\])$/;

function readRotateDeg(h: ClassHelpers): number {
  const cls = h.classes.find(c => ROTATE_CLASS_RE.test(h.stripBpPrefix(c)));
  if (!cls) return 0;
  const bare = h.stripBpPrefix(cls);
  const neg = bare.startsWith("-");
  const body = bare.replace(/^-?rotate-/, "");
  const bracket = body.match(/^\[(-?\d+(?:\.\d+)?)deg\]$/);
  const n = bracket ? parseFloat(bracket[1]) : parseFloat(body);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

function readScalePct(h: ClassHelpers): number {
  // Ignore the flip utilities (`-scale-x-100` / `-scale-y-100`) — those live
  // in the Layout section and aren't a uniform scale.
  const cls = h.classes.find(c => {
    const bare = h.stripBpPrefix(c);
    if (!SCALE_CLASS_RE.test(bare)) return false;
    if (bare.includes("scale-x-") || bare.includes("scale-y-")) return false;
    return true;
  });
  if (!cls) return 100;
  const bare = h.stripBpPrefix(cls);
  const neg = bare.startsWith("-");
  const body = bare.replace(/^-?scale-/, "");
  const bracket = body.match(/^\[(-?\d+(?:\.\d+)?)\]$/);
  const n = bracket ? parseFloat(bracket[1]) * 100 : parseFloat(body);
  if (!Number.isFinite(n)) return 100;
  return neg ? -n : n;
}

export const TransformSection = React.memo(function TransformSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const rotateDeg = readRotateDeg(h);
  const scalePct = readScalePct(h);

  const writeRotate = useCallback((raw: string) => {
    if (!sel.source) return;
    const remove = h.classes.filter(c => ROTATE_CLASS_RE.test(h.stripBpPrefix(c)));
    const trimmed = raw.trim();
    const applyPreview = (deg: number | null) => {
      if (!sel.element) return;
      // `rotate` CSS prop (individual transform) composes cleanly with `scale`.
      setStyleProp(sel.element, "rotate", deg === null ? "" : `${deg}deg`);
      clearInlineAfterClassUpdate(sel.element, "rotate");
    };
    if (!trimmed) {
      applyPreview(null);
      if (remove.length) h.debouncedSendPrefixed("rotate", { type: "modify-class", source: sel.source, remove }, 120);
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n === 0) {
      applyPreview(null);
      if (remove.length) h.debouncedSendPrefixed("rotate", { type: "modify-class", source: sel.source, remove }, 120);
      return;
    }
    applyPreview(Math.round(n));
    h.debouncedSendPrefixed("rotate", {
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      // Concat (not template-literal) so Tailwind's scanner doesn't compile this.
      add: ["rotate-[" + Math.round(n) + "deg]"],
    }, 120);
  }, [h, sel.source, sel.element]);

  const writeScale = useCallback((raw: string) => {
    if (!sel.source) return;
    const remove = h.classes.filter(c => {
      const bare = h.stripBpPrefix(c);
      if (!SCALE_CLASS_RE.test(bare)) return false;
      return !bare.includes("scale-x-") && !bare.includes("scale-y-");
    });
    const trimmed = raw.trim();
    const applyPreview = (pct: number | null) => {
      if (!sel.element) return;
      setStyleProp(sel.element, "scale", pct === null ? "" : String(pct / 100));
      clearInlineAfterClassUpdate(sel.element, "scale");
    };
    if (!trimmed) {
      applyPreview(null);
      if (remove.length) h.debouncedSendPrefixed("scale", { type: "modify-class", source: sel.source, remove }, 120);
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n === 100) {
      applyPreview(null);
      if (remove.length) h.debouncedSendPrefixed("scale", { type: "modify-class", source: sel.source, remove }, 120);
      return;
    }
    applyPreview(n);
    h.debouncedSendPrefixed("scale", {
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: [`scale-[${(n / 100).toFixed(2).replace(/\.?0+$/, "") || "0"}]`],
    }, 120);
  }, [h, sel.source, sel.element]);

  const hasTransform = rotateDeg !== 0 || scalePct !== 100;

  return (
    <Section title="Transform" defaultOpen={false}
      autoOpenKey={sel.element} hasValue={hasTransform}>
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField label="Rot"
          value={`${Math.round(rotateDeg)}°`}
          onChange={writeRotate}
          placeholder="0°"
          format={n => `${Math.round(n)}°`}
          title="Rotate (deg)"
        />
        <ScrubField label="Scale"
          value={`${Math.round(scalePct)}%`}
          onChange={writeScale}
          placeholder="100%"
          format={n => `${Math.round(n)}%`}
          title="Uniform scale"
        />
      </div>
    </Section>
  );
});
