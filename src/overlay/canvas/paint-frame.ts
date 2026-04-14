import type { BadgeHit, TagBadgeHit, SpacingBox } from "./constants.js";
import { COL, BADGE_FONT, SIDE_PREFIX } from "./constants.js";
import { roundRect, drawDashedLine, drawDashedEdges, drawLabelBadge, drawValueBadge, drawHatchedRect, drawEdgeHandle, drawZeroNotch, drawResizeGrip } from "./draw-helpers.js";
import type { SourceLocation } from "../../core/source-map/types.js";
import type { ScannedComponent } from "../../core/scanner/types.js";
import { getCachedStyle } from "../utils/style-cache.js";

interface EditorSnapshot {
  selectedElement: {
    element: HTMLElement;
    tagName: string;
    className: string;
    source?: SourceLocation | null;
  } | null;
  hoveredElement: HTMLElement | null;
}

/** Extra context for drawing component badges and change indicators */
export interface PaintContext {
  components?: ScannedComponent[];
  changedFiles?: Set<string>; // "filePath:line" keys
}

interface ViewportSnapshot {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PaintResult {
  badges: BadgeHit[];
  tagHit: TagBadgeHit | null;
}

// Dirty-checking cache to skip unnecessary repaints
let prevSelectedEl: HTMLElement | null = null;
let prevHoveredEl: HTMLElement | null = null;
let prevZoom = 1;
let prevPanX = 0;
let prevPanY = 0;
let prevRectStr = "";
let lastPaintTime = 0;

export function resetPaintCache() {
  prevSelectedEl = null;
  prevHoveredEl = null;
  prevZoom = 1;
  prevPanX = 0;
  prevPanY = 0;
  prevRectStr = "";
  lastPaintTime = 0;
}

/**
 * Returns true if the frame should be repainted.
 * Falls back to repainting every 500ms even if "clean".
 */
export function shouldRepaint(editor: EditorSnapshot, viewport: ViewportSnapshot): boolean {
  const now = performance.now();
  const selEl = editor.selectedElement?.element ?? null;
  const hovEl = editor.hoveredElement;

  // Always repaint if selection/hover changed
  if (selEl !== prevSelectedEl || hovEl !== prevHoveredEl) return true;
  if (viewport.zoom !== prevZoom || viewport.panX !== prevPanX || viewport.panY !== prevPanY) return true;

  // Check if selected element moved (scroll, layout shift)
  if (selEl?.isConnected) {
    const r = selEl.getBoundingClientRect();
    const str = `${r.left},${r.top},${r.width},${r.height}`;
    if (str !== prevRectStr) return true;
  }

  // When an element is selected, repaint frequently for notch hover effects
  if (selEl && now - lastPaintTime > 50) return true;

  // Fallback: repaint at least every 500ms
  if (now - lastPaintTime > 500) return true;

  return false;
}

export interface ActiveDrag {
  prefix: string; // e.g. "pt", "ml"
  value: number;  // current px value from drag
}

export function paintFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  editor: EditorSnapshot,
  viewport: ViewportSnapshot,
  iframeOffset: { x: number; y: number; scale?: number } = { x: 0, y: 0 },
  paintCtx?: PaintContext,
  activeDrag?: ActiveDrag | null,
  mousePos?: { x: number; y: number } | null,
): PaintResult {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // When zoomed out, the transformed page can extend beyond the viewport.
  // Size the canvas to cover the full visible area.
  const appRoot = document.getElementById("root");
  let canvasW = vw;
  let canvasH = vh;
  if (appRoot && viewport.zoom < 1) {
    const rootRect = appRoot.getBoundingClientRect();
    canvasW = Math.max(vw, rootRect.right);
    canvasH = Math.max(vh, rootRect.bottom);
  }
  const tw = Math.round(canvasW * dpr);
  const th = Math.round(canvasH * dpr);
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw;
    canvas.height = th;
    canvas.style.width = canvasW + "px";
    canvas.style.height = canvasH + "px";
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasW, canvasH);

  const { selectedElement, hoveredElement } = editor;
  const zoomScale = viewport.zoom;
  const badges: BadgeHit[] = [];
  let tagHit: TagBadgeHit | null = null;

  // ── Hover highlight ──
  const hEl = hoveredElement;
  const sEl = selectedElement?.element;
  const ifs = iframeOffset.scale ?? 1;
  if (hEl && hEl !== sEl) {
    const raw = hEl.getBoundingClientRect();
    const ox = iframeOffset.x, oy = iframeOffset.y;
    const r = { left: raw.left * ifs + ox, top: raw.top * ifs + oy, width: raw.width * ifs, height: raw.height * ifs };

    // Compute margin/padding for hovered element
    const hcs = getCachedStyle(hEl);
    const hz = (v: number) => v * zoomScale;
    const hm = {
      top: hz(parseFloat(hcs.marginTop) || 0),
      right: hz(parseFloat(hcs.marginRight) || 0),
      bottom: hz(parseFloat(hcs.marginBottom) || 0),
      left: hz(parseFloat(hcs.marginLeft) || 0),
    };
    const hp = {
      top: hz(parseFloat(hcs.paddingTop) || 0),
      right: hz(parseFloat(hcs.paddingRight) || 0),
      bottom: hz(parseFloat(hcs.paddingBottom) || 0),
      left: hz(parseFloat(hcs.paddingLeft) || 0),
    };

    // Draw margin zones
    ctx.save();
    if (hm.top > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left, r.top - hm.top, r.width, hm.top); }
    if (hm.bottom > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left, r.top + r.height, r.width, hm.bottom); }
    if (hm.left > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left - hm.left, r.top, hm.left, r.height); }
    if (hm.right > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left + r.width, r.top, hm.right, r.height); }

    // Draw padding zones
    if (hp.top > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left, r.top, r.width, hp.top); }
    if (hp.bottom > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left, r.top + r.height - hp.bottom, r.width, hp.bottom); }
    if (hp.left > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left, r.top + hp.top, hp.left, r.height - hp.top - hp.bottom); }
    if (hp.right > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left + r.width - hp.right, r.top + hp.top, hp.right, r.height - hp.top - hp.bottom); }
    ctx.restore();

    // Draw gap zones for flex/grid
    const hDisplay = hcs.display;
    if (hDisplay === "flex" || hDisplay === "inline-flex" || hDisplay === "grid" || hDisplay === "inline-grid") {
      const hrg = parseFloat(hcs.rowGap) || 0;
      const hcg = parseFloat(hcs.columnGap) || 0;
      if (hrg > 0 || hcg > 0) {
        const children = Array.from(hEl.children).filter(c => c instanceof HTMLElement && getCachedStyle(c).position !== "absolute") as HTMLElement[];
        const childRects = children.map(c => {
          const cr = c.getBoundingClientRect();
          return { left: cr.left * ifs + ox, top: cr.top * ifs + oy, right: cr.right * ifs + ox, bottom: cr.bottom * ifs + oy };
        });
        ctx.save();
        for (let i = 0; i < childRects.length; i++) {
          for (let j = i + 1; j < childRects.length; j++) {
            const a = childRects[i], b = childRects[j];
            if (hcg > 0 && b.left > a.right - 1 && a.bottom > b.top + 1) {
              const gW = b.left - a.right;
              if (gW > 1) { ctx.fillStyle = COL.purpleBg; ctx.fillRect(a.right, Math.max(a.top, b.top), gW, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); }
            }
            if (hrg > 0 && b.top > a.bottom - 1 && a.right > b.left + 1) {
              const gH = b.top - a.bottom;
              if (gH > 1) { ctx.fillStyle = COL.purpleBg; ctx.fillRect(Math.max(a.left, b.left), a.bottom, Math.min(a.right, b.right) - Math.max(a.left, b.left), gH); }
            }
          }
        }
        ctx.restore();
      }
    }

    // Element outline
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COL.blueDim;
    ctx.lineWidth = 1.5;
    roundRect(ctx, r.left, r.top, r.width, r.height, 2);
    ctx.stroke();
    ctx.fillStyle = COL.blueFaint;
    roundRect(ctx, r.left, r.top, r.width, r.height, 2);
    ctx.fill();
    ctx.setLineDash([]);
    ctx.restore();

    // Tag label + dimensions
    const tag = hEl.tagName.toLowerCase();
    const hCssW = parseFloat(hcs.width) || r.width;
    const hCssH = parseFloat(hcs.height) || r.height;
    const hDims = `${Math.round(hCssW)} × ${Math.round(hCssH)}`;
    drawLabelBadge(ctx, `${tag}  ${hDims}`, r.left, r.top - 22, COL.blue);
  }

  // ── Selected element ──
  if (selectedElement) {
    const el = selectedElement.element;
    if (el.isConnected) {
      const rawRect = el.getBoundingClientRect();
      const ox = iframeOffset.x, oy = iframeOffset.y;
      const r = {
        left: rawRect.left * ifs + ox, top: rawRect.top * ifs + oy,
        width: rawRect.width * ifs, height: rawRect.height * ifs,
        right: rawRect.right * ifs + ox, bottom: rawRect.bottom * ifs + oy,
      };
      const cs = getCachedStyle(el);

      // Scale factor: getComputedStyle returns CSS values, getBoundingClientRect returns screen values.
      // We scale CSS spacing to match screen coordinates.
      const sz = (v: number) => v * zoomScale;

      const isAutoH = cs.marginLeft === cs.marginRight &&
        (el.style.marginLeft === "auto" || el.style.marginRight === "auto" ||
        el.className?.includes?.("mx-auto") || el.className?.includes?.("m-auto"));
      const isAutoV = cs.marginTop === cs.marginBottom &&
        (el.style.marginTop === "auto" || el.style.marginBottom === "auto" ||
        el.className?.includes?.("my-auto") || el.className?.includes?.("m-auto"));

      // Raw CSS values (for badge display)
      const mRaw: SpacingBox = {
        top: isAutoV ? 0 : parseFloat(cs.marginTop) || 0,
        right: isAutoH ? 0 : parseFloat(cs.marginRight) || 0,
        bottom: isAutoV ? 0 : parseFloat(cs.marginBottom) || 0,
        left: isAutoH ? 0 : parseFloat(cs.marginLeft) || 0,
      };
      const pRaw: SpacingBox = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };

      // Override with active drag value so zones update in real-time during drag
      if (activeDrag) {
        const dragMap: Record<string, [SpacingBox, keyof SpacingBox]> = {
          mt: [mRaw, "top"], mr: [mRaw, "right"], mb: [mRaw, "bottom"], ml: [mRaw, "left"],
          pt: [pRaw, "top"], pr: [pRaw, "right"], pb: [pRaw, "bottom"], pl: [pRaw, "left"],
        };
        const entry = dragMap[activeDrag.prefix];
        if (entry) entry[0][entry[1]] = activeDrag.value;
      }

      // Scaled values (for zone positioning on screen)
      const m: SpacingBox = { top: sz(mRaw.top), right: sz(mRaw.right), bottom: sz(mRaw.bottom), left: sz(mRaw.left) };
      const p: SpacingBox = { top: sz(pRaw.top), right: sz(pRaw.right), bottom: sz(pRaw.bottom), left: sz(pRaw.left) };

      // ── Margin zones ──
      ctx.save();
      if (m.top > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left, r.top - m.top, r.width, m.top); drawDashedEdges(ctx, r.left, r.top - m.top, r.width, m.top, COL.marginDash, { bottom: false }); }
      if (m.bottom > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left, r.top + r.height, r.width, m.bottom); drawDashedEdges(ctx, r.left, r.top + r.height, r.width, m.bottom, COL.marginDash, { top: false }); }
      if (m.left > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left - m.left, r.top, m.left, r.height); drawDashedEdges(ctx, r.left - m.left, r.top, m.left, r.height, COL.marginDash, { right: false }); }
      if (m.right > 0) { ctx.fillStyle = COL.marginBg; ctx.fillRect(r.left + r.width, r.top, m.right, r.height); drawDashedEdges(ctx, r.left + r.width, r.top, m.right, r.height, COL.marginDash, { left: false }); }
      ctx.restore();

      // ── Padding zones ──
      ctx.save();
      if (p.top > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left, r.top, r.width, p.top); drawDashedLine(ctx, r.left, r.top + p.top, r.left + r.width, r.top + p.top, COL.paddingDash); }
      if (p.bottom > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left, r.top + r.height - p.bottom, r.width, p.bottom); drawDashedLine(ctx, r.left, r.top + r.height - p.bottom, r.left + r.width, r.top + r.height - p.bottom, COL.paddingDash); }
      if (p.left > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left, r.top + p.top, p.left, r.height - p.top - p.bottom); drawDashedLine(ctx, r.left + p.left, r.top + p.top, r.left + p.left, r.top + r.height - p.bottom, COL.paddingDash); }
      if (p.right > 0) { ctx.fillStyle = COL.paddingBg; ctx.fillRect(r.left + r.width - p.right, r.top + p.top, p.right, r.height - p.top - p.bottom); drawDashedLine(ctx, r.left + r.width - p.right, r.top + p.top, r.left + r.width - p.right, r.top + r.height - p.bottom, COL.paddingDash); }
      ctx.restore();

      // ── Gap zones ──
      const display = cs.display;
      if (display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid") {
        const rg = parseFloat(cs.rowGap) || 0;
        const cg = parseFloat(cs.columnGap) || 0;
        if (rg > 0 || cg > 0) {
          const children = Array.from(el.children).filter(c => c instanceof HTMLElement && getCachedStyle(c).position !== "absolute") as HTMLElement[];
          const childRects = children.map(c => {
            const cr = c.getBoundingClientRect();
            return { left: cr.left * ifs + ox, top: cr.top * ifs + oy, right: cr.right * ifs + ox, bottom: cr.bottom * ifs + oy, width: cr.width * ifs, height: cr.height * ifs };
          });
          const seen = new Set<string>();
          for (let i = 0; i < childRects.length; i++) {
            for (let j = i + 1; j < childRects.length; j++) {
              const a = childRects[i], b = childRects[j];
              if (cg > 0 && b.left > a.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1) {
                const gL = a.right, gW = b.left - a.right, key = `cg-${Math.round(gL)}-${Math.round(a.top)}`;
                if (gW > 1 && !seen.has(key)) { seen.add(key); const gT = Math.max(a.top, b.top), gB = Math.min(a.bottom, b.bottom);
                  ctx.save(); ctx.fillStyle = COL.purpleBg; ctx.fillRect(gL, gT, gW, gB - gT);
                  drawDashedLine(ctx, gL, gT, gL, gB, COL.purple); drawDashedLine(ctx, gL + gW, gT, gL + gW, gB, COL.purple); ctx.restore();
                  // BUG FIX: gW is screen-space, divide by zoom to show CSS value
                  drawValueBadge(ctx, Math.round(gW / zoomScale), COL.purple, gL + gW / 2, (gT + gB) / 2);
                }
              }
              if (rg > 0 && b.top > a.bottom - 1 && a.right > b.left + 1 && a.left < b.right - 1) {
                const gT = a.bottom, gH = b.top - a.bottom, key = `rg-${Math.round(a.left)}-${Math.round(gT)}`;
                if (gH > 1 && !seen.has(key)) { seen.add(key); const gL = Math.max(a.left, b.left), gR = Math.min(a.right, b.right);
                  ctx.save(); ctx.fillStyle = COL.purpleBg; ctx.fillRect(gL, gT, gR - gL, gH);
                  drawDashedLine(ctx, gL, gT, gR, gT, COL.purple); drawDashedLine(ctx, gL, gT + gH, gR, gT + gH, COL.purple); ctx.restore();
                  // BUG FIX: gH is screen-space, divide by zoom to show CSS value
                  drawValueBadge(ctx, Math.round(gH / zoomScale), COL.purple, (gL + gR) / 2, gT + gH / 2);
                }
              }
            }
          }
        }
      }

      // ── Selection outline ──
      ctx.save();
      ctx.strokeStyle = COL.blue;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      roundRect(ctx, r.left, r.top, r.width, r.height, 2);
      ctx.stroke();
      ctx.restore();

      // ── Combined tag + dims badge (show CSS dimensions, not screen) ──
      let label = selectedElement.tagName;
      const cssW = parseFloat(cs.width) || r.width;
      const cssH = parseFloat(cs.height) || r.height;
      const dimsTxt = `${Math.round(cssW)} × ${Math.round(cssH)}`;
      const combined = `${label}  ${dimsTxt}`;
      const tagBw = drawLabelBadge(ctx, combined, r.left, r.top - 22, COL.blue);
      tagHit = { x: r.left, y: r.top - 22, w: tagBw, h: 18 };

      // ── Component badge — show component name if element is inside a component file ──
      if (paintCtx?.components?.length && selectedElement.source) {
        const srcFile = selectedElement.source.filePath;
        const comp = paintCtx.components.find(c => srcFile.endsWith(c.filePath) || c.filePath.endsWith(srcFile));
        if (comp) {
          const compLabel = `⚡ ${comp.name}`;
          drawLabelBadge(ctx, compLabel, r.left + tagBw + 4, r.top - 22, COL.purple);
        }
      }

      // ── Change indicator dot — orange dot on top-right if element was modified ──
      if (paintCtx?.changedFiles?.size && selectedElement.source) {
        const key = `${selectedElement.source.filePath}:${selectedElement.source.line}`;
        if (paintCtx.changedFiles.has(key)) {
          ctx.save();
          ctx.fillStyle = COL.margin;
          ctx.beginPath();
          ctx.arc(r.left + r.width - 2, r.top - 2, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 7px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("✎", r.left + r.width - 2, r.top - 2);
          ctx.restore();
        }
      }

      // ── Spacing badges ──
      // Always register hit areas so dragging works at any zoom level.
      // Text badge only draws when zoomed in enough to be readable.
      const drawSpacing = (cssVal: number, screenVal: number, color: string, x: number, y: number, type: "margin" | "padding", side: "top" | "right" | "bottom" | "left") => {
        if (cssVal <= 0) return;
        const prefix = SIDE_PREFIX[type][side];
        // Hit area — always present for dragging
        const hitSize = Math.max(14, screenVal);
        badges.push({ x: x - hitSize / 2, y: y - 7, w: hitSize, h: 14, type, side, value: cssVal, prefix });
        // Text badge — only when zoomed in enough to be readable and not overlap notches
        if (screenVal >= 24 && zoomScale >= 0.5) {
          drawValueBadge(ctx, Math.round(cssVal), color, x, y);
        }
      };

      drawSpacing(mRaw.top, m.top, COL.margin, r.left + r.width / 2, r.top - m.top / 2, "margin", "top");
      drawSpacing(mRaw.bottom, m.bottom, COL.margin, r.left + r.width / 2, r.top + r.height + m.bottom / 2, "margin", "bottom");
      drawSpacing(mRaw.left, m.left, COL.margin, r.left - m.left / 2, r.top + r.height / 2, "margin", "left");
      drawSpacing(mRaw.right, m.right, COL.margin, r.left + r.width + m.right / 2, r.top + r.height / 2, "margin", "right");
      drawSpacing(pRaw.top, p.top, COL.padding, r.left + r.width / 2, r.top + p.top / 2, "padding", "top");
      drawSpacing(pRaw.bottom, p.bottom, COL.padding, r.left + r.width / 2, r.top + r.height - p.bottom / 2, "padding", "bottom");
      drawSpacing(pRaw.left, p.left, COL.padding, r.left + p.left / 2, r.top + r.height / 2, "padding", "left");
      drawSpacing(pRaw.right, p.right, COL.padding, r.left + r.width - p.right / 2, r.top + r.height / 2, "padding", "right");

      // ── Drag-from-zero handles ──
      // When margin or padding is 0 on a side, add thin invisible hit zones along the edge
      // so users can drag from zero to add spacing.
      const EDGE_THICKNESS = 12;
      const CORNER_INSET = 20; // keep corners clear for resize handles
      const addZeroHandle = (cssVal: number, type: "margin" | "padding", side: "top" | "right" | "bottom" | "left") => {
        if (cssVal > 0) return;
        const prefix = SIDE_PREFIX[type][side];
        const isVert = side === "top" || side === "bottom";
        let hx: number, hy: number, hw: number, hh: number;
        if (type === "padding") {
          if (side === "top") { hx = r.left + CORNER_INSET; hy = r.top; hw = r.width - CORNER_INSET * 2; hh = EDGE_THICKNESS; }
          else if (side === "bottom") { hx = r.left + CORNER_INSET; hy = r.top + r.height - EDGE_THICKNESS; hw = r.width - CORNER_INSET * 2; hh = EDGE_THICKNESS; }
          else if (side === "left") { hx = r.left; hy = r.top + CORNER_INSET; hw = EDGE_THICKNESS; hh = r.height - CORNER_INSET * 2; }
          else { hx = r.left + r.width - EDGE_THICKNESS; hy = r.top + CORNER_INSET; hw = EDGE_THICKNESS; hh = r.height - CORNER_INSET * 2; }
        } else {
          if (side === "top") { hx = r.left + CORNER_INSET; hy = r.top - EDGE_THICKNESS; hw = r.width - CORNER_INSET * 2; hh = EDGE_THICKNESS; }
          else if (side === "bottom") { hx = r.left + CORNER_INSET; hy = r.top + r.height; hw = r.width - CORNER_INSET * 2; hh = EDGE_THICKNESS; }
          else if (side === "left") { hx = r.left - EDGE_THICKNESS; hy = r.top + CORNER_INSET; hw = EDGE_THICKNESS; hh = r.height - CORNER_INSET * 2; }
          else { hx = r.left + r.width; hy = r.top + CORNER_INSET; hw = EDGE_THICKNESS; hh = r.height - CORNER_INSET * 2; }
        }
        // Skip if element too small for inset
        if (hw <= 0 || hh <= 0) return;
        badges.push({ x: hx, y: hy, w: hw, h: hh, type, side, value: 0, prefix });

        // Only draw dashed line indicator when mouse is hovering near the edge
        const hoverPad = 12;
        const isHovered = mousePos &&
          mousePos.x >= hx - hoverPad && mousePos.x <= hx + hw + hoverPad &&
          mousePos.y >= hy - hoverPad && mousePos.y <= hy + hh + hoverPad;

        if (isHovered) {
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = type === "padding" ? COL.paddingDash : COL.marginDash;
          ctx.lineWidth = 1.5;
          if (side === "top" || side === "bottom") {
            const ly = side === "top" ? r.top : r.top + r.height;
            ctx.beginPath(); ctx.moveTo(r.left, ly); ctx.lineTo(r.left + r.width, ly); ctx.stroke();
          } else {
            const lx = side === "left" ? r.left : r.left + r.width;
            ctx.beginPath(); ctx.moveTo(lx, r.top); ctx.lineTo(lx, r.top + r.height); ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
      };

      // Add zero handles for both margin and padding
      addZeroHandle(mRaw.top, "margin", "top");
      addZeroHandle(mRaw.bottom, "margin", "bottom");
      addZeroHandle(mRaw.left, "margin", "left");
      addZeroHandle(mRaw.right, "margin", "right");
      addZeroHandle(pRaw.top, "padding", "top");
      addZeroHandle(pRaw.bottom, "padding", "bottom");
      addZeroHandle(pRaw.left, "padding", "left");
      addZeroHandle(pRaw.right, "padding", "right");

      // ── Visual notches for spacing values ──
      // Hover detection helper
      const isNearMouse = (x: number, y: number, radius: number) =>
        mousePos && Math.abs(mousePos.x - x) < radius && Math.abs(mousePos.y - y) < radius;
      const midX = r.left + r.width / 2;
      const midY = r.top + r.height / 2;

      // Padding edge handles (non-zero values — green pills)
      if (p.top > 0) drawEdgeHandle(ctx, midX, r.top + p.top / 2, false, COL.padding, pRaw.top, !!isNearMouse(midX, r.top + p.top / 2, 20), zoomScale);
      if (p.bottom > 0) drawEdgeHandle(ctx, midX, r.top + r.height - p.bottom / 2, false, COL.padding, pRaw.bottom, !!isNearMouse(midX, r.top + r.height - p.bottom / 2, 20), zoomScale);
      if (p.left > 0) drawEdgeHandle(ctx, r.left + p.left / 2, midY, true, COL.padding, pRaw.left, !!isNearMouse(r.left + p.left / 2, midY, 20), zoomScale);
      if (p.right > 0) drawEdgeHandle(ctx, r.left + r.width - p.right / 2, midY, true, COL.padding, pRaw.right, !!isNearMouse(r.left + r.width - p.right / 2, midY, 20), zoomScale);

      // Margin edge handles (non-zero values — orange pills)
      if (m.top > 0) drawEdgeHandle(ctx, midX, r.top - m.top / 2, false, COL.margin, mRaw.top, !!isNearMouse(midX, r.top - m.top / 2, 20), zoomScale);
      if (m.bottom > 0) drawEdgeHandle(ctx, midX, r.top + r.height + m.bottom / 2, false, COL.margin, mRaw.bottom, !!isNearMouse(midX, r.top + r.height + m.bottom / 2, 20), zoomScale);
      if (m.left > 0) drawEdgeHandle(ctx, r.left - m.left / 2, midY, true, COL.margin, mRaw.left, !!isNearMouse(r.left - m.left / 2, midY, 20), zoomScale);
      if (m.right > 0) drawEdgeHandle(ctx, r.left + r.width + m.right / 2, midY, true, COL.margin, mRaw.right, !!isNearMouse(r.left + r.width + m.right / 2, midY, 20), zoomScale);

      // Zero-value notches — full edge highlight on hover, small dash by default
      // Hover detection uses the full edge zone (EDGE_THICKNESS), not just the notch center
      const isEdgeHovered = (side: string, type: string) => {
        if (!mousePos) return false;
        const mx = mousePos.x, my = mousePos.y;
        const E = EDGE_THICKNESS + 4; // slightly larger than hit zone for visual feedback
        if (type === "margin") {
          if (side === "top") return my >= r.top - E && my <= r.top && mx >= r.left && mx <= r.left + r.width;
          if (side === "bottom") return my >= r.top + r.height && my <= r.top + r.height + E && mx >= r.left && mx <= r.left + r.width;
          if (side === "left") return mx >= r.left - E && mx <= r.left && my >= r.top && my <= r.top + r.height;
          if (side === "right") return mx >= r.left + r.width && mx <= r.left + r.width + E && my >= r.top && my <= r.top + r.height;
        } else {
          if (side === "top") return my >= r.top && my <= r.top + E && mx >= r.left && mx <= r.left + r.width;
          if (side === "bottom") return my >= r.top + r.height - E && my <= r.top + r.height && mx >= r.left && mx <= r.left + r.width;
          if (side === "left") return mx >= r.left && mx <= r.left + E && my >= r.top && my <= r.top + r.height;
          if (side === "right") return mx >= r.left + r.width - E && mx <= r.left + r.width && my >= r.top && my <= r.top + r.height;
        }
        return false;
      };

      // Margin zero notches (outside edges)
      if (m.top <= 0) drawZeroNotch(ctx, midX, r.top - 4, false, COL.margin, isEdgeHovered("top", "margin"), zoomScale, r.width, r.left);
      if (m.bottom <= 0) drawZeroNotch(ctx, midX, r.top + r.height + 4, false, COL.margin, isEdgeHovered("bottom", "margin"), zoomScale, r.width, r.left);
      if (m.left <= 0) drawZeroNotch(ctx, r.left - 4, midY, true, COL.margin, isEdgeHovered("left", "margin"), zoomScale, r.height, r.top);
      if (m.right <= 0) drawZeroNotch(ctx, r.left + r.width + 4, midY, true, COL.margin, isEdgeHovered("right", "margin"), zoomScale, r.height, r.top);
      // Padding zero notches (inside edges)
      if (p.top <= 0) drawZeroNotch(ctx, midX, r.top + 4, false, COL.padding, isEdgeHovered("top", "padding"), zoomScale, r.width, r.left);
      if (p.bottom <= 0) drawZeroNotch(ctx, midX, r.top + r.height - 4, false, COL.padding, isEdgeHovered("bottom", "padding"), zoomScale, r.width, r.left);
      if (p.left <= 0) drawZeroNotch(ctx, r.left + 4, midY, true, COL.padding, isEdgeHovered("left", "padding"), zoomScale, r.height, r.top);
      if (p.right <= 0) drawZeroNotch(ctx, r.left + r.width - 4, midY, true, COL.padding, isEdgeHovered("right", "padding"), zoomScale, r.height, r.top);

      // Resize grip at bottom-right corner of the element (inside the border)
      drawResizeGrip(ctx, r.left + r.width - 2, r.top + r.height - 2, COL.blue);

      // Update dirty-check cache
      prevRectStr = `${rawRect.left},${rawRect.top},${rawRect.width},${rawRect.height}`;
    }
  }

  // Update dirty-check cache
  prevSelectedEl = selectedElement?.element ?? null;
  prevHoveredEl = hoveredElement;
  prevZoom = zoomScale;
  prevPanX = viewport.panX;
  prevPanY = viewport.panY;
  lastPaintTime = performance.now();

  return { badges, tagHit };
}
