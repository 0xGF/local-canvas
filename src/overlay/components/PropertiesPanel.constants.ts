// Constants and value→label maps used by PropertiesPanel sections.
// Extracted so the panel itself can stay focused on layout/state.

// ── Tailwind value maps ──
export const SPACING = ["0","0.5","1","1.5","2","2.5","3","3.5","4","5","6","7","8","9","10","11","12","14","16","20","24","28","32","36","40","44","48","52","56","60","64","72","80","96"];
export const FONT_SIZES = ["xs","sm","base","lg","xl","2xl","3xl","4xl","5xl","6xl","7xl","8xl","9xl"];
export const FONT_WEIGHTS = [{v:"thin",l:"100"},{v:"extralight",l:"200"},{v:"light",l:"300"},{v:"normal",l:"400"},{v:"medium",l:"500"},{v:"semibold",l:"600"},{v:"bold",l:"700"},{v:"extrabold",l:"800"},{v:"black",l:"900"}];
export const RADIUS = ["none","sm","","md","lg","xl","2xl","3xl","full"];
export const DISPLAY_OPTS = ["block","inline-block","inline","flex","inline-flex","grid","hidden"];
export const JUSTIFY_OPTS = ["start","center","end","between","around","evenly"];
export const ALIGN_OPTS = ["start","center","end","stretch","baseline"];
export const FLEX_DIR_OPTS = ["row","row-reverse","col","col-reverse"];
export const OPACITY_MAP: Record<string, number> = {
  "0":0,"5":5,"10":10,"20":20,"25":25,"30":30,"40":40,"50":50,
  "60":60,"70":70,"75":75,"80":80,"90":90,"95":95,"100":100
};
export const OPACITY_VALUES = ["0","5","10","20","25","30","40","50","60","70","75","80","90","95","100"];

// Pre-computed option arrays
export const JUSTIFY_OPTIONS = JUSTIFY_OPTS.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
export const ALIGN_OPTIONS = ALIGN_OPTS.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
export const FONT_SIZE_OPTIONS = FONT_SIZES.map(v => ({ value: v, label: v.toUpperCase() }));
export const FONT_WEIGHT_OPTIONS = FONT_WEIGHTS.map(f => ({ value: f.v, label: `${f.v} (${f.l})` }));
export const RADIUS_OPTIONS = RADIUS.map((v, i) => ({
  value: v,
  label: ["None","Small","Default","Medium","Large","XL","2XL","3XL","Full"][i],
}));
export const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "", label: "Default" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "XL" },
  { value: "2xl", label: "2XL" },
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
];
export const Z_INDEX_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "0", label: "0" }, { value: "10", label: "10" },
  { value: "20", label: "20" }, { value: "30", label: "30" },
  { value: "40", label: "40" }, { value: "50", label: "50" },
];
export const SIZE_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "full", label: "100%" }, { value: "screen", label: "100vw/vh" },
  { value: "min", label: "Min" }, { value: "max", label: "Max" }, { value: "fit", label: "Fit" },
  { value: "1/2", label: "50%" }, { value: "1/3", label: "33%" }, { value: "2/3", label: "67%" },
  { value: "1/4", label: "25%" }, { value: "3/4", label: "75%" },
];
export const INSET_OPTIONS = [
  { value: "", label: "Auto" }, { value: "0", label: "0" },
  { value: "1", label: "4px" }, { value: "2", label: "8px" }, { value: "4", label: "16px" },
  { value: "8", label: "32px" }, { value: "16", label: "64px" },
  { value: "px", label: "1px" }, { value: "full", label: "100%" }, { value: "1/2", label: "50%" },
];
export const LEADING_OPTIONS = [
  { value: "", label: "Normal" },
  { value: "none", label: "None (1)" }, { value: "tight", label: "Tight (1.25)" },
  { value: "snug", label: "Snug (1.375)" }, { value: "normal", label: "Normal (1.5)" },
  { value: "relaxed", label: "Relaxed (1.625)" }, { value: "loose", label: "Loose (2)" },
];
export const TRACKING_OPTIONS = [
  { value: "", label: "Normal" },
  { value: "tighter", label: "Tighter" }, { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" }, { value: "wide", label: "Wide" },
  { value: "wider", label: "Wider" }, { value: "widest", label: "Widest" },
];
export const GRID_COLS_OPTIONS = [
  { value: "", label: "None" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "12", label: "12" },
];
export const FLEX_ITEM_OPTIONS = [
  { value: "", label: "Default" },
  { value: "flex-1", label: "1 (fill)" }, { value: "flex-auto", label: "Auto" },
  { value: "flex-initial", label: "Initial" }, { value: "flex-none", label: "None" },
];

// ── Tailwind spacing scale ↔ px ──
const TW_PX_VALUES = [0,2,4,6,8,10,12,14,16,20,24,28,32,36,40,44,48,56,64,80,96,112,128,144,160,176,192,224,256,288,320,384];
const TW_SCALE_KEYS = ["0","0.5","1","1.5","2","2.5","3","3.5","4","5","6","7","8","9","10","11","12","14","16","20","24","28","32","36","40","44","48","56","64","72","80","96"];
const TW_SCALE_PX: Record<string, number> = {};
TW_SCALE_KEYS.forEach((k, i) => { TW_SCALE_PX[k] = TW_PX_VALUES[i] ?? 0; });

export function pxToTwScale(px: number): string {
  if (px <= 0) return "0";
  const rounded = Math.round(px);
  const idx = TW_PX_VALUES.indexOf(rounded);
  if (idx >= 0) return TW_SCALE_KEYS[idx];
  return `[${rounded}px]`;
}

export function twValueToPx(val: string): number {
  if (TW_SCALE_PX[val] !== undefined) return TW_SCALE_PX[val];
  const match = val.match(/^\[(\d+)px\]$/);
  if (match) return parseInt(match[1]);
  return 0;
}
