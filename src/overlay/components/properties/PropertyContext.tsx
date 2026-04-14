import React, { createContext, useContext, useCallback, useMemo, useRef } from "react";
import { useEditorStore } from "../../stores/editor-store.js";
import { useWebSocket } from "../../hooks/useWebSocket.js";
import { getBreakpointPrefix } from "../../../shared/breakpoints.js";

// Tailwind spacing scale
const TW_PX_VALUES = [0,2,4,6,8,10,12,14,16,20,24,28,32,36,40,44,48,56,64,80,96,112,128,144,160,176,192,224,256,288,320,384];
const TW_SCALE_KEYS = ["0","0.5","1","1.5","2","2.5","3","3.5","4","5","6","7","8","9","10","11","12","14","16","20","24","28","32","36","40","44","48","56","64","72","80","96"];
const TW_SCALE_PX: Record<string, number> = {};
TW_SCALE_KEYS.forEach((k, i) => { TW_SCALE_PX[k] = TW_PX_VALUES[i] ?? 0; });

export function pxToTwScale(px: number): string {
  if (px <= 0) return "0";
  const rounded = Math.round(px);
  const idx = TW_PX_VALUES.indexOf(rounded);
  if (idx >= 0) return TW_SCALE_KEYS[idx];
  return `[${rounded}px]`;
}

export function twValueToPx(val: string): number {
  if (TW_SCALE_PX[val] !== undefined) return TW_SCALE_PX[val];
  const match = val.match(/^\[(\d+)px\]$/);
  if (match) return parseInt(match[1]);
  return 0;
}

export const PREFIX_TO_CSS: Record<string, string> = {
  mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
  pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
};

export interface PropertyHelpers {
  sel: ReturnType<typeof useEditorStore.getState>["selectedElement"];
  classes: string[];
  bpPrefix: string;
  breakpoint: number;
  get: (prefix: string) => string;
  set: (prefix: string, value: string, isExact?: boolean) => void;
  has: (cls: string) => boolean;
  actual: (bare: string) => string | undefined;
  findCls: (candidates: string[]) => string;
  findPrefixedCls: (prefix: string, opts: string[]) => string | undefined;
  prefixCls: (cls: string) => string;
  toggleCls: (cls: string) => void;
  sendPrefixed: (mutation: any) => Promise<any>;
  trackedSendMutation: (mutation: any) => Promise<any>;
}

const PropertyCtx = createContext<PropertyHelpers | null>(null);

export function usePropertyHelpers(): PropertyHelpers {
  const ctx = useContext(PropertyCtx);
  if (!ctx) throw new Error("usePropertyHelpers must be used within PropertyProvider");
  return ctx;
}

export function PropertyProvider({ children }: { children: React.ReactNode }) {
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

  const debounceTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debouncedMutation = useCallback(
    (key: string, mutation: any, delay = 300) => {
      if (debounceTimerRef.current[key]) clearTimeout(debounceTimerRef.current[key]);
      debounceTimerRef.current[key] = setTimeout(() => {
        trackedSendMutation(mutation);
        delete debounceTimerRef.current[key];
      }, delay);
    },
    [trackedSendMutation]
  );

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
    if (!c) c = classes.find(c => c === prefix || c.startsWith(prefix + "-"));
    if (!c) return "";
    const bare = stripBpPrefix(c);
    return bare === prefix ? "" : bare.slice(prefix.length + 1);
  }, [classes, bpPrefix, stripBpPrefix]);

  const set = useCallback((prefix: string, value: string, isExact = false) => {
    if (!sel?.source) return;
    const target = bpPrefix ? `${bpPrefix}:${prefix}` : prefix;
    let old = classes.find(c => c === target || c.startsWith(target + "-"));
    if (!old) old = classes.find(c => c === prefix || c.startsWith(prefix + "-"));
    const bare = isExact ? value : (value ? `${prefix}-${value}` : "");
    const next = bare ? prefixCls(bare) : "";
    debouncedMutation(prefix, {
      type: "modify-class",
      source: sel.source,
      remove: old ? [old] : undefined,
      add: next ? [next] : undefined,
    });
  }, [sel, classes, debouncedMutation, bpPrefix, prefixCls]);

  const has = useCallback((cls: string) => {
    return classes.includes(cls) || (!!bpPrefix && classes.includes(`${bpPrefix}:${cls}`));
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

  const value = useMemo<PropertyHelpers>(() => ({
    sel, classes, bpPrefix, breakpoint,
    get, set, has, actual, findCls, findPrefixedCls,
    prefixCls, toggleCls, sendPrefixed, trackedSendMutation,
  }), [sel, classes, bpPrefix, breakpoint, get, set, has, actual, findCls, findPrefixedCls, prefixCls, toggleCls, sendPrefixed, trackedSendMutation]);

  return <PropertyCtx.Provider value={value}>{children}</PropertyCtx.Provider>;
}
