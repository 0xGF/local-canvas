// ── Feature detection ──
export const HAS_DRAW_ELEMENT =
  typeof CanvasRenderingContext2D !== "undefined" &&
  "drawElementImage" in CanvasRenderingContext2D.prototype;

// ── Colors ──
export const COL = {
  blue: "#06B6FF",
  blueDim: "rgba(6, 182, 255, 0.4)",
  blueFaint: "rgba(6, 182, 255, 0.04)",
  margin: "#FE7338",
  marginBg: "rgba(254, 115, 56, 0.12)",
  marginDash: "rgba(254, 115, 56, 0.5)",
  padding: "#24CA71",
  paddingBg: "rgba(36, 202, 113, 0.12)",
  paddingDash: "rgba(36, 202, 113, 0.5)",
  purple: "#874EFF",
  purpleBg: "rgba(135, 78, 255, 0.1)",
  // Annotate-mode hover accent — matches the yellow `+` cursor so the user
  // can see which element will receive their next annotate click.
  annotate: "#ffb800",
  annotateDim: "rgba(255, 184, 0, 0.8)",
  annotateBg: "rgba(255, 184, 0, 0.1)",
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
  type: "margin" | "padding";
  side: "top" | "right" | "bottom" | "left";
  value: number;
  prefix: string;
}

export interface TagBadgeHit { x: number; y: number; w: number; h: number; }

// ── Prefix → CSS property ──
export const PREFIX_TO_CSS: Record<string, string> = {
  mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
  pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
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
