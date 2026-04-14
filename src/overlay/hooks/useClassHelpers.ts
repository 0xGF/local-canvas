import { useMemo, useCallback, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { getBreakpointPrefix } from "../../shared/breakpoints.js";

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

  const trackedSendMutation = useCallback(
    async (mutation: any) => {
      const result = await sendMutation(mutation);
      incrementPending();
      return result;
    },
    [sendMutation, incrementPending]
  );

  // Debounced mutation sender — prevents 30 mutations when scrolling dropdowns
  const debounceTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debouncedMutation = useCallback(
    (key: string, mutation: any, delay = 300) => {
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
    if (/^(sm|md|lg|xl|2xl):/.test(cls)) return cls;
    return `${bpPrefix}:${cls}`;
  }, [bpPrefix]);

  const stripBpPrefix = useCallback((cls: string) => cls.replace(/^(sm|md|lg|xl|2xl):/, ""), []);

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

  const sendPrefixed = useCallback((mutation: any) => {
    const prefixedAdd = mutation.add?.map((c: string) => prefixCls(c));
    const resolvedRemove = mutation.remove?.map((c: string) => {
      if (/^(sm|md|lg|xl|2xl):/.test(c)) return c;
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
