import React, { useCallback } from "react";
import { Section } from "../ui/section.js";
import { SelectField } from "../ui/select-field.js";
import { ScrubField } from "../ui/scrub-field.js";
import { ColorField } from "../ui/color-field.js";
import { FieldGroup } from "../ui/field-group.js";
import { Button } from "../ui/button.js";
import { Minus, Plus } from "../icons.js";
import { SHADOW_PRESETS } from "../PropertiesPanel.constants.js";
import { getCachedStyle } from "../../utils/style-cache.js";
import { setStyleProp } from "../../utils/dom-style.js";
import { clearInlineAfterClassUpdate, type ClassHelpers, type Sel } from "./shared.js";

// Tailwind shadow presets — none/sm/md/lg/xl/2xl + inner. We drop the
// empty-value sentinel so the SelectField falls back to its "None" placeholder
// instead of showing the literal "default" label for unset shadows.
const SHADOW_SELECT = SHADOW_PRESETS
  .filter(p => p.value !== "")
  .map(p => ({ value: p.value, label: p.label ?? p.value }));

// ── Multi-layer shadow model ────────────────────────────────────────────────
// CSS `box-shadow` supports comma-separated stacking. Tailwind expresses this
// via a single arbitrary class with commas inside the bracket:
//   shadow-[2px_4px_8px_0px_rgb(0,0,0,0.1),inset_0px_1px_0px_0px_#fff]
// We model the union as a single ordered list of `ShadowLayer`s and split it
// into the two visible sections (drop / inset) by the `inset` flag.

interface ShadowLayer { id: string; inset: boolean; x: number; y: number; blur: number; spread: number; color: string; }

function nextShadowId(): string {
  return `s${Math.random().toString(36).slice(2, 8)}`;
}

function shadowLayerToToken(l: ShadowLayer): string {
  return [
    l.inset ? "inset" : "",
    `${l.x}px`, `${l.y}px`, `${l.blur}px`, `${l.spread}px`,
    (l.color || "rgb(0,0,0)").replace(/\s+/g, ""),
  ].filter(Boolean).join("_");
}

function parseShadowToken(token: string, id: string): ShadowLayer | null {
  // Tokens use `_` as the within-shadow separator. A leading `inset_` flips
  // the flag; otherwise the four lengths come first, then everything else
  // is the color (which may itself contain underscores e.g. `rgb(0,0,0,0.1)`).
  const parts = token.split("_");
  let i = 0;
  let inset = false;
  if (parts[0] === "inset") { inset = true; i++; }
  const px = (s: string | undefined) => (s ? parseInt(s, 10) || 0 : 0);
  if (parts.length - i < 4) return null;
  return {
    id, inset,
    x: px(parts[i]),
    y: px(parts[i + 1]),
    blur: px(parts[i + 2]),
    spread: px(parts[i + 3]),
    color: parts.slice(i + 4).join("_") || "",
  };
}

