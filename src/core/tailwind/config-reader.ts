import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface TailwindTheme {
  colors: string[];
  spacing: string[];
  fontSize: string[];
  borderRadius: string[];
  fontFamily: string[];
}

const DEFAULT_COLORS = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime",
  "green", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia",
  "pink", "rose",
  "white", "black", "transparent", "current",
  "inherit",
];

const DEFAULT_SHADES = [
  "50", "100", "200", "300", "400",
  "500", "600", "700", "800", "900", "950",
];

const DEFAULT_SPACING = [
  "0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5",
  "4", "5", "6", "7", "8", "9", "10", "11", "12",
  "14", "16", "20", "24", "28", "32", "36", "40",
  "44", "48", "52", "56", "60", "64", "72", "80", "96",
  "px", "auto", "full", "screen",
];

const DEFAULT_FONT_SIZES = [
  "xs", "sm", "base", "lg", "xl",
  "2xl", "3xl", "4xl", "5xl", "6xl",
  "7xl", "8xl", "9xl",
];

const DEFAULT_BORDER_RADIUS = [
  "none", "sm", "", "md", "lg", "xl", "2xl", "3xl", "full",
];

export function readTailwindTheme(projectRoot: string): TailwindTheme {
  // Generate color options (color-shade combinations)
  const colors: string[] = [];
  for (const color of DEFAULT_COLORS) {
    if (["white", "black", "transparent", "current", "inherit"].includes(color)) {
      colors.push(color);
    } else {
      for (const shade of DEFAULT_SHADES) {
        colors.push(`${color}-${shade}`);
      }
    }
  }

  // Check for custom theme extensions in tailwind config
  const configPaths = [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.cjs",
  ];

  let hasCustomConfig = false;
  for (const configPath of configPaths) {
    if (existsSync(resolve(projectRoot, configPath))) {
      hasCustomConfig = true;
      break;
    }
  }

  return {
    colors,
    spacing: DEFAULT_SPACING,
    fontSize: DEFAULT_FONT_SIZES,
    borderRadius: DEFAULT_BORDER_RADIUS,
    fontFamily: ["sans", "serif", "mono"],
  };
}
