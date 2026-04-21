// Preset lists for every Tailwind utility the PropertiesPanel exposes.
// Organised by the section they appear in, matching the Tailwind docs
// grouping (Layout / Flex & Grid / Typography / Backgrounds / …).
//
// Every list is designed for ValueInput: label is what the user would
// type (maps bidirectionally via parse/format), value is the Tailwind
// token that gets emitted into the class list. Free-entry values get
// bracketed automatically by the strategy.

import type { Preset } from "./ui/value-input.parsers.js";

// Matches CustomSelect's internal Option shape (not exported from that
// module to keep its surface small).
interface Option {
  value: string;
  label?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────────────────

export const ASPECT_RATIO_PRESETS: Preset[] = [
  { value: "auto",   label: "auto" },
  { value: "square", label: "1/1" },
  { value: "video",  label: "16/9" },
  { value: "[4/3]",  label: "4/3" },
  { value: "[3/2]",  label: "3/2" },
  { value: "[2/1]",  label: "2/1" },
  { value: "[21/9]", label: "21/9" },
];

export const COLUMNS_PRESETS: Preset[] = [
  { value: "", label: "auto" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  { value: "auto", label: "auto" },
  { value: "3xs", label: "16rem" },
  { value: "2xs", label: "18rem" },
  { value: "xs",  label: "20rem" },
  { value: "sm",  label: "24rem" },
  { value: "md",  label: "28rem" },
  { value: "lg",  label: "32rem" },
];

export const BOX_SIZING_OPTIONS: Option[] = [
  { value: "",            label: "Border box" },
  { value: "border",      label: "Border box" },
  { value: "content",     label: "Content box" },
];

export const FLOAT_OPTIONS: Option[] = [
  { value: "",       label: "None" },
  { value: "right",  label: "Right" },
  { value: "left",   label: "Left" },
  { value: "start",  label: "Start" },
  { value: "end",    label: "End" },
  { value: "none",   label: "None (explicit)" },
];

export const CLEAR_OPTIONS: Option[] = [
  { value: "",       label: "None" },
  { value: "left",   label: "Left" },
  { value: "right",  label: "Right" },
  { value: "both",   label: "Both" },
  { value: "start",  label: "Start" },
  { value: "end",    label: "End" },
  { value: "none",   label: "None (explicit)" },
];

export const ISOLATION_OPTIONS: Option[] = [
  { value: "",         label: "Auto" },
  { value: "isolate",  label: "Isolate" },
  { value: "auto",     label: "Auto (explicit)" },
];

export const OBJECT_FIT_OPTIONS: Option[] = [
  { value: "",           label: "Fill" },
  { value: "contain",    label: "Contain" },
  { value: "cover",      label: "Cover" },
  { value: "fill",       label: "Fill" },
  { value: "none",       label: "None" },
  { value: "scale-down", label: "Scale down" },
];

export const OBJECT_POSITION_PRESETS: Preset[] = [
  { value: "",              label: "Center" },
  { value: "center",        label: "Center" },
  { value: "top",           label: "Top" },
  { value: "right",         label: "Right" },
  { value: "bottom",        label: "Bottom" },
  { value: "left",          label: "Left" },
  { value: "top-left",      label: "Top left" },
  { value: "top-right",     label: "Top right" },
  { value: "bottom-left",   label: "Bottom left" },
  { value: "bottom-right",  label: "Bottom right" },
];

export const OVERSCROLL_OPTIONS: Option[] = [
  { value: "",         label: "Auto" },
  { value: "auto",     label: "Auto" },
  { value: "contain",  label: "Contain" },
  { value: "none",     label: "None" },
];

export const VISIBILITY_OPTIONS: Option[] = [
  { value: "",           label: "Visible" },
  { value: "visible",    label: "Visible" },
  { value: "invisible",  label: "Invisible" },
  { value: "collapse",   label: "Collapse" },
];

// ─────────────────────────────────────────────────────────────────────────
// FLEX & GRID
// ─────────────────────────────────────────────────────────────────────────

export const FLEX_WRAP_OPTIONS: Option[] = [
  { value: "",              label: "No wrap" },
  { value: "flex-wrap",     label: "Wrap" },
  { value: "flex-wrap-reverse", label: "Wrap reverse" },
  { value: "flex-nowrap",   label: "No wrap (explicit)" },
];

export const FLEX_BASIS_PRESETS: Preset[] = [
  { value: "",     label: "Auto" },
  { value: "auto", label: "Auto" },
  { value: "full", label: "100%" },
  { value: "1/2",  label: "50%" },
  { value: "1/3",  label: "33%" },
  { value: "2/3",  label: "67%" },
  { value: "1/4",  label: "25%" },
  { value: "3/4",  label: "75%" },
];

export const JUSTIFY_CONTENT_OPTIONS: Option[] = [
  { value: "",          label: "Start" },
  { value: "start",     label: "Start" },
  { value: "center",    label: "Center" },
  { value: "end",       label: "End" },
  { value: "between",   label: "Between" },
  { value: "around",    label: "Around" },
  { value: "evenly",    label: "Evenly" },
  { value: "stretch",   label: "Stretch" },
  { value: "normal",    label: "Normal" },
];

export const JUSTIFY_ITEMS_OPTIONS: Option[] = [
  { value: "",        label: "Start" },
  { value: "start",   label: "Start" },
  { value: "center",  label: "Center" },
  { value: "end",     label: "End" },
  { value: "stretch", label: "Stretch" },
  { value: "normal",  label: "Normal" },
];

export const JUSTIFY_SELF_OPTIONS: Option[] = [
  { value: "",        label: "Auto" },
  { value: "auto",    label: "Auto" },
  { value: "start",   label: "Start" },
  { value: "center",  label: "Center" },
  { value: "end",     label: "End" },
  { value: "stretch", label: "Stretch" },
];

export const ALIGN_CONTENT_OPTIONS: Option[] = [
  { value: "",         label: "Normal" },
  { value: "center",   label: "Center" },
  { value: "start",    label: "Start" },
  { value: "end",      label: "End" },
  { value: "between",  label: "Between" },
  { value: "around",   label: "Around" },
  { value: "evenly",   label: "Evenly" },
  { value: "stretch",  label: "Stretch" },
  { value: "baseline", label: "Baseline" },
];

export const ALIGN_SELF_OPTIONS: Option[] = [
  { value: "",         label: "Auto" },
  { value: "auto",     label: "Auto" },
  { value: "start",    label: "Start" },
  { value: "center",   label: "Center" },
  { value: "end",      label: "End" },
  { value: "stretch",  label: "Stretch" },
  { value: "baseline", label: "Baseline" },
];

export const PLACE_CONTENT_OPTIONS: Option[] = [
  { value: "",        label: "Start" },
  { value: "start",   label: "Start" },
  { value: "center",  label: "Center" },
  { value: "end",     label: "End" },
  { value: "between", label: "Between" },
  { value: "around",  label: "Around" },
  { value: "evenly",  label: "Evenly" },
  { value: "stretch", label: "Stretch" },
  { value: "baseline",label: "Baseline" },
];

export const PLACE_ITEMS_OPTIONS: Option[] = [
  { value: "",        label: "Start" },
  { value: "start",   label: "Start" },
  { value: "center",  label: "Center" },
  { value: "end",     label: "End" },
  { value: "stretch", label: "Stretch" },
  { value: "baseline",label: "Baseline" },
];

export const PLACE_SELF_OPTIONS: Option[] = [
  { value: "",        label: "Auto" },
  { value: "auto",    label: "Auto" },
  { value: "start",   label: "Start" },
  { value: "center",  label: "Center" },
  { value: "end",     label: "End" },
  { value: "stretch", label: "Stretch" },
];

export const GRID_COLUMN_PRESETS: Preset[] = [
  { value: "",        label: "Auto" },
  { value: "auto",    label: "Auto" },
  { value: "span-1",  label: "span 1" },
  { value: "span-2",  label: "span 2" },
  { value: "span-3",  label: "span 3" },
  { value: "span-4",  label: "span 4" },
  { value: "span-6",  label: "span 6" },
  { value: "span-12", label: "span 12" },
  { value: "span-full", label: "span full" },
];

export const GRID_ROW_PRESETS = GRID_COLUMN_PRESETS;

export const GRID_ROWS_PRESETS: Preset[] = [
  { value: "",     label: "None" },
  { value: "none", label: "None" },
  ...Array.from({ length: 6 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  { value: "subgrid", label: "subgrid" },
];

export const GRID_AUTO_FLOW_OPTIONS: Option[] = [
  { value: "",           label: "Row" },
  { value: "row",        label: "Row" },
  { value: "col",        label: "Column" },
  { value: "dense",      label: "Dense" },
  { value: "row-dense",  label: "Row dense" },
  { value: "col-dense",  label: "Column dense" },
];

export const GRID_AUTO_PRESETS: Preset[] = [
  { value: "",     label: "Auto" },
  { value: "auto", label: "Auto" },
  { value: "min",  label: "min-content" },
  { value: "max",  label: "max-content" },
  { value: "fr",   label: "1fr" },
];

// ─────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────────────

export const FONT_FAMILY_PRESETS: Preset[] = [
  { value: "",      label: "Default" },
  { value: "sans",  label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "mono",  label: "Monospace" },
];

export const FONT_STYLE_OPTIONS: Option[] = [
  { value: "",         label: "Normal" },
  { value: "italic",   label: "Italic" },
  { value: "not-italic", label: "Not italic" },
];

export const FONT_SMOOTHING_OPTIONS: Option[] = [
  { value: "",                      label: "Auto" },
  { value: "antialiased",           label: "Antialiased" },
  { value: "subpixel-antialiased",  label: "Subpixel" },
];

export const FONT_VARIANT_NUMERIC_OPTIONS: Option[] = [
  { value: "",                     label: "Normal" },
  { value: "ordinal",              label: "Ordinal" },
  { value: "slashed-zero",         label: "Slashed zero" },
  { value: "lining-nums",          label: "Lining" },
  { value: "oldstyle-nums",        label: "Oldstyle" },
  { value: "proportional-nums",    label: "Proportional" },
  { value: "tabular-nums",         label: "Tabular" },
  { value: "diagonal-fractions",   label: "Diagonal frac" },
  { value: "stacked-fractions",    label: "Stacked frac" },
];

export const TEXT_TRANSFORM_OPTIONS: Option[] = [
  { value: "",            label: "None" },
  { value: "uppercase",   label: "Uppercase" },
  { value: "lowercase",   label: "Lowercase" },
  { value: "capitalize",  label: "Capitalize" },
  { value: "normal-case", label: "Normal case" },
];

export const TEXT_OVERFLOW_OPTIONS: Option[] = [
  { value: "",          label: "Clip" },
  { value: "truncate",  label: "Truncate" },
  { value: "ellipsis",  label: "Ellipsis" },
  { value: "clip",      label: "Clip" },
];

export const TEXT_WRAP_OPTIONS: Option[] = [
  { value: "",         label: "Wrap" },
  { value: "wrap",     label: "Wrap" },
  { value: "nowrap",   label: "No wrap" },
  { value: "balance",  label: "Balance" },
  { value: "pretty",   label: "Pretty" },
];

export const WHITE_SPACE_OPTIONS: Option[] = [
  { value: "",             label: "Normal" },
  { value: "normal",       label: "Normal" },
  { value: "nowrap",       label: "No wrap" },
  { value: "pre",          label: "Pre" },
  { value: "pre-line",     label: "Pre line" },
  { value: "pre-wrap",     label: "Pre wrap" },
  { value: "break-spaces", label: "Break spaces" },
];

export const WORD_BREAK_OPTIONS: Option[] = [
  { value: "",        label: "Normal" },
  { value: "normal",  label: "Normal" },
  { value: "all",     label: "All" },
  { value: "keep",    label: "Keep" },
];

export const OVERFLOW_WRAP_OPTIONS: Option[] = [
  { value: "",         label: "Normal" },
  { value: "normal",   label: "Normal" },
  { value: "break",    label: "Break word" },
  { value: "anywhere", label: "Anywhere" },
];

export const HYPHENS_OPTIONS: Option[] = [
  { value: "",       label: "Manual" },
  { value: "none",   label: "None" },
  { value: "manual", label: "Manual" },
  { value: "auto",   label: "Auto" },
];

export const VERTICAL_ALIGN_OPTIONS: Option[] = [
  { value: "",         label: "Baseline" },
  { value: "baseline", label: "Baseline" },
  { value: "top",      label: "Top" },
  { value: "middle",   label: "Middle" },
  { value: "bottom",   label: "Bottom" },
  { value: "text-top", label: "Text top" },
  { value: "text-bottom", label: "Text bottom" },
  { value: "sub",      label: "Sub" },
  { value: "super",    label: "Super" },
];

export const LIST_STYLE_TYPE_OPTIONS: Option[] = [
  { value: "",        label: "None" },
  { value: "none",    label: "None" },
  { value: "disc",    label: "Disc" },
  { value: "decimal", label: "Decimal" },
];

export const LIST_STYLE_POSITION_OPTIONS: Option[] = [
  { value: "",        label: "Outside" },
  { value: "inside",  label: "Inside" },
  { value: "outside", label: "Outside" },
];

export const TEXT_DECORATION_LINE_OPTIONS: Option[] = [
  { value: "",             label: "None" },
  { value: "underline",    label: "Underline" },
  { value: "overline",     label: "Overline" },
  { value: "line-through", label: "Line through" },
  { value: "no-underline", label: "None (explicit)" },
];

export const TEXT_DECORATION_STYLE_OPTIONS: Option[] = [
  { value: "",       label: "Solid" },
  { value: "solid",  label: "Solid" },
  { value: "double", label: "Double" },
  { value: "dotted", label: "Dotted" },
  { value: "dashed", label: "Dashed" },
  { value: "wavy",   label: "Wavy" },
];

// ─────────────────────────────────────────────────────────────────────────
// BACKGROUNDS
// ─────────────────────────────────────────────────────────────────────────

export const BG_ATTACHMENT_OPTIONS: Option[] = [
  { value: "",       label: "Scroll" },
  { value: "fixed",  label: "Fixed" },
  { value: "local",  label: "Local" },
  { value: "scroll", label: "Scroll" },
];

export const BG_CLIP_OPTIONS: Option[] = [
  { value: "",         label: "Border box" },
  { value: "border",   label: "Border box" },
  { value: "padding",  label: "Padding box" },
  { value: "content",  label: "Content box" },
  { value: "text",     label: "Text" },
];

export const BG_ORIGIN_OPTIONS: Option[] = [
  { value: "",        label: "Padding" },
  { value: "border",  label: "Border" },
  { value: "padding", label: "Padding" },
  { value: "content", label: "Content" },
];

export const BG_REPEAT_OPTIONS: Option[] = [
  { value: "",          label: "Repeat" },
  { value: "repeat",    label: "Repeat" },
  { value: "no-repeat", label: "No repeat" },
  { value: "repeat-x",  label: "Repeat X" },
  { value: "repeat-y",  label: "Repeat Y" },
  { value: "round",     label: "Round" },
  { value: "space",     label: "Space" },
];

export const BG_SIZE_OPTIONS: Option[] = [
  { value: "",        label: "Auto" },
  { value: "auto",    label: "Auto" },
  { value: "cover",   label: "Cover" },
  { value: "contain", label: "Contain" },
];

export const BG_POSITION_PRESETS: Preset[] = [
  { value: "",              label: "Center" },
  { value: "center",        label: "Center" },
  { value: "top",           label: "Top" },
  { value: "right",         label: "Right" },
  { value: "bottom",        label: "Bottom" },
  { value: "left",          label: "Left" },
  { value: "top-left",      label: "Top left" },
  { value: "top-right",     label: "Top right" },
  { value: "bottom-left",   label: "Bottom left" },
  { value: "bottom-right",  label: "Bottom right" },
];

export const BG_IMAGE_PRESETS: Preset[] = [
  { value: "",                 label: "None" },
  { value: "none",             label: "None" },
  { value: "gradient-to-t",    label: "Gradient ↑" },
  { value: "gradient-to-tr",   label: "Gradient ↗" },
  { value: "gradient-to-r",    label: "Gradient →" },
  { value: "gradient-to-br",   label: "Gradient ↘" },
  { value: "gradient-to-b",    label: "Gradient ↓" },
  { value: "gradient-to-bl",   label: "Gradient ↙" },
  { value: "gradient-to-l",    label: "Gradient ←" },
  { value: "gradient-to-tl",   label: "Gradient ↖" },
];

// ─────────────────────────────────────────────────────────────────────────
// EFFECTS
// ─────────────────────────────────────────────────────────────────────────

// Grouped to match Figma's blend-mode menu: darkening / lightening / contrast /
// comparative / color-model families, each separated by a horizontal divider.
export const BLEND_MODE_OPTIONS: Array<Option | { separator: true }> = [
  { value: "",             label: "Normal" },
  { separator: true },
  { value: "darken",       label: "Darken" },
  { value: "multiply",     label: "Multiply" },
  { value: "color-burn",   label: "Color Burn" },
  { separator: true },
  { value: "lighten",      label: "Lighten" },
  { value: "screen",       label: "Screen" },
  { value: "plus-lighter", label: "Plus Lighter" },
  { value: "color-dodge",  label: "Color Dodge" },
  { separator: true },
  { value: "overlay",      label: "Overlay" },
  { value: "soft-light",   label: "Soft Light" },
  { value: "hard-light",   label: "Hard Light" },
  { separator: true },
  { value: "difference",   label: "Difference" },
  { value: "exclusion",    label: "Exclusion" },
  { separator: true },
  { value: "hue",          label: "Hue" },
  { value: "saturation",   label: "Saturation" },
  { value: "color",        label: "Color" },
  { value: "luminosity",   label: "Luminosity" },
];

// ─────────────────────────────────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────────────────────────────────

export const BLUR_PRESETS: Preset[] = [
  { value: "",     label: "None" },
  { value: "none", label: "None" },
  { value: "xs",   label: "4px" },
  { value: "sm",   label: "8px" },
  { value: "md",   label: "12px" },
  { value: "lg",   label: "16px" },
  { value: "xl",   label: "24px" },
  { value: "2xl",  label: "40px" },
  { value: "3xl",  label: "64px" },
];

export const FILTER_PERCENT_PRESETS: Preset[] = [
  { value: "",    label: "100%" },
  { value: "0",   label: "0%" },
  { value: "50",  label: "50%" },
  { value: "75",  label: "75%" },
  { value: "100", label: "100%" },
  { value: "125", label: "125%" },
  { value: "150", label: "150%" },
  { value: "200", label: "200%" },
];

export const HUE_ROTATE_PRESETS: Preset[] = [
  { value: "",    label: "0" },
  { value: "0",   label: "0deg" },
  { value: "15",  label: "15deg" },
  { value: "30",  label: "30deg" },
  { value: "60",  label: "60deg" },
  { value: "90",  label: "90deg" },
  { value: "180", label: "180deg" },
];

// ─────────────────────────────────────────────────────────────────────────
// TRANSFORMS
// ─────────────────────────────────────────────────────────────────────────

export const ROTATE_PRESETS: Preset[] = [
  { value: "",    label: "0deg" },
  { value: "0",   label: "0deg" },
  { value: "1",   label: "1deg" },
  { value: "2",   label: "2deg" },
  { value: "3",   label: "3deg" },
  { value: "6",   label: "6deg" },
  { value: "12",  label: "12deg" },
  { value: "45",  label: "45deg" },
  { value: "90",  label: "90deg" },
  { value: "180", label: "180deg" },
];

export const SCALE_PRESETS: Preset[] = [
  { value: "",    label: "100%" },
  { value: "0",   label: "0%" },
  { value: "50",  label: "50%" },
  { value: "75",  label: "75%" },
  { value: "90",  label: "90%" },
  { value: "95",  label: "95%" },
  { value: "100", label: "100%" },
  { value: "105", label: "105%" },
  { value: "110", label: "110%" },
  { value: "125", label: "125%" },
  { value: "150", label: "150%" },
];

export const TRANSFORM_ORIGIN_OPTIONS: Option[] = [
  { value: "",              label: "Center" },
  { value: "center",        label: "Center" },
  { value: "top",           label: "Top" },
  { value: "top-right",     label: "Top right" },
  { value: "right",         label: "Right" },
  { value: "bottom-right",  label: "Bottom right" },
  { value: "bottom",        label: "Bottom" },
  { value: "bottom-left",   label: "Bottom left" },
  { value: "left",          label: "Left" },
  { value: "top-left",      label: "Top left" },
];

// ─────────────────────────────────────────────────────────────────────────
// TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────

export const TRANSITION_PROPERTY_OPTIONS: Option[] = [
  { value: "",          label: "None" },
  { value: "none",      label: "None" },
  { value: "all",       label: "All" },
  { value: "",          label: "Default" },
  { value: "colors",    label: "Colors" },
  { value: "opacity",   label: "Opacity" },
  { value: "shadow",    label: "Shadow" },
  { value: "transform", label: "Transform" },
];

export const DURATION_PRESETS: Preset[] = [
  { value: "",    label: "0" },
  { value: "75",  label: "75ms" },
  { value: "100", label: "100ms" },
  { value: "150", label: "150ms" },
  { value: "200", label: "200ms" },
  { value: "300", label: "300ms" },
  { value: "500", label: "500ms" },
  { value: "700", label: "700ms" },
  { value: "1000", label: "1s" },
];

export const TIMING_FUNCTION_OPTIONS: Option[] = [
  { value: "",         label: "Default" },
  { value: "linear",   label: "Linear" },
  { value: "in",       label: "Ease in" },
  { value: "out",      label: "Ease out" },
  { value: "in-out",   label: "Ease in-out" },
];

export const ANIMATION_OPTIONS: Option[] = [
  { value: "",        label: "None" },
  { value: "none",    label: "None" },
  { value: "spin",    label: "Spin" },
  { value: "ping",    label: "Ping" },
  { value: "pulse",   label: "Pulse" },
  { value: "bounce",  label: "Bounce" },
];

// ─────────────────────────────────────────────────────────────────────────
// INTERACTIVITY
// ─────────────────────────────────────────────────────────────────────────

export const CURSOR_OPTIONS: Option[] = [
  { value: "",          label: "Auto" },
  { value: "auto",      label: "Auto" },
  { value: "default",   label: "Default" },
  { value: "pointer",   label: "Pointer" },
  { value: "wait",      label: "Wait" },
  { value: "text",      label: "Text" },
  { value: "move",      label: "Move" },
  { value: "help",      label: "Help" },
  { value: "not-allowed", label: "Not allowed" },
  { value: "none",      label: "None" },
  { value: "grab",      label: "Grab" },
  { value: "grabbing",  label: "Grabbing" },
  { value: "crosshair", label: "Crosshair" },
  { value: "ew-resize", label: "EW resize" },
  { value: "ns-resize", label: "NS resize" },
  { value: "zoom-in",   label: "Zoom in" },
  { value: "zoom-out",  label: "Zoom out" },
];

export const POINTER_EVENTS_OPTIONS: Option[] = [
  { value: "",     label: "Auto" },
  { value: "auto", label: "Auto" },
  { value: "none", label: "None" },
];

export const RESIZE_OPTIONS: Option[] = [
  { value: "",     label: "None" },
  { value: "none", label: "None" },
  { value: "",     label: "Both" },
  { value: "y",    label: "Vertical" },
  { value: "x",    label: "Horizontal" },
];

export const SCROLL_BEHAVIOR_OPTIONS: Option[] = [
  { value: "",       label: "Auto" },
  { value: "auto",   label: "Auto" },
  { value: "smooth", label: "Smooth" },
];

export const USER_SELECT_OPTIONS: Option[] = [
  { value: "",     label: "Auto" },
  { value: "none", label: "None" },
  { value: "text", label: "Text" },
  { value: "all",  label: "All" },
  { value: "auto", label: "Auto" },
];

export const WILL_CHANGE_OPTIONS: Option[] = [
  { value: "",          label: "Auto" },
  { value: "auto",      label: "Auto" },
  { value: "scroll",    label: "Scroll" },
  { value: "contents",  label: "Contents" },
  { value: "transform", label: "Transform" },
];

export const APPEARANCE_OPTIONS: Option[] = [
  { value: "",     label: "Auto" },
  { value: "auto", label: "Auto" },
  { value: "none", label: "None" },
];

// ─────────────────────────────────────────────────────────────────────────
// TABLES
// ─────────────────────────────────────────────────────────────────────────

export const BORDER_COLLAPSE_OPTIONS: Option[] = [
  { value: "",          label: "Separate" },
  { value: "collapse",  label: "Collapse" },
  { value: "separate",  label: "Separate" },
];

export const TABLE_LAYOUT_OPTIONS: Option[] = [
  { value: "",      label: "Auto" },
  { value: "auto",  label: "Auto" },
  { value: "fixed", label: "Fixed" },
];

export const CAPTION_SIDE_OPTIONS: Option[] = [
  { value: "",       label: "Top" },
  { value: "top",    label: "Top" },
  { value: "bottom", label: "Bottom" },
];

// ─────────────────────────────────────────────────────────────────────────
// ACCESSIBILITY
// ─────────────────────────────────────────────────────────────────────────

export const FORCED_COLOR_ADJUST_OPTIONS: Option[] = [
  { value: "",     label: "Auto" },
  { value: "auto", label: "Auto" },
  { value: "none", label: "None" },
];
