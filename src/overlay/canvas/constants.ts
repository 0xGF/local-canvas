// ── Feature detection ──
export const HAS_DRAW_ELEMENT =
  typeof CanvasRenderingContext2D !== "undefined" &&
  "drawElementImage" in CanvasRenderingContext2D.prototype;

import { THEME, hexToRgba } from "../theme.js";

// ── Colors ──
// The canvas palette is NOT a duplicate palette. It's a thin alias so paint
// code still reads `COL.blue` etc., but the base hues come straight from
// the shared theme tokens — selection blue → `accent`, padding → `success`,
// annotate → `warning`. Only `margin` (orange) and `purple` (layers) live
// locally because they have no status equivalent. `hexToRgba` composes the
// `Dim` / `Bg` alpha variants so tuning a hue in theme.ts cascades here
// without touching the canvas code.
export const COL = {
  blue: THEME.accent,
  blueDim: hexToRgba(THEME.accent, 0.4),
  blueFaint: hexToRgba(THEME.accent, 0.04),
  margin: THEME.canvasMargin,
  marginBg: hexToRgba(THEME.canvasMargin, 0.12),
  marginDash: hexToRgba(THEME.canvasMargin, 0.5),
  padding: THEME.success,
  paddingBg: hexToRgba(THEME.success, 0.12),
  paddingDash: hexToRgba(THEME.success, 0.5),
  purple: THEME.canvasLayer,
  purpleBg: hexToRgba(THEME.canvasLayer, 0.1),
  // Annotate-mode hover accent — shares `warning` with the pin disc so the
  // + cursor colour and the soon-to-be-placed pin colour always match.
  annotate: THEME.warning,
  annotateDim: hexToRgba(THEME.warning, 0.8),
  annotateBg: hexToRgba(THEME.warning, 0.1),
} as const;

export const FONT = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace";
export const BADGE_FONT = `600 9px ${FONT}`;
export const LABEL_FONT = `500 10px ${FONT}`;
export const DIMS_FONT = `400 9px ${FONT}`;

// ── Tailwind spacing ──
export const TW_PX = [0,2,4,6,8,10,12,14,16,20,24,28,32,36,40,44,48,56,64,80,96,112,128,144,160,176,192,224,256,288,320,384];
export const TW_NAMES = ["0","0.5","1","1.5","2","2.5","3","3.5","4","5","6","7","8","9","10","11","12","14","16","20","24","28","32","36","40","44","48","56","64","72","80","96"];

// ── Interfaces ──
export interface SpacingBox { top: number; right: number; bottom: number; left: number; }

export interface BadgeHit {
  x: number; y: number; w: number; h: number;
  type: "margin" | "padding" | "gap";
  // "x" / "y" are only used when type === "gap" (column / row axis).
  side: "top" | "right" | "bottom" | "left" | "x" | "y";
  value: number;
  prefix: string;
}

export interface TagBadgeHit { x: number; y: number; w: number; h: number; }

// ── Prefix → CSS property ──
export const PREFIX_TO_CSS: Record<string, string> = {
  mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
  pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
  "gap-x": "columnGap", "gap-y": "rowGap",
};

export const SIDE_PREFIX: Record<string, Record<string, string>> = {
  margin: { top: "mt", right: "mr", bottom: "mb", left: "ml" },
  padding: { top: "pt", right: "pr", bottom: "pb", left: "pl" },
};

// ── Badge CSS for drawElementImage ──
export const BADGE_CSS: React.CSSProperties = {
  display: "inline-block", fontSize: 9, fontWeight: 600, fontFamily: FONT,
  color: "#fff", padding: "0 4px", borderRadius: 3, whiteSpace: "nowrap", lineHeight: "14px",
};
export const LABEL_CSS: React.CSSProperties = {
  display: "inline-block", fontSize: 10, fontWeight: 500, fontFamily: FONT,
  color: "#fff", padding: "0 5px", borderRadius: 3, whiteSpace: "nowrap",
  lineHeight: "14px", letterSpacing: "0.2px",
};
