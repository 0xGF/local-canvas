import React, { useCallback, useEffect, useState } from "react";
import { Section } from "../ui/section.js";
import { SelectField } from "../ui/select-field.js";
import { ScrubField } from "../ui/scrub-field.js";
import { ColorField } from "../ui/color-field.js";
import { ToggleGroup } from "../ui/toggle-group.js";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from "../icons.js";
import { cn } from "../../lib/utils.js";
import { getCachedStyle } from "../../utils/style-cache.js";
import { setStyleProp } from "../../utils/dom-style.js";
import { FONT_SIZE_PRESETS, LEADING_PRESETS, TRACKING_PRESETS } from "../PropertiesPanel.constants.js";
import { arbitraryColorValue, clearInlineAfterClassUpdate, type ClassHelpers, type Sel } from "./shared.js";

// Tailwind collides `text-*` between font-size, text-color, and text-align —
// so this section detects each sub-property from the class list explicitly
// instead of using `h.get("text")` (which returns whichever `text-*` class
// appears first and would cross-contaminate the three controls).

const FONT_SIZE_MAP: Record<string, number> = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
  "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48,
  "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128,
};
const FONT_SIZE_LABELS = Object.keys(FONT_SIZE_MAP);
const FONT_SIZE_BRACKET_RE = /^\[(\d+(?:\.\d+)?)(px|rem|em)?\]$/;

const FONT_WEIGHT_OPTIONS: { value: string; label: string }[] = [
  { value: "",           label: "Default" },
  { value: "thin",       label: "Thin 100" },
  { value: "extralight", label: "Extra light 200" },
  { value: "light",      label: "Light 300" },
  { value: "normal",     label: "Normal 400" },
  { value: "medium",     label: "Medium 500" },
  { value: "semibold",   label: "Semibold 600" },
  { value: "bold",       label: "Bold 700" },
  { value: "extrabold",  label: "Extra bold 800" },
  { value: "black",      label: "Black 900" },
];

const TEXT_ALIGN_ITEMS = [
  { value: "left",    icon: <AlignLeft size={12} />,    title: "Align left" },
  { value: "center",  icon: <AlignCenter size={12} />,  title: "Align center" },
  { value: "right",   icon: <AlignRight size={12} />,   title: "Align right" },
  { value: "justify", icon: <AlignJustify size={12} />, title: "Justify" },
];

const TEXT_TRANSFORM_SELECT = [
  { value: "",            label: "Normal" },
  { value: "uppercase",   label: "Uppercase" },
  { value: "lowercase",   label: "Lowercase" },
  { value: "capitalize",  label: "Capitalize" },
];

const FONT_STYLE_ITEMS = [
  { value: "italic",      label: "I", title: "Italic" },
  { value: "underline",   label: "U", title: "Underline" },
  { value: "line-through", label: "S", title: "Strikethrough" },
];

