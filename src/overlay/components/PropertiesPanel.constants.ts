// Constants and value→label maps used by PropertiesPanel sections.
// Extracted so the panel itself can stay focused on layout/state.

// ── Tailwind value maps ──
export const SPACING = ["0","0.5","1","1.5","2","2.5","3","3.5","4","5","6","7","8","9","10","11","12","14","16","20","24","28","32","36","40","44","48","52","56","60","64","72","80","96"];
export const DISPLAY_OPTS = ["block","inline-block","inline","flex","inline-flex","grid","hidden"];
export const JUSTIFY_OPTS = ["start","center","end","between","around","evenly"];
export const ALIGN_OPTS = ["start","center","end","stretch","baseline"];
export const FLEX_DIR_OPTS = ["row","row-reverse","col","col-reverse"];

// Opacity is now free-entry (0-100). Map exists purely for the legacy slider
// display conversion from class value → number.
export const OPACITY_MAP: Record<string, number> = {
  "0":0,"5":5,"10":10,"20":20,"25":25,"30":30,"40":40,"50":50,
  "60":60,"70":70,"75":75,"80":80,"90":90,"95":95,"100":100
};
export const OPACITY_VALUES: number[] = Object.values(OPACITY_MAP);

// Pre-computed option arrays
export const JUSTIFY_OPTIONS = JUSTIFY_OPTS.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
export const ALIGN_OPTIONS = ALIGN_OPTS.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

// ── ValueInput preset lists ──
// Each preset's `label` is ALSO treated as valid user input — so typing "16px"
// maps to the bare Tailwind step "4", and typing "50%" maps to "1/2".

// Shadow: sizes + inner + none. Non-matching typed values become shadow-[...].
export const SHADOW_PRESETS = [
  { value: "none", label: "none" },
  { value: "sm", label: "sm" },
  { value: "", label: "default" },
  { value: "md", label: "md" },
  { value: "lg", label: "lg" },
  { value: "xl", label: "xl" },
  { value: "2xl", label: "2xl" },
  { value: "inner", label: "inner" },
];

export const POSITION_OPTIONS = [
  { value: "", label: "Static" },
  { value: "relative", label: "Relative" },
  { value: "absolute", label: "Absolute" },
  { value: "fixed", label: "Fixed" },
  { value: "sticky", label: "Sticky" },
];

export const OVERFLOW_OPTIONS = [
  { value: "", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "auto", label: "Auto" },
  { value: "scroll", label: "Scroll" },
  { value: "clip", label: "Clip" },
  { value: "x-auto", label: "X-Auto" },
  { value: "y-auto", label: "Y-Auto" },
  { value: "x-scroll", label: "X-Scroll" },
  { value: "y-scroll", label: "Y-Scroll" },
];

// Z-index presets; anything else (typed) becomes z-[N]. Negative allowed.
export const Z_INDEX_PRESETS = [
  { value: "", label: "Auto" },
  { value: "0", label: "0" },
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "30", label: "30" },
  { value: "40", label: "40" },
  { value: "50", label: "50" },
];

// Size presets (W/H/Min-W/Max-W). Label shows CSS-style meaning so user can
// type "100%" or "50%" and hit the preset; anything else becomes [value].
export const SIZE_PRESETS = [
  { value: "", label: "Auto" },
  { value: "full", label: "100%" },
  { value: "screen", label: "100vh" },
  { value: "min", label: "min-content" },
  { value: "max", label: "max-content" },
  { value: "fit", label: "fit-content" },
  { value: "1/2", label: "50%" },
  { value: "1/3", label: "33.33%" },
  { value: "2/3", label: "66.66%" },
  { value: "1/4", label: "25%" },
  { value: "3/4", label: "75%" },
  { value: "1/5", label: "20%" },
  { value: "2/5", label: "40%" },
  { value: "3/5", label: "60%" },
  { value: "4/5", label: "80%" },
];

// Inset presets. Labels mirror what user would type (px / %).
export const INSET_PRESETS = [
  { value: "", label: "Auto" },
  { value: "0", label: "0" },
  { value: "px", label: "1px" },
  { value: "1", label: "4px" },
  { value: "2", label: "8px" },
  { value: "3", label: "12px" },
  { value: "4", label: "16px" },
  { value: "6", label: "24px" },
  { value: "8", label: "32px" },
  { value: "12", label: "48px" },
  { value: "16", label: "64px" },
  { value: "24", label: "96px" },
  { value: "1/2", label: "50%" },
  { value: "full", label: "100%" },
];

