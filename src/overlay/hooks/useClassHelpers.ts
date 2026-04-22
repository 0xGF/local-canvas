import { useMemo, useCallback, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useReadonlyStyleStore } from "../stores/readonly-style-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { sourceStyleHasProperty, camelToKebabCss } from "../utils/inline-style-source.js";
import { setStyleProp } from "../utils/dom-style.js";
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

// Prefix → CSS property (or list) for anti-flash optimistic inline preview.
// Applied synchronously so the user sees the new value immediately; cleared
// once the class mutation actually lands on the DOM (via HMR). Covers the
// prefixes where `value` decodes cleanly to a CSS length — for color /
// keyword-only prefixes we'd need lookup tables, so those stay on the
// slower HMR-only path for now.
const PREFIX_TO_PREVIEW: Record<string, string | string[]> = {
  mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
  mx: ["marginLeft", "marginRight"],
  my: ["marginTop", "marginBottom"],
  m: "margin",
  pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
  px: ["paddingLeft", "paddingRight"],
  py: ["paddingTop", "paddingBottom"],
  p: "padding",
  w: "width", h: "height",
  "min-w": "minWidth", "max-w": "maxWidth",
  "min-h": "minHeight", "max-h": "maxHeight",
  gap: "gap", "gap-x": "columnGap", "gap-y": "rowGap",
  rounded: "borderRadius",
  "rounded-tl": "borderTopLeftRadius",
  "rounded-tr": "borderTopRightRadius",
  "rounded-bl": "borderBottomLeftRadius",
  "rounded-br": "borderBottomRightRadius",
  opacity: "opacity",
  z: "zIndex",
  order: "order",
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

// Decode a Tailwind class suffix to a concrete CSS value for the given prefix.
// Returns null when we can't confidently represent the value — in which case
// we skip the inline preview (the element will just wait for HMR).
function decodePreviewValue(prefix: string, value: string): string | null {
  // Clearing a class → reset to the CSS default for that property
  if (!value) {
    if (prefix === "opacity") return "1";
    if (prefix === "z" || prefix === "order") return "auto";
    if (/^rounded(-(tl|tr|bl|br))?$/.test(prefix)) return "0px";
    if (/^(w|h|min-w|max-w|min-h|max-h)$/.test(prefix)) return "auto";
    return "0px"; // spacing
  }
  if (prefix === "opacity") {
    const n = Number(value);
    return Number.isFinite(n) ? String(n / 100) : null;
  }
  if (prefix === "z" || prefix === "order") {
    const bracket = value.match(/^\[(.+)\]$/);
    if (bracket) return bracket[1];
    return Number.isFinite(Number(value)) ? value : null;
  }
  if (/^rounded(-(tl|tr|bl|br))?$/.test(prefix)) {
    const bracket = value.match(/^\[(.+)\]$/);
    if (bracket) return bracket[1];
    const radius: Record<string, string> = {
      none: "0px", sm: "2px", "": "4px", md: "6px", lg: "8px",
      xl: "12px", "2xl": "16px", "3xl": "24px", full: "9999px",
    };
    return radius[value] ?? null;
  }
  // Spacing / sizing: bracket value, numeric scale, or sizing keyword
  const bracket = value.match(/^\[(.+)\]$/);
  if (bracket) return bracket[1];
  const n = Number(value);
  if (Number.isFinite(n)) return `${n * 4}px`;
  const sizeKeywords: Record<string, string> = {
    auto: "auto", full: "100%", screen: /^(h|min-h|max-h)$/.test(prefix) ? "100vh" : "100vw",
    min: "min-content", max: "max-content", fit: "fit-content",
    px: "1px",
  };
  return sizeKeywords[value] ?? null;
}

/** Apply an optimistic inline style matching the incoming class change, then
 * clear it only after the class attribute actually updates on the element
 * (via HMR). This prevents the element from flashing back to its pre-edit
 * appearance while the mutation round-trips through the file system. */
function applyInlinePreview(el: HTMLElement, prefix: string, value: string): void {
  const target = PREFIX_TO_PREVIEW[prefix];
  if (!target) return;
  const decoded = decodePreviewValue(prefix, value);
  if (decoded === null) return;
  const props = Array.isArray(target) ? target : [target];
  for (const p of props) setStyleProp(el, p, decoded);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    for (const p of props) setStyleProp(el, p, "");
    observer.disconnect();
    clearTimeout(fallback);
  };
  const observer = new MutationObserver(finish);
  observer.observe(el, { attributes: true, attributeFilter: ["class"] });
  const fallback = setTimeout(finish, 5000);
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

    // Anti-flash: write the new value as an inline style immediately so the
    // element shows the edit without waiting for the file-write → HMR round
    // trip. Cleared automatically once the class attribute actually updates.
    // Only for non-exact edits with a known prefix→CSS mapping.
    if (!isExact && sel.element) {
      applyInlinePreview(sel.element, prefix, value);
    }

    const target = bpPrefix ? `${bpPrefix}:${prefix}` : prefix;
    let old = classes.find(c => c === target || c.startsWith(target + "-"));
    // Fall back to the bare (base-breakpoint) class only when we're editing at
    // the base breakpoint. At a non-base breakpoint, removing the bare form
    // would silently wipe the base value — leaving every smaller breakpoint
    // without its intended class. The add path below still emits the prefixed
    // form, so the new value lands only at the active breakpoint.
    if (!old && !bpPrefix) old = classes.find(c => c === prefix || c.startsWith(prefix + "-"));
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

  // Rewrite a modify-class mutation so its add/remove lists target only the
  // active breakpoint. Callers often hand us a list of every variant of a
  // class on the element (e.g. `border`, `md:border-2`, `2xl:border-4`) to
  // "clear and replace" — but clearing across breakpoints while editing one
  // is the bug: editing at 2xl silently strips the base and md values too.
  // Drop entries that target a different breakpoint than the active one so
  // each breakpoint's class is edited independently.
  const scopeToBreakpoint = useCallback(
    (mutation: Extract<Mutation, { type: "modify-class" }>): Extract<Mutation, { type: "modify-class" }> => {
      const prefixedAdd = mutation.add?.map((c) => prefixCls(c));
      const resolvedRemove = mutation.remove
        ?.map((c) => {
          const m = c.match(RESPONSIVE_PREFIX_RE);
          if (m) {
            const classBp = m[0].slice(0, -1);
            return classBp === bpPrefix ? c : null;
          }
          if (bpPrefix) {
            const prefixed = `${bpPrefix}:${c}`;
            return classes.includes(prefixed) ? prefixed : null;
          }
          return classes.includes(c) ? c : null;
        })
        .filter((c): c is string => c !== null);
      return {
        ...mutation,
        add: prefixedAdd,
        remove: resolvedRemove && resolvedRemove.length ? resolvedRemove : undefined,
      };
    },
    [prefixCls, bpPrefix, classes],
  );

  const sendPrefixed = useCallback((mutation: Extract<Mutation, { type: "modify-class" }>) => {
    return trackedSendMutation(scopeToBreakpoint(mutation));
  }, [trackedSendMutation, scopeToBreakpoint]);

  const debouncedSendPrefixed = useCallback(
    (key: string, mutation: Extract<Mutation, { type: "modify-class" }>, delay?: number) => {
      debouncedMutation(key, scopeToBreakpoint(mutation), delay);
    },
    [debouncedMutation, scopeToBreakpoint],
  );

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
    sendPrefixed, debouncedSendPrefixed, toggleCls,
    trackedSendMutation, debouncedMutation,
  }), [
    sel, classes, bpPrefix, breakpoint,
    prefixCls, stripBpPrefix, resolveClass,
    findCls, findPrefixedCls,
    get, set, has, actual,
    sendPrefixed, debouncedSendPrefixed, toggleCls,
    trackedSendMutation, debouncedMutation,
  ]);
}
