import { useEffect, useMemo, useState } from "react";
import type { SourceLocation } from "../../core/source-map/types.js";
import type { SelectedElement } from "../stores/editor-store.js";
import { parseColor, hsvaToRgba, rgbaToHex } from "../lib/color.js";

const COLOR_CONTENT = /^(#|rgb|rgba|hsl|hsla|lch|color\(|var\()/i;

export interface ColorOccurrence {
  element: HTMLElement;
  source: SourceLocation;
  /** Class exactly as it appears on the element, e.g. `md:hover:bg-[#abc]`. */
  fullClass: string;
  /** Leading variant stack (responsive + state), empty when none. */
  variant: string;
  /** Bare utility prefix before the bracket, e.g. `bg`, `border-t`, `from`. */
  prefix: string;
  /** Raw contents of the bracket, e.g. `#abc` or `rgba(0,0,0,0.5)`. */
  content: string;
}

export interface ColorGroup {
  /** Stable key built from normalized hex + alpha. */
  key: string;
  /** Display CSS (hex when opaque, rgba otherwise). */
  colorCss: string;
  /** Uppercase hex without leading `#`. */
  hex: string;
  /** 0..1. */
  alpha: number;
  occurrences: ColorOccurrence[];
}

function getOwnSource(el: HTMLElement): SourceLocation | null {
  const file = el.dataset.sourceFile;
  const line = el.dataset.sourceLine;
  if (file && line) {
    const lineN = parseInt(line, 10);
    if (!Number.isNaN(lineN)) {
      return {
        filePath: file,
        line: lineN,
        column: el.dataset.sourceCol ? parseInt(el.dataset.sourceCol, 10) : undefined,
      };
    }
  }
  return null;
}

interface ParsedClass { variant: string; prefix: string; content: string; }

function parseBracketClass(cls: string): ParsedClass | null {
  const idx = cls.lastIndexOf("-[");
  if (idx < 0 || !cls.endsWith("]")) return null;
  const content = cls.slice(idx + 2, -1);
  const fullPrefix = cls.slice(0, idx);
  const colonIdx = fullPrefix.lastIndexOf(":");
  const variant = colonIdx >= 0 ? fullPrefix.slice(0, colonIdx + 1) : "";
  const prefix = colonIdx >= 0 ? fullPrefix.slice(colonIdx + 1) : fullPrefix;
  if (!prefix) return null;
  return { variant, prefix, content };
}

interface Normalized { key: string; css: string; hex: string; alpha: number; }

function normalize(content: string): Normalized | null {
  const hsva = parseColor(content);
  if (!hsva) return null;
  const rgba = hsvaToRgba(hsva);
  const hex = rgbaToHex(rgba).replace(/^#/, "").toUpperCase();
  const alphaRounded = Math.round(hsva.a * 1000) / 1000;
  const alphaKey = Math.round(hsva.a * 100); // group by whole-percent alpha
  return {
    key: `${hex}-${alphaKey}`,
    css: alphaRounded >= 1
      ? `#${hex}`
      : `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${alphaRounded})`,
    hex,
    alpha: alphaRounded,
  };
}

export function collectSelectionColors(root: HTMLElement): ColorGroup[] {
  const map = new Map<string, ColorGroup>();

  function visit(el: Element) {
    // Cross-realm safety: iframe elements aren't instanceof HTMLElement in the
    // parent realm. Check nodeType and treat as HTMLElement.
    if (el.nodeType !== 1) return;
    const html = el as HTMLElement;
    const raw = typeof html.className === "string"
      ? html.className
      : (html.getAttribute?.("class") ?? "");
    if (raw) {
      const source = getOwnSource(html);
      if (source) {
        for (const cls of raw.split(/\s+/)) {
          if (!cls) continue;
          const parsed = parseBracketClass(cls);
          if (!parsed) continue;
          if (!COLOR_CONTENT.test(parsed.content)) continue;
          const n = normalize(parsed.content);
          if (!n) continue;
          const occ: ColorOccurrence = {
            element: html,
            source,
            fullClass: cls,
            variant: parsed.variant,
            prefix: parsed.prefix,
            content: parsed.content,
          };
          let group = map.get(n.key);
          if (!group) {
            group = { key: n.key, colorCss: n.css, hex: n.hex, alpha: n.alpha, occurrences: [] };
            map.set(n.key, group);
          }
          group.occurrences.push(occ);
        }
      }
    }
    for (const child of Array.from(html.children)) visit(child);
  }

  visit(root);

  return Array.from(map.values()).sort((a, b) => {
    if (b.occurrences.length !== a.occurrences.length) {
      return b.occurrences.length - a.occurrences.length;
    }
    return a.hex.localeCompare(b.hex);
  });
}

/**
 * Scan the selected element's subtree (including itself) for bracketed color
 * utility classes (e.g. `bg-[#fff]`, `text-[rgba(...)]`), grouped by
 * normalized color. Re-scans on subtree class/childList changes.
 */
export function useSelectionColors(sel: SelectedElement | null): ColorGroup[] {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const root = sel?.element;
    if (!root || !root.isConnected) return;
    const mo = new MutationObserver(() => setTick(t => t + 1));
    mo.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
      subtree: true,
      childList: true,
    });
    return () => mo.disconnect();
  }, [sel?.element]);

  return useMemo(() => {
    void tick;
    const root = sel?.element;
    if (!root || !root.isConnected) return [];
    return collectSelectionColors(root);
  }, [sel?.element, tick]);
}
