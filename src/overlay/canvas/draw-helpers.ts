import { TW_PX, TW_NAMES, BADGE_FONT, LABEL_FONT, DIMS_FONT, FONT } from "./constants.js";
import { prepareWithSegments, measureNaturalWidth } from "@chenglou/pretext";

// Pretext measurement cache — prepare() is called once per unique text+font,
// then measureNaturalWidth() is pure arithmetic (no DOM).
const textWidthCache = new Map<string, number>();

/** Measure text width using pretext (cached, no DOM reflow) */
export function measureText(text: string, font: string): number {
  const key = `${font}|${text}`;
  let w = textWidthCache.get(key);
  if (w !== undefined) return w;
  const prepared = prepareWithSegments(text, font);
  w = measureNaturalWidth(prepared);
  textWidthCache.set(key, w);
  // Prevent unbounded cache growth
  if (textWidthCache.size > 500) {
    const firstKey = textWidthCache.keys().next().value;
    if (firstKey) textWidthCache.delete(firstKey);
  }
  return w;
}

/** Convert px to Tailwind value. Uses bracket notation for arbitrary values. */
export function pxToTw(px: number): string {
  if (px <= 0) return "0";
  // Only use a Tailwind class if the value is an exact match — otherwise stay pixel-accurate
  const rounded = Math.round(px);
  const idx = TW_PX.indexOf(rounded);
  if (idx >= 0) return TW_NAMES[idx];
  return `[${rounded}px]`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

export function drawDashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
}

export function drawDashedEdges(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, skip: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean }) {
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = color; ctx.lineWidth = 1;
  if (skip.top !== false) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); }
  if (skip.right !== false) { ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.stroke(); }
  if (skip.bottom !== false) { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke(); }
  if (skip.left !== false) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke(); }
  ctx.setLineDash([]); ctx.restore();
}

/** Draw tag label badge. Returns badge width for hit testing. */
export function drawLabelBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, centered = false): number {
  ctx.save();
  ctx.font = LABEL_FONT;
  const tw = measureText(text, LABEL_FONT);
  const pw = 8, bw = tw + pw * 2, bh = 18;
  const bx = centered ? x - bw / 2 : x;
  ctx.fillStyle = bg;
  roundRect(ctx, bx, y, bw, bh, 10);
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4;
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(text, bx + pw, y + bh / 2);
  ctx.restore();
  return bw;
}

/** Draw dimensions badge right-aligned at (rightX, y) */
export function drawDimsBadge(ctx: CanvasRenderingContext2D, text: string, rightX: number, y: number) {
  ctx.save();
  ctx.font = DIMS_FONT;
  const tw = measureText(text, DIMS_FONT);
  const pw = 6, bw = tw + pw * 2, bh = 18;
  const bx = rightX - bw;
  ctx.fillStyle = "rgba(6, 182, 255, 0.75)";
  roundRect(ctx, bx, y, bw, bh, 10);
  ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(text, bx + pw, y + bh / 2);
  ctx.restore();
}

export function drawValueBadge(ctx: CanvasRenderingContext2D, value: number, color: string, x: number, y: number) {
  const text = String(value);
  ctx.save();
  ctx.font = BADGE_FONT;
  const tw = measureText(text, BADGE_FONT);
  const pw = 5, bw = tw + pw * 2, bh = 14, bx = x - bw / 2, by = y - bh / 2;
  ctx.fillStyle = color;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Draw a hatched (diagonal lines) fill — Figma-style padding zone */
export function drawHatchedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // Subtle tinted background
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(x, y, w, h);
  // Sparse diagonal lines
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const step = 8;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw edge handle — solid colored pill with white border and optional value badge */
export function drawEdgeHandle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  isHorizontal: boolean,
  color: string, value: number,
  hovered = false,
  zoom = 1,
): void {
  ctx.save();
  const s = Math.min(1, zoom);

  // When zoomed out very far, just hide completely
  if (zoom < 0.25) {
    ctx.restore();
    return;
  }

  // Show value inside a colored pill badge
  if (value > 0) {
    const text = String(Math.round(value));
    const fontSize = Math.round((hovered ? 10 : 9) * s);
    const dynamicFont = `600 ${fontSize}px ${FONT}`;
    ctx.font = dynamicFont;
    const tw = measureText(text, dynamicFont);
    const pw = (hovered ? 6 : 5) * s;
    const tbw = tw + pw * 2;
    const tbh = (hovered ? 16 : 14) * s;
    const tx = cx - tbw / 2;
    const ty = cy - tbh / 2;

    // White border
    ctx.fillStyle = "#fff";
    roundRect(ctx, tx - 1, ty - 1, tbw + 2, tbh + 2, (tbh / 2) + 1);
    ctx.fill();
    // Colored background
    ctx.fillStyle = color;
    ctx.globalAlpha = hovered ? 1 : 0.85;
    roundRect(ctx, tx, ty, tbw, tbh, tbh / 2);
    ctx.fill();
    // White text
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, cx, cy);
    ctx.restore();
    return;
  }

  // Zero value — small pill (no text)
  const w = Math.min(hovered ? 20 : 14, (hovered ? 20 : 14) * s);
  const h = Math.min(hovered ? 8 : 5, (hovered ? 8 : 5) * s);
  const rx = isHorizontal ? h / 2 : w / 2;
  const ry = isHorizontal ? w / 2 : h / 2;
  const bx = cx - rx, by = cy - ry;
  const bw = rx * 2, bh = ry * 2;

  ctx.fillStyle = "#fff";
  roundRect(ctx, bx - 1, by - 1, bw + 2, bh + 2, Math.min(rx, ry) + 1);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.globalAlpha = hovered ? 1 : 0.8;
  roundRect(ctx, bx, by, bw, bh, Math.min(rx, ry));
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a zero-value edge indicator.
 * Default: subtle colored dash at midpoint.
 * Hovered: full-width colored line along the edge to show it's grabbable.
 * edgeLength = the length of the element edge (width for top/bottom, height for left/right)
 * edgeStart = the start coordinate of the edge
 */
export function drawZeroNotch(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  isHorizontal: boolean,
  color: string,
  hovered = false,
  zoom = 1,
  edgeLength = 0,
  edgeStart = 0,
) {
  ctx.save();

  if (hovered && edgeLength > 0) {
    // Full edge highlight — shows the entire grabbable zone
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    if (isHorizontal) {
      ctx.moveTo(cx, edgeStart);
      ctx.lineTo(cx, edgeStart + edgeLength);
    } else {
      ctx.moveTo(edgeStart, cy);
      ctx.lineTo(edgeStart + edgeLength, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Plus icon at center to indicate "add spacing"
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy);
    ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
    ctx.stroke();
  } else {
    // Default: small colored dash at midpoint
    const s = Math.min(1, zoom);
    const len = 10 * s;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * s;
    ctx.globalAlpha = 0.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (isHorizontal) {
      ctx.moveTo(cx, cy - len / 2);
      ctx.lineTo(cx, cy + len / 2);
    } else {
      ctx.moveTo(cx - len / 2, cy);
      ctx.lineTo(cx + len / 2, cy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a diagonal grip resize handle at bottom-right corner */
export function drawResizeGrip(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  // Small filled circle with white border — sits right at the corner
  const r = 4;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const FONT = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace";