const TEXT_ALIGN_RE = /^text-(left|center|right|justify|start|end)$/;
const FONT_WEIGHT_VALUES = FONT_WEIGHT_OPTIONS.map(o => o.value).filter(Boolean);
const FONT_WEIGHT_RE = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;
const TEXT_TRANSFORM_RE = /^(uppercase|lowercase|capitalize|normal-case)$/;
// Named Tailwind color or bracketed arbitrary color — excludes size / align /
// weight / style classes that also start with `text-`. The bracketed branch
// requires the contents to look color-shaped (#hex, rgb()/rgba()/hsl()/oklch()
// /color()/var(), or a named CSS colour) — otherwise a font-size class like
// `text-[12px]` would register as the "current colour" and the color picker
// would try to display `12px` as a swatch.
const TEXT_COLOR_BRACKET_RE = /^\[(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|var)\(|(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgrey|darkgreen|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|grey|green|greenyellow|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgrey|lightgreen|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen|transparent|currentcolor)\b)/i;
const TEXT_COLOR_RE = /^text-(black|white|transparent|current|inherit|[a-z]+-(?:50|\d{2,3}0?))$/;
function isTextColorClass(bare: string): boolean {
  if (TEXT_COLOR_RE.test(bare)) return true;
  if (!bare.startsWith("text-")) return false;
  return TEXT_COLOR_BRACKET_RE.test(bare.slice(5));
}

function findTypographyClass(h: ClassHelpers, test: (bare: string) => boolean): string | undefined {
  return h.classes.find(c => test(h.stripBpPrefix(c)));
}

function decodeFontSizePx(suffix: string): number | null {
  if (suffix in FONT_SIZE_MAP) return FONT_SIZE_MAP[suffix];
  const m = suffix.match(FONT_SIZE_BRACKET_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] || "px";
  if (unit === "rem") return Math.round(n * 16);
  if (unit === "em") return Math.round(n * 16);
  return Math.round(n);
}

function encodeFontSizePx(px: number): string {
  const scaleKey = FONT_SIZE_LABELS.find(k => FONT_SIZE_MAP[k] === px);
  return scaleKey ?? `[${px}px]`;
}

export const TypographySection = React.memo(function TypographySection({ h, sel }: { h: ClassHelpers; sel: Sel }) {
  const el = sel.element;
  const cs = el ? getCachedStyle(el) : null;

  // ── Font size ────────────────────────────────────────────────────────────
  const sizeClass = findTypographyClass(h, bare => {
    if (!bare.startsWith("text-")) return false;
    const rest = bare.slice(5);
    return rest in FONT_SIZE_MAP || FONT_SIZE_BRACKET_RE.test(rest);
  });
  const sizeSuffix = sizeClass ? h.stripBpPrefix(sizeClass).slice(5) : "";
  const sizePx = sizeSuffix ? decodeFontSizePx(sizeSuffix) : null;
  const cssSizePx = cs?.fontSize ? parseFloat(cs.fontSize) : NaN;
  const sizeDisplay = sizePx != null ? `${sizePx}px` : (Number.isFinite(cssSizePx) ? `${Math.round(cssSizePx)}px` : "");
  const writeFontSize = useCallback((raw: string) => {
    if (!sel.source) return;
    const trimmed = raw.trim();
    const old = h.classes.filter(c => {
      const bare = h.stripBpPrefix(c);
      if (!bare.startsWith("text-")) return false;
      const rest = bare.slice(5);
      return rest in FONT_SIZE_MAP || FONT_SIZE_BRACKET_RE.test(rest);
    });
    if (!trimmed) {
      if (sel.element) {
        setStyleProp(sel.element, "fontSize", "");
      }
      if (old.length) h.debouncedSendPrefixed("text-size", { type: "modify-class", source: sel.source, remove: old }, 120);
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) return;
    if (sel.element) {
      setStyleProp(sel.element, "fontSize", `${Math.round(n)}px`);
      clearInlineAfterClassUpdate(sel.element, "fontSize");
    }
    h.debouncedSendPrefixed("text-size", {
      type: "modify-class", source: sel.source,
      remove: old.length ? old : undefined,
      add: [`text-${encodeFontSizePx(Math.round(n))}`],
    }, 120);
  }, [h, sel.source, sel.element]);

  // ── Font weight ──────────────────────────────────────────────────────────
  const weightClass = findTypographyClass(h, bare => FONT_WEIGHT_RE.test(bare));
  const weightVal = weightClass ? h.stripBpPrefix(weightClass).slice(5) : "";
  const setWeight = useCallback((v: string) => {
    const current = FONT_WEIGHT_VALUES.map(w => h.actual(`font-${w}`)).filter(Boolean) as string[];
    h.sendPrefixed({
      type: "modify-class", source: sel.source!,
      remove: current.length ? current : undefined,
      add: v ? [`font-${v}`] : undefined,
    });
  }, [h, sel.source]);

  // ── Text align ───────────────────────────────────────────────────────────
  const alignClass = findTypographyClass(h, bare => TEXT_ALIGN_RE.test(bare));
  const alignVal = alignClass ? h.stripBpPrefix(alignClass).slice(5) : "";
  const setAlign = useCallback((v: string) => {
    const current = alignClass ? [alignClass] : [];
    h.sendPrefixed({
      type: "modify-class", source: sel.source!,
      remove: current.length ? current : undefined,
      add: v ? [`text-${v}`] : undefined,
    });
  }, [h, sel.source, alignClass]);

  // ── Font style + decoration (italic / underline / line-through) ─────────
  const styleActuals: Record<string, string | undefined> = {};
  for (const tok of ["italic", "underline", "line-through"]) {
    styleActuals[tok] = h.classes.find(c => h.stripBpPrefix(c) === tok);
  }
  const activeStyles = Object.entries(styleActuals)
    .filter(([, actual]) => !!actual)
    .map(([tok]) => tok);
  const toggleStyle = useCallback((v: string) => {
    if (!sel.source) return;
    const actual = styleActuals[v];
    h.sendPrefixed({
      type: "modify-class", source: sel.source,
      // Pass the actually-present class (so `md:italic` is removed properly,
      // not a bare `italic` that never matches).
      remove: actual ? [actual] : undefined,
      add: actual ? undefined : [v],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, sel.source, styleActuals.italic, styleActuals.underline, styleActuals["line-through"]]);

  // ── Text transform ───────────────────────────────────────────────────────
  const transformClass = findTypographyClass(h, bare => TEXT_TRANSFORM_RE.test(bare));
  const transformVal = transformClass ? h.stripBpPrefix(transformClass) : "";
  const setTransform = useCallback((v: string) => {
    const remove = transformClass ? [transformClass] : [];
    h.sendPrefixed({
      type: "modify-class", source: sel.source!,
      remove: remove.length ? remove : undefined,
      add: v ? [v] : undefined,
    });
  }, [h, sel.source, transformClass]);

  // ── Line-height / letter-spacing scrubs (arbitrary-value) ───────────────
  const leadingClass = findTypographyClass(h, bare => /^leading-/.test(bare));
  const leadingSuffix = leadingClass ? h.stripBpPrefix(leadingClass).slice(8) : "";
  const leadingDisplay = leadingSuffix
    ? (leadingSuffix.match(/^\[(.+)\]$/)?.[1] ?? leadingSuffix)
    : (cs?.lineHeight && cs.lineHeight !== "normal" ? `${Math.round(parseFloat(cs.lineHeight))}px` : "");
  const writeLeading = useCallback((raw: string) => {
    const trimmed = raw.trim();
    const current = leadingClass ? [leadingClass] : [];
    if (!trimmed) {
      if (sel.element) setStyleProp(sel.element, "lineHeight", "");
      if (current.length) h.debouncedSendPrefixed("leading", { type: "modify-class", source: sel.source!, remove: current }, 120);
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) return;
    if (sel.element) {
      setStyleProp(sel.element, "lineHeight", `${n}px`);
      clearInlineAfterClassUpdate(sel.element, "lineHeight");
    }
    h.debouncedSendPrefixed("leading", {
      type: "modify-class", source: sel.source!,
      remove: current.length ? current : undefined,
      add: [`leading-[${n}px]`],
    }, 120);
  }, [h, sel.source, sel.element, leadingClass]);

  const trackingClass = findTypographyClass(h, bare => /^tracking-/.test(bare));
  const trackingSuffix = trackingClass ? h.stripBpPrefix(trackingClass).slice(9) : "";
  const trackingDisplay = trackingSuffix
    ? (trackingSuffix.match(/^\[(.+)\]$/)?.[1] ?? trackingSuffix)
    : "";
  const writeTracking = useCallback((raw: string) => {
    const trimmed = raw.trim();
    const current = trackingClass ? [trackingClass] : [];
    if (!trimmed) {
      if (sel.element) setStyleProp(sel.element, "letterSpacing", "");
      if (current.length) h.debouncedSendPrefixed("tracking", { type: "modify-class", source: sel.source!, remove: current }, 120);
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) return;
    if (sel.element) {
      setStyleProp(sel.element, "letterSpacing", `${n}em`);
      clearInlineAfterClassUpdate(sel.element, "letterSpacing");
    }
    h.debouncedSendPrefixed("tracking", {
      type: "modify-class", source: sel.source!,
      remove: current.length ? current : undefined,
      add: [`tracking-[${n}em]`],
    }, 120);
  }, [h, sel.source, sel.element, trackingClass]);

  // ── Text color (named or bracketed) ──────────────────────────────────────
  // Prefer the class value over the computed style. `cs.color` is the
  // element's resolved colour — which for a container with no `text-*` class
  // is whatever it inherits (usually default black). Showing that in the
  // picker when the element doesn't actually have a colour class was
  // misleading: the section rendered "000000 / 100%" even though the element
  // had no colour of its own.
  const colorClass = findTypographyClass(h, isTextColorClass);
  const colorCss = (() => {
    if (!colorClass) return "";
    const bare = h.stripBpPrefix(colorClass);
    const bracket = bare.match(/^text-\[(.+)\]$/);
    if (bracket) return bracket[1].replace(/^color:/, "");
    // Named Tailwind colour (`text-red-500` etc.) — resolve via the computed
    // style so the picker shows the actual swatch.
    return cs?.color ?? "";
  })();
  // Same drag-debounce + optimistic preview as ClassColorField. Text color
  // writes can come in at ~60/s during a SV-area drag in the picker; a bare
  // sendPrefixed-per-event produces a flurry of file writes + HMR cycles.
  const [colorPreview, setColorPreview] = useState<string | null>(null);
  useEffect(() => {
    if (colorPreview === null) return;
    const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    if (norm(colorCss) === norm(colorPreview)) setColorPreview(null);
  }, [colorCss, colorPreview]);
  const writeColor = useCallback((next: string) => {
    if (!sel.source) return;
    setColorPreview(next);
    const cleaned = next.replace(/\s+/g, "");
    const remove = colorClass ? [colorClass] : [];
    h.debouncedSendPrefixed("color:text", {
      type: "modify-class",
      source: sel.source,
      remove: remove.length ? remove : undefined,
      add: cleaned ? [`text-[${arbitraryColorValue(cleaned)}]`] : undefined,
    }, 120);
  }, [h, sel.source, colorClass]);

  const hasTypography = !!(sizeClass || weightClass || alignClass || transformClass || leadingClass || trackingClass || colorClass || activeStyles.length);

  return (
    <Section title="Typography" defaultOpen={false}
      autoOpenKey={sel.element} hasValue={hasTypography}>
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField label="Size"
          value={sizeDisplay}
          onChange={writeFontSize}
          placeholder="auto"
          format={n => `${Math.max(0, Math.round(n))}px`}
          presets={FONT_SIZE_PRESETS}
          title="Font size (px)"
        />
        <SelectField
          value={weightVal}
          options={FONT_WEIGHT_OPTIONS}
          onChange={setWeight}
          placeholder="Default"
          title="Font weight"
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ScrubField label="Line"
          value={leadingDisplay}
          onChange={writeLeading}
          placeholder="auto"
          format={n => `${Math.max(0, Math.round(n))}px`}
          presets={LEADING_PRESETS}
          title="Line height (px)"
        />
        <ScrubField label="Track"
          value={trackingDisplay}
          onChange={writeTracking}
          placeholder="0"
          format={n => n.toFixed(2)}
          parse={v => parseFloat(v)}
          presets={TRACKING_PRESETS}
          title="Letter spacing (em)"
        />
      </div>
      <div className="flex gap-1.5">
        <ToggleGroup
          value={alignVal}
          items={TEXT_ALIGN_ITEMS}
          onChange={setAlign}
        />
        <div className="flex gap-px p-0.5 rounded-md bg-canvas-muted">
          {FONT_STYLE_ITEMS.map(item => {
            const active = activeStyles.includes(item.value);
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                title={item.title}
                onClick={() => toggleStyle(item.value)}
                className={cn(
                  "min-w-[24px] h-6 px-1.5 rounded text-[11px] select-none cursor-pointer transition-colors",
                  item.value === "italic" && "italic",
                  item.value === "underline" && "underline",
                  item.value === "line-through" && "line-through",
                  active
                    ? "bg-canvas-accent text-canvas-accent-fg font-medium shadow-sm"
                    : "text-canvas-muted-fg hover:bg-canvas-muted/60 hover:text-canvas-fg",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <SelectField
        value={transformVal === "normal-case" ? "" : transformVal}
        options={TEXT_TRANSFORM_SELECT}
        onChange={setTransform}
        placeholder="Normal"
        title="Text transform"
      />
      <ColorField
        value={colorPreview ?? colorCss}
        onChange={writeColor}
        title="Text color"
      />
    </Section>
  );
});
