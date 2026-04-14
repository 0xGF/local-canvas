export type TailwindCategory =
  | "spacing"
  | "sizing"
  | "color"
  | "typography"
  | "layout"
  | "flexbox"
  | "grid"
  | "border"
  | "effect"
  | "other";

export interface TailwindToken {
  raw: string;
  responsive?: string;
  state?: string;
  utility: string;
  value: string;
  negative: boolean;
  arbitrary: boolean;
  category: TailwindCategory;
}

const CATEGORY_MAP: Record<string, TailwindCategory> = {
  // Spacing
  p: "spacing", px: "spacing", py: "spacing", pt: "spacing",
  pr: "spacing", pb: "spacing", pl: "spacing",
  m: "spacing", mx: "spacing", my: "spacing", mt: "spacing",
  mr: "spacing", mb: "spacing", ml: "spacing",
  gap: "spacing", "gap-x": "spacing", "gap-y": "spacing",
  space: "spacing", "space-x": "spacing", "space-y": "spacing",

  // Sizing
  w: "sizing", "min-w": "sizing", "max-w": "sizing",
  h: "sizing", "min-h": "sizing", "max-h": "sizing",
  size: "sizing",

  // Colors
  bg: "color", text: "color", border: "color",
  ring: "color", "ring-offset": "color",
  from: "color", via: "color", to: "color",
  accent: "color", caret: "color",
  fill: "color", stroke: "color",
  outline: "color", decoration: "color",
  divide: "color", placeholder: "color",
  shadow: "color",

  // Typography
  font: "typography", "text-": "typography",
  leading: "typography", tracking: "typography",
  "line-clamp": "typography", truncate: "typography",
  italic: "typography", "not-italic": "typography",
  underline: "typography", overline: "typography",
  "line-through": "typography", "no-underline": "typography",
  uppercase: "typography", lowercase: "typography",
  capitalize: "typography", "normal-case": "typography",
  antialiased: "typography", "subpixel-antialiased": "typography",

  // Layout
  block: "layout", inline: "layout", hidden: "layout",
  "inline-block": "layout", "inline-flex": "layout",
  "inline-grid": "layout", flow: "layout",
  container: "layout", columns: "layout",
  static: "layout", fixed: "layout", absolute: "layout",
  relative: "layout", sticky: "layout",
  top: "layout", right: "layout", bottom: "layout", left: "layout",
  inset: "layout", "inset-x": "layout", "inset-y": "layout",
  z: "layout", float: "layout", clear: "layout",
  overflow: "layout", "overflow-x": "layout", "overflow-y": "layout",
  visible: "layout", invisible: "layout",

  // Flexbox
  flex: "flexbox", "flex-row": "flexbox", "flex-col": "flexbox",
  "flex-wrap": "flexbox", "flex-nowrap": "flexbox",
  grow: "flexbox", shrink: "flexbox", basis: "flexbox",
  justify: "flexbox", items: "flexbox",
  self: "flexbox", content: "flexbox",
  order: "flexbox",

  // Grid
  grid: "grid", "grid-cols": "grid", "grid-rows": "grid",
  col: "grid", row: "grid", "auto-cols": "grid", "auto-rows": "grid",
  "grid-flow": "grid", place: "grid",

  // Border
  rounded: "border", "rounded-t": "border", "rounded-r": "border",
  "rounded-b": "border", "rounded-l": "border",
  "rounded-tl": "border", "rounded-tr": "border",
  "rounded-bl": "border", "rounded-br": "border",
  "border-": "border",

  // Effects
  opacity: "effect",
  "drop-shadow": "effect", blur: "effect",
  brightness: "effect", contrast: "effect",
  grayscale: "effect", "hue-rotate": "effect",
  invert: "effect", saturate: "effect", sepia: "effect",
  "backdrop-blur": "effect", "backdrop-brightness": "effect",
  transition: "effect", duration: "effect",
  ease: "effect", delay: "effect",
  animate: "effect", cursor: "effect",
  select: "effect", "pointer-events": "effect",
  resize: "effect", "scroll-behavior": "effect",
  "snap-": "effect", touch: "effect",
  appearance: "effect", "will-change": "effect",
};

const RESPONSIVE_PREFIXES = new Set([
  "sm", "md", "lg", "xl", "2xl",
]);

const STATE_PREFIXES = new Set([
  "hover", "focus", "active", "visited", "disabled",
  "first", "last", "odd", "even", "group-hover",
  "focus-within", "focus-visible", "checked",
  "placeholder", "dark",
]);

export function parseClass(raw: string): TailwindToken {
  let remaining = raw;
  let responsive: string | undefined;
  let state: string | undefined;
  let negative = false;

  // Parse prefixes (responsive:state:utility)
  const parts = remaining.split(":");
  if (parts.length >= 2) {
    const prefixes = parts.slice(0, -1);
    remaining = parts[parts.length - 1];

    for (const prefix of prefixes) {
      if (RESPONSIVE_PREFIXES.has(prefix)) {
        responsive = prefix;
      } else if (STATE_PREFIXES.has(prefix)) {
        state = prefix;
      }
    }
  }

  // Check for negative
  if (remaining.startsWith("-")) {
    negative = true;
    remaining = remaining.substring(1);
  }

  // Check for arbitrary value
  const arbitrary = remaining.includes("[");

  // Split utility from value
  const lastDash = remaining.lastIndexOf("-");
  let utility: string;
  let value: string;

  if (arbitrary) {
    const bracketIndex = remaining.indexOf("[");
    utility = remaining.substring(0, bracketIndex - 1) || remaining;
    value = remaining.substring(bracketIndex);
  } else if (lastDash === -1) {
    utility = remaining;
    value = "";
  } else {
    utility = remaining.substring(0, lastDash);
    value = remaining.substring(lastDash + 1);
  }

  // Categorize
  const category = categorize(utility, remaining);

  return { raw, responsive, state, utility, value, negative, arbitrary, category };
}

export function parseClasses(className: string): TailwindToken[] {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .map(parseClass);
}

export function groupByCategory(
  tokens: TailwindToken[]
): Record<TailwindCategory, TailwindToken[]> {
  const groups: Record<TailwindCategory, TailwindToken[]> = {
    spacing: [], sizing: [], color: [], typography: [],
    layout: [], flexbox: [], grid: [], border: [],
    effect: [], other: [],
  };

  for (const token of tokens) {
    groups[token.category].push(token);
  }

  return groups;
}

function categorize(utility: string, full: string): TailwindCategory {
  // Direct match
  if (CATEGORY_MAP[full]) return CATEGORY_MAP[full];
  if (CATEGORY_MAP[utility]) return CATEGORY_MAP[utility];

  // Prefix match
  for (const [prefix, category] of Object.entries(CATEGORY_MAP)) {
    if (utility.startsWith(prefix) || full.startsWith(prefix)) {
      return category;
    }
  }

  return "other";
}
