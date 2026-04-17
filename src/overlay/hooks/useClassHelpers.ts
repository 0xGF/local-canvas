import { useMemo, useCallback, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useReadonlyStyleStore } from "../stores/readonly-style-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { sourceStyleHasProperty, camelToKebabCss } from "../utils/inline-style-source.js";
import {
  getBreakpointPrefix,
  hasResponsivePrefix,
  RESPONSIVE_PREFIX_RE,
} from "../../shared/breakpoints.js";
import type { Mutation } from "../../server/types.js";

// Utility prefixes we know a 1:1 CSS property for — so we can redirect the
// edit through modify-style when the element has that property set inline.
// Anything not in this map stays on the class path.
const PREFIX_TO_INLINE_STYLE: Record<string, string> = {
  mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
  pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
  w: "width", h: "height",
  gap: "gap",
};

/** Tailwind spacing scale: each unit is 0.25rem (4px). `value` is a Tailwind
 * scale step (e.g. "4" for 16px) or a bracket value like "[12px]".
 * Returns a CSS-valid length string, or null if we can't interpret it. */
function tailwindScaleToPx(value: string): string | null {
  if (!value) return "";
  const bracket = value.match(/^\[(.+)\]$/);
  if (bracket) return bracket[1];
  const n = Number(value);
  if (Number.isFinite(n)) return `${n * 4}px`;
  return null;
}

/**
 * Shared class manipulation helpers for PropertiesPanel sections.
 * Extracts all breakpoint-aware class read/write logic so each section
 * can use it without re-creating these functions.
 */