/** Find the unified `shadow-[...]` class (if any) and return all layers. */
function readShadowLayers(h: ClassHelpers): ShadowLayer[] {
  // Strip any responsive prefix so `xl:shadow-[...]` still parses.
  const cls = h.classes.find(c => /^shadow-\[/.test(h.stripBpPrefix(c)));
  if (!cls) return [];
  const m = h.stripBpPrefix(cls).match(/^shadow-\[(.+)\]$/);
  if (!m) return [];
  // Top-level commas split layers. Commas inside `rgb(…)` / `rgba(…)` /
  // `hsl(…)` are fine — those parens never nest, so a depth counter is enough.
  const tokens: string[] = [];
  let depth = 0, buf = "";
  for (const ch of m[1]) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { tokens.push(buf); buf = ""; }
    else buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens.map((t, i) => parseShadowToken(t, `s${i}`)).filter((l): l is ShadowLayer => l !== null);
}

function writeShadowLayers(h: ClassHelpers, sel: Sel, layers: ShadowLayer[]) {
  if (!sel.source) return;
  // Strip the responsive prefix so `xl:shadow-[...]` gets swept up too — we
  // keep the original (prefixed) class name in `remove` so sendPrefixed
  // targets the exact token on the element.
  const remove = h.classes.filter(c => /^shadow-\[/.test(h.stripBpPrefix(c)));
  const tokens = layers.map(shadowLayerToToken);
  // Concatenate (rather than template-literal) so Tailwind's content scanner
  // doesn't see a complete arbitrary-value utility and try to compile a CSS
  // rule containing a literal JS placeholder.
  const add = tokens.length ? ["shadow-[" + tokens.join(",") + "]"] : undefined;
  if (sel.element) {
    const cssLayers = layers.map(l => [
      l.inset ? "inset" : "",
      `${l.x}px`, `${l.y}px`, `${l.blur}px`, `${l.spread}px`,
      (l.color || "rgb(0,0,0)"),
    ].filter(Boolean).join(" "));
    setStyleProp(sel.element, "boxShadow", cssLayers.length ? cssLayers.join(", ") : "none");
    clearInlineAfterClassUpdate(sel.element, "boxShadow");
  }
  h.debouncedSendPrefixed("shadow", {
    type: "modify-class", source: sel.source,
    remove: remove.length ? remove : undefined,
    add,
  }, 120);
}

function ShadowLayerRow({ layer, onChange }: {
  layer: ShadowLayer;
  onChange: (next: ShadowLayer) => void;
}) {
  const setField = (field: "x" | "y" | "blur" | "spread") => (raw: string) => {
    const n = parseInt(raw, 10);
    onChange({ ...layer, [field]: Number.isFinite(n) ? n : 0 });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <FieldGroup>
        <ScrubField label="X" value={`${layer.x}px`} onChange={setField("x")} title="X offset"
          format={n => `${Math.round(n)}px`} />
        <ScrubField label="Y" value={`${layer.y}px`} onChange={setField("y")} title="Y offset"
          format={n => `${Math.round(n)}px`} />
        <ScrubField label="B" value={`${layer.blur}px`} onChange={setField("blur")} title="Blur"
          format={n => `${Math.round(n)}px`} />
        <ScrubField label="S" value={`${layer.spread}px`} onChange={setField("spread")} title="Spread"
          format={n => `${Math.round(n)}px`} />
      </FieldGroup>
      <ColorField
        value={layer.color}
        onChange={c => onChange({ ...layer, color: c.replace(/\s+/g, "") })}
        title={layer.inset ? "Inner shadow color" : "Shadow color"}
      />
    </div>
  );
}

/** Shared body for Shadow / Inner shadow — one LayerStack of the matching flavor. */
function ShadowFlavorBody({ h, sel, inset }: { h: ClassHelpers; sel: Sel; inset: boolean }) {
  const allLayers = readShadowLayers(h);
  const myLayers = allLayers.filter(l => l.inset === inset);

  const updateLayer = (id: string, next: ShadowLayer) => {
    const updated = allLayers.map(l => l.id === id ? next : l);
    writeShadowLayers(h, sel, updated);
  };
  const removeLayer = (id: string) => {
    writeShadowLayers(h, sel, allLayers.filter(l => l.id !== id));
  };
  const addLayer = () => {
    const next: ShadowLayer = {
      id: nextShadowId(), inset,
      x: 0, y: inset ? 1 : 4, blur: inset ? 2 : 8, spread: 0,
      color: "rgba(0,0,0,0.1)",
    };
    writeShadowLayers(h, sel, [...allLayers, next]);
  };

  return (
    <>
      {myLayers.length === 0 && (
        <div className="text-[11px] text-canvas-muted-fg italic">No {inset ? "inner " : ""}shadows.</div>
      )}
      {myLayers.map(layer => (
        <div key={layer.id} className="flex flex-col gap-1.5 pb-2 mb-1 border-b border-canvas-border/40 last:border-b-0 last:pb-0 last:mb-0">
          <ShadowLayerRow layer={layer} onChange={next => updateLayer(layer.id, next)} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeLayer(layer.id)}
            className="self-start h-6 px-2 text-[10px] text-canvas-muted-fg hover:text-canvas-fg"
            title="Remove this shadow layer"
          >
            <Minus size={10} />
            <span className="ml-1">Remove</span>
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={addLayer}
        className="h-7 justify-start text-xs text-canvas-muted-fg hover:text-canvas-fg"
        title={`Add ${inset ? "inner " : ""}shadow layer`}
      >
        <Plus size={12} />
        <span className="ml-1.5">Add {inset ? "inner " : ""}shadow</span>
      </Button>
    </>
  );
}

export const ShadowSection = React.memo(function ShadowSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  // Preset shadows (`shadow-md` etc.) live independently of the multi-layer
  // bracket form. They map to Tailwind's pre-baked elevations. Selecting a
  // preset clears the bracket-class custom shadows so they don't double up.
  const presetVal = ["sm","md","lg","xl","2xl","inner","none"].find(s => h.has(`shadow-${s}`)) || "";
  const setPreset = useCallback((v: string) => {
    if (!sel.source) return;
    const remove = h.classes.filter(c => {
      const bare = h.stripBpPrefix(c);
      return bare === "shadow" || /^shadow-(sm|md|lg|xl|2xl|inner|none)$/.test(bare);
    });
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      remove: remove.length ? remove : undefined,
      add: v ? [`shadow-${v}`] : undefined,
    });
  }, [h, sel]);
  const hasShadowClass = h.classes.some(c => {
    const bare = h.stripBpPrefix(c);
    if (/^shadow-(sm|md|lg|xl|2xl|inner)$/.test(bare)) return true;
    const m = bare.match(/^shadow-\[(.+)\]$/);
    return !!m && !m[1].startsWith("inset_");
  });
  // Also honour shadows that come from a plain stylesheet / inline style so
  // the section opens even when the source isn't a Tailwind utility.
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const csShadow = cs?.boxShadow;
  const hasComputedShadow = !!csShadow && csShadow !== "none" && !/^inset\b/.test(csShadow);
  const hasShadow = hasShadowClass || hasComputedShadow;
  return (
    <Section title="Shadow" defaultOpen={false}
      autoOpenKey={sel.element} hasValue={hasShadow}>
      <SelectField value={presetVal} options={SHADOW_SELECT} onChange={setPreset}
        placeholder="None" title="Shadow preset" />
      <ShadowFlavorBody h={h} sel={sel} inset={false} />
    </Section>
  );
});

export const InnerShadowSection = React.memo(function InnerShadowSection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const hasInnerClass = h.classes.some(c => {
    const bare = h.stripBpPrefix(c);
    const m = bare.match(/^shadow-\[(.+)\]$/);
    return !!m && m[1].startsWith("inset_");
  });
  const cs = sel.element ? getCachedStyle(sel.element) : null;
  const csShadow = cs?.boxShadow;
  const hasComputedInner = !!csShadow && /(^|, )inset\b/.test(csShadow);
  const hasInner = hasInnerClass || hasComputedInner;
  return (
    <Section title="Inner shadow" defaultOpen={false}
      autoOpenKey={sel.element} hasValue={hasInner}>
      <ShadowFlavorBody h={h} sel={sel} inset={true} />
    </Section>
  );
});