// Line-height (leading). Arbitrary typed values → leading-[1.4] etc.
export const LEADING_PRESETS = [
  { value: "", label: "Normal" },
  { value: "none", label: "1" },
  { value: "tight", label: "1.25" },
  { value: "snug", label: "1.375" },
  { value: "normal", label: "1.5" },
  { value: "relaxed", label: "1.625" },
  { value: "loose", label: "2" },
  { value: "3", label: "12px" },
  { value: "4", label: "16px" },
  { value: "5", label: "20px" },
  { value: "6", label: "24px" },
  { value: "7", label: "28px" },
  { value: "8", label: "32px" },
  { value: "9", label: "36px" },
  { value: "10", label: "40px" },
];

// Letter-spacing (tracking). Arbitrary → tracking-[0.05em].
export const TRACKING_PRESETS = [
  { value: "", label: "Normal" },
  { value: "tighter", label: "-0.05em" },
  { value: "tight", label: "-0.025em" },
  { value: "normal", label: "0" },
  { value: "wide", label: "0.025em" },
  { value: "wider", label: "0.05em" },
  { value: "widest", label: "0.1em" },
];

// Grid columns. 1-12 stay bare; >12 become grid-cols-[repeat(N,...)] via
// the GRID_COLS strategy.
export const GRID_COLS_PRESETS = [
  { value: "", label: "None" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
  { value: "10", label: "10" },
  { value: "11", label: "11" },
  { value: "12", label: "12" },
  { value: "none", label: "None" },
  { value: "subgrid", label: "subgrid" },
];

// Flex item presets (flex shorthand + common growth numbers).
export const FLEX_ITEM_PRESETS = [
  { value: "", label: "Default" },
  { value: "flex-1", label: "1 (fill)" },
  { value: "flex-auto", label: "auto" },
  { value: "flex-initial", label: "initial" },
  { value: "flex-none", label: "none" },
  { value: "flex-2", label: "2" },
  { value: "flex-3", label: "3" },
];

// Border style presets incl. extras beyond tailwind's default.
export const BORDER_STYLE_PRESETS = [
  { value: "", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" },
  { value: "hidden", label: "Hidden" },
  { value: "none", label: "None" },
];

// Radius presets (keywords); arbitrary → rounded-[Npx].
export const RADIUS_PRESETS = [
  { value: "", label: "4px" },
  { value: "none", label: "0" },
  { value: "sm", label: "2px" },
  { value: "md", label: "6px" },
  { value: "lg", label: "8px" },
  { value: "xl", label: "12px" },
  { value: "2xl", label: "16px" },
  { value: "3xl", label: "24px" },
  { value: "full", label: "100%" },
];

// Font weight presets; arbitrary numeric → font-[450] etc.
export const FONT_WEIGHT_PRESETS = [
  { value: "thin", label: "100" },
  { value: "extralight", label: "200" },
  { value: "light", label: "300" },
  { value: "normal", label: "400" },
  { value: "medium", label: "500" },
  { value: "semibold", label: "600" },
  { value: "bold", label: "700" },
  { value: "extrabold", label: "800" },
  { value: "black", label: "900" },
];

// ── Tailwind spacing scale ↔ px ──
const TW_PX_VALUES = [0,2,4,6,8,10,12,14,16,20,24,28,32,36,40,44,48,56,64,80,96,112,128,144,160,176,192,224,256,288,320,384];
const TW_SCALE_KEYS = ["0","0.5","1","1.5","2","2.5","3","3.5","4","5","6","7","8","9","10","11","12","14","16","20","24","28","32","36","40","44","48","56","64","72","80","96"];
const TW_SCALE_PX: Record<string, number> = {};
TW_SCALE_KEYS.forEach((k, i) => { TW_SCALE_PX[k] = TW_PX_VALUES[i] ?? 0; });

export function pxToTwScale(px: number): string {
  if (px === 0) return "0";
  const rounded = Math.round(px);
  const idx = TW_PX_VALUES.indexOf(rounded);
  if (idx >= 0) return TW_SCALE_KEYS[idx];
  return `[${rounded}px]`;
}

export function twValueToPx(val: string): number {
  if (TW_SCALE_PX[val] !== undefined) return TW_SCALE_PX[val];
  const match = val.match(/^\[(-?\d*\.?\d+)px\]$/);
  if (match) return parseFloat(match[1]);
  return 0;
}

// ── Deprecated aliases (kept to avoid breaking external imports). ──
// These now mirror the *_PRESETS variants for callers that still use them.
export const INSET_OPTIONS = INSET_PRESETS;
export const LEADING_OPTIONS = LEADING_PRESETS;
export const TRACKING_OPTIONS = TRACKING_PRESETS;
export const GRID_COLS_OPTIONS = GRID_COLS_PRESETS;
export const FLEX_ITEM_OPTIONS = FLEX_ITEM_PRESETS;
export const SIZE_OPTIONS = SIZE_PRESETS;
export const Z_INDEX_OPTIONS = Z_INDEX_PRESETS;
export const SHADOW_OPTIONS = SHADOW_PRESETS;