export function useClassHelpers() {
  const sel = useEditorStore((s) => s.selectedElement);
  const incrementPending = useEditorStore((s) => s.incrementPending);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const { sendMutation } = useWebSocket();

  const markReadonly = useReadonlyStyleStore((s) => s.mark);

  const trackedSendMutation = useCallback(
    async (mutation: Mutation) => {
      const result = await sendMutation(mutation);
      incrementPending();
      // Surface modify-style failures so the panel can mark the property
      // read-only (e.g. style={someVar} or template-literal values).
      if (
        mutation.type === "modify-style" &&
        result &&
        "result" in result &&
        !result.result.success
      ) {
        markReadonly(
          mutation.source.filePath,
          mutation.source.line,
          mutation.property,
          result.result.error ?? "inline style not mutable",
        );
      }
      return result;
    },
    [sendMutation, incrementPending, markReadonly]
  );

  // Debounced mutation sender — prevents 30 mutations when scrolling dropdowns
  const debounceTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debouncedMutation = useCallback(
    (key: string, mutation: Mutation, delay = 300) => {
      if (debounceTimerRef.current[key]) {
        clearTimeout(debounceTimerRef.current[key]);
      }
      debounceTimerRef.current[key] = setTimeout(() => {
        trackedSendMutation(mutation);
        delete debounceTimerRef.current[key];
      }, delay);
    },
    [trackedSendMutation]
  );

  // Read classes from live DOM when available — the store snapshot can be stale
  const classes = useMemo(() => {
    const el = sel?.element;
    const raw = el?.isConnected
      ? (typeof el.className === "string" ? el.className : "")
      : (sel?.className || "");
    return raw.split(/\s+/).filter(Boolean);
  }, [sel?.className, sel?.element]);

  const bpPrefix = useMemo(() => getBreakpointPrefix(breakpoint), [breakpoint]);

  const prefixCls = useCallback((cls: string) => {
    if (!cls || !bpPrefix) return cls;
    if (hasResponsivePrefix(cls)) return cls;
    return `${bpPrefix}:${cls}`;
  }, [bpPrefix]);

  const stripBpPrefix = useCallback((cls: string) => cls.replace(RESPONSIVE_PREFIX_RE, ""), []);

  const resolveClass = useCallback((bare: string): string | undefined => {
    if (bpPrefix) {
      const prefixed = `${bpPrefix}:${bare}`;
      if (classes.includes(prefixed)) return prefixed;
    }
    if (classes.includes(bare)) return bare;
    return undefined;
  }, [classes, bpPrefix]);

  const findCls = useCallback((candidates: string[]): string => {
    if (bpPrefix) {
      for (const c of candidates) {
        if (classes.includes(`${bpPrefix}:${c}`)) return c;
      }
    }
    for (const c of candidates) {
      if (classes.includes(c)) return c;
    }
    return "";
  }, [classes, bpPrefix]);

  const findPrefixedCls = useCallback((prefix: string, opts: string[]): string | undefined => {
    const candidates = opts.map(o => `${prefix}${o}`);
    if (bpPrefix) {
      for (const c of candidates) {
        if (classes.includes(`${bpPrefix}:${c}`)) return c;
      }
    }
    for (const c of candidates) {
      if (classes.includes(c)) return c;
    }
    return undefined;
  }, [classes, bpPrefix]);

  const get = useCallback((prefix: string) => {
    const target = bpPrefix ? `${bpPrefix}:${prefix}` : prefix;
    let c = classes.find(c => c === target || c.startsWith(target + "-"));
    if (!c) {
      c = classes.find(c => c === prefix || c.startsWith(prefix + "-"));
    }
    if (!c) return "";
    const bare = stripBpPrefix(c);
    return bare === prefix ? "" : bare.slice(prefix.length + 1);
  }, [classes, bpPrefix, stripBpPrefix]);

  const set = useCallback((prefix: string, value: string, isExact = false, immediate = false) => {
    if (!sel?.source) return;

    // If the target property is already set inline and we know its CSS name,
    // route through modify-style. A utility class would lose against inline
    // style's specificity, so modify-class would be silently ineffective.
    // We read the raw `style` attribute, not `el.style.<prop>`, so drag
    // previews on other handlers don't make us think the source has inline
    // state it doesn't really have.
    const inlineKey = !isExact ? PREFIX_TO_INLINE_STYLE[prefix] : undefined;
    if (inlineKey && sel.element && sourceStyleHasProperty(sel.element, camelToKebabCss(inlineKey))) {
      const pxValue = tailwindScaleToPx(value);
      const mutation: Mutation = {
        type: "modify-style",
        source: sel.source,
        property: inlineKey,
        value: pxValue ?? "",
      };
      if (immediate) trackedSendMutation(mutation);
      else debouncedMutation(`style:${inlineKey}`, mutation);
      return;
    }

    const target = bpPrefix ? `${bpPrefix}:${prefix}` : prefix;
    let old = classes.find(c => c === target || c.startsWith(target + "-"));
    if (!old) old = classes.find(c => c === prefix || c.startsWith(prefix + "-"));
    const bare = isExact ? value : (value ? `${prefix}-${value}` : "");
    const next = bare ? prefixCls(bare) : "";
    const mutation = {
      type: "modify-class" as const,
      source: sel.source,
      remove: old ? [old] : undefined,
      add: next ? [next] : undefined,
    };
    if (immediate) {
      trackedSendMutation(mutation);
    } else {
      debouncedMutation(prefix, mutation);
    }
  }, [sel, classes, debouncedMutation, trackedSendMutation, bpPrefix, prefixCls]);

  const has = useCallback((cls: string) => {
    return classes.includes(cls) || (bpPrefix && classes.includes(`${bpPrefix}:${cls}`));
  }, [classes, bpPrefix]);

  const actual = useCallback((bare: string): string | undefined => {
    if (bpPrefix) {
      const prefixed = `${bpPrefix}:${bare}`;
      if (classes.includes(prefixed)) return prefixed;
    }
    return classes.includes(bare) ? bare : undefined;
  }, [classes, bpPrefix]);

  const sendPrefixed = useCallback((mutation: Extract<Mutation, { type: "modify-class" }>) => {
    const prefixedAdd = mutation.add?.map((c) => prefixCls(c));
    const resolvedRemove = mutation.remove?.map((c) => {
      if (hasResponsivePrefix(c)) return c;
      return actual(c) || c;
    });
    return trackedSendMutation({
      ...mutation,
      add: prefixedAdd,
      remove: resolvedRemove,
    });
  }, [trackedSendMutation, prefixCls, actual]);

  const toggleCls = useCallback(async (cls: string) => {
    if (!sel?.source) return;
    const prefixed = prefixCls(cls);
    const exists = classes.includes(cls) || classes.includes(prefixed);
    await trackedSendMutation({
      type: "modify-class",
      source: sel.source,
      [exists ? "remove" : "add"]: [exists ? (classes.includes(prefixed) ? prefixed : cls) : prefixed],
    });
  }, [sel, classes, trackedSendMutation, prefixCls]);

  return useMemo(() => ({
    sel, classes, bpPrefix, breakpoint,
    prefixCls, stripBpPrefix, resolveClass,
    findCls, findPrefixedCls,
    get, set, has, actual,
    sendPrefixed, toggleCls,
    trackedSendMutation, debouncedMutation,
  }), [
    sel, classes, bpPrefix, breakpoint,
    prefixCls, stripBpPrefix, resolveClass,
    findCls, findPrefixedCls,
    get, set, has, actual,
    sendPrefixed, toggleCls,
    trackedSendMutation, debouncedMutation,
  ]);
}
