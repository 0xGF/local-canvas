/**
 * Color conversion utilities for the picker primitives.
 *
 * All colors round-trip through a single normalized model:
 *   { h: 0-360, s: 0-100, v: 0-100, a: 0-1 }
 *
 * Plus on-demand conversion to RGB / HSL / LCH / HEX strings.
 */

export interface HSVA { h: number; s: number; v: number; a: number; }
export interface RGBA { r: number; g: number; b: number; a: number; }
export interface HSLA { h: number; s: number; l: number; a: number; }
export interface LCHA { l: number; c: number; h: number; a: number; }

export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

// -- HSV ↔ RGB --------------------------------------------------------------

export function hsvaToRgba({ h, s, v, a }: HSVA): RGBA {
  const sN = s / 100;
  const vN = v / 100;
  const c = vN * sN;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = vN - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  };
}

export function rgbaToHsva({ r, g, b, a }: RGBA): HSVA {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rN) h = ((gN - bN) / d) % 6;
    else if (max === gN) h = (bN - rN) / d + 2;
    else h = (rN - gN) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const v = max;
  const s = max === 0 ? 0 : d / max;
  return { h, s: s * 100, v: v * 100, a };
}

// -- HSL ↔ RGB --------------------------------------------------------------

export function rgbaToHsla({ r, g, b, a }: RGBA): HSLA {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0));
    else if (max === gN) h = (bN - rN) / d + 2;
    else h = (rN - gN) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100, a };
}

// -- LCH (CIE Lab + polar) ↔ RGB --------------------------------------------
// sRGB → linear → XYZ → Lab → LCh
const srgbToLin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export function rgbaToLcha({ r, g, b, a }: RGBA): LCHA {
  const rl = srgbToLin(r / 255);
  const gl = srgbToLin(g / 255);
  const bl = srgbToLin(b / 255);
  // sRGB D65 → XYZ
  const X = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const Y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const Z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;
  // D65 reference white
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / Xn), fy = f(Y / Yn), fz = f(Z / Zn);
  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: Math.max(0, L), c: C, h: H, a };
}

// -- HEX --------------------------------------------------------------------

const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

export function rgbaToHex({ r, g, b, a }: RGBA, includeAlpha = false): string {
  const base = toHex(r) + toHex(g) + toHex(b);
  if (!includeAlpha || a >= 1) return "#" + base;
  return "#" + base + toHex(Math.round(a * 255));
}

export function hexToRgba(hex: string): RGBA | null {
  const cleaned = hex.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{3,8}$/i.test(cleaned)) return null;
  let h = cleaned;
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (h.length === 4) h = h.split("").map(c => c + c).join("");
  if (h.length === 5 || h.length === 7) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// -- High-level helpers -----------------------------------------------------

export function rgbaCss({ r, g, b, a }: RGBA): string {
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

/**
 * Parse a free-form color string into HSVA. Accepts:
 *   #rgb #rgba #rrggbb #rrggbbaa
 *   rgb(...) rgba(...)
 *   hsl(...) hsla(...)
 *   transparent
 * Returns null if unparseable.
 */
export function parseColor(input: string): HSVA | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { h: 0, s: 0, v: 0, a: 0 };
  if (s.startsWith("#")) {
    const rgba = hexToRgba(s);
    return rgba ? rgbaToHsva(rgba) : null;
  }
  const rgbMatch = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    const a = parts[3] !== undefined ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    if ([r, g, b, a].some(n => !Number.isFinite(n))) return null;
    return rgbaToHsva({ r, g, b, a });
  }
  return null;
}
