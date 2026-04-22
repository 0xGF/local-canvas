import React, { useEffect, useCallback, useState, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import type { Mutation } from "../../server/types.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import {
  Type, Copy, ClipboardPaste, Trash2,
  ArrowUp, ArrowDown, ArrowLeft, Layers, MessageSquarePlus, Sparkles,
  ChevronDown, ChevronRight, Plus,
} from "./icons.js";
import { THEME } from "../theme.js";
import { getEditorIframe, iframeRectToScreenBox } from "../utils/iframe-events.js";
import { useViewportStore } from "../hooks/useViewport.js";

const C = THEME;

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  dividerAfter?: boolean;
  disabled?: boolean;
  action: () => void;
}

let copiedClasses: string[] = [];

// Re-use the shared annotations client so ContextMenu and AnnotationPins
// send through one code path.
import { postAnnotation as sharedPostAnnotation } from "../utils/annotations.js";

async function postAnnotation(opts: {
  comment: string;
  element: string;
  elementPath: string;
  elementPaths?: string[];
  cssClasses?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}) {
  return sharedPostAnnotation(opts);
}

/** Union of the viewport-coord rects of the given elements. Returns null if
 *  the list is empty or every element is unreachable. */
function unionBoundingBox(
  elements: HTMLElement[],
): { x: number; y: number; width: number; height: number } | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  let any = false;
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
    any = true;
  }
  if (!any) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Build the annotation payload for either a single- or multi-element
 *  selection. Handles elementPaths, union bounding box, and the human-readable
 *  element description + class list. Kept standalone so the Enter handler and
 *  the Send button share exactly the same payload shape. */
function buildAnnotationOpts(
  prompt: string,
  multi: Array<{ element: HTMLElement; source?: { filePath: string; line: number } | null; tagName: string; className: string }>,
  fallbackSource: { filePath: string; line: number } | null | undefined,
  fallbackTag: string,
  fallbackClasses: string[],
) {
  if (multi.length > 1) {
    const paths = multi
      .map(s => s.source ? `${s.source.filePath}:${s.source.line}` : null)
      .filter((p): p is string => !!p);
    const union = unionBoundingBox(multi.map(s => s.element));
    return {
      comment: prompt,
      element: `${multi.length} elements: ${multi.map(s => `<${s.tagName}>`).join(", ")}`,
      // Comma-joined fallback so servers that strip elementPaths still
      // roundtrip the full set — annotationPaths() parses it back.
      elementPath: paths.length > 0 ? paths.join(", ") : multi[0].tagName,
      elementPaths: paths.length > 1 ? paths : undefined,
      cssClasses: multi.map(s => s.className).filter(Boolean).join(" | "),
      boundingBox: union ?? undefined,
    };
  }
  return {
    comment: prompt,
    element: `<${fallbackTag}>${fallbackClasses.length ? "." + fallbackClasses.join(".") : ""}`,
    elementPath: fallbackSource ? `${fallbackSource.filePath}:${fallbackSource.line}` : fallbackTag,
    cssClasses: fallbackClasses.join(" "),
  };
}

export const ContextMenu = React.memo(function ContextMenu() {
  const menu = useEditorStore((s) => s.contextMenu);
  const setContextMenu = useEditorStore((s) => s.setContextMenu);
  const incrementPending = useEditorStore((s) => s.incrementPending);
  const selectElement = useEditorStore((s) => s.selectElement);
  const multiSelection = useEditorStore((s) => s.multiSelection);
  const { sendMutation, send } = useWebSocket();
  // Start true when the menu was opened with initialMode: "ai-prompt" so
  // the AnnotatePill renders on the very first frame. Otherwise the menu
  // chrome would flash for one tick before the effect below flips it to
  // true, and the single annotate-click reads as "nothing happened" —
  // especially in dev/strict mode where effects double-run.
  const [aiPromptOpen, setAiPromptOpen] = useState(() => menu?.initialMode === "ai-prompt");
  const [aiPrompt, setAiPrompt] = useState("");
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (aiPromptOpen) {
          e.stopPropagation();
          // Annotate-tool flow: the item list isn't what the user wanted
          // either, so close the whole thing in one press AND drop annotate
          // mode (otherwise the next click would re-open the prompt).
          if (menu?.initialMode === "ai-prompt") {
            useEditorStore.getState().setAnnotateMode(false);
            setContextMenu(null);
            setAiPromptOpen(false);
            return;
          }
          // Right-click flow: first Esc returns to the item list.
          setAiPromptOpen(false);
          return;
        }
        setContextMenu(null);
      }
    }
    function onClick(e: MouseEvent) {
      const path = e.composedPath();
      if (menuRef.current && !path.includes(menuRef.current)) {
        setContextMenu(null); setAiPromptOpen(false);
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("click", onClick, true);
      // Also listen on iframe doc so clicking inside the page closes the menu
      try {
        const iframeDoc = getEditorIframe()?.contentDocument;
        if (iframeDoc) iframeDoc.addEventListener("click", onClick, true);
      } catch {}
    }, 50);
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      try {
        const iframeDoc = getEditorIframe()?.contentDocument;
        if (iframeDoc) iframeDoc.removeEventListener("click", onClick, true);
      } catch {}
    };
  }, [menu, setContextMenu, aiPromptOpen]);

  useEffect(() => {
    if (aiPromptOpen && aiInputRef.current) aiInputRef.current.focus();
  }, [aiPromptOpen]);

  // When the menu is opened with `initialMode: "ai-prompt"` (annotate-tool
  // click path), skip the main item list and open the Ask AI textarea.
  // Reset on dismiss so a subsequent right-click sees the full item list.
  //
  // IMPORTANT: depend only on `menu`, not on `aiPromptOpen`. If we also
  // depend on `aiPromptOpen`, pressing Esc inside the prompt sets it to
  // false — the effect then immediately re-opens it (menu.initialMode is
  // still "ai-prompt"), creating an escape-proof loop. Menu identity is
  // the only trigger that matters.
  const lastMenuRef = useRef<typeof menu>(null);
  useEffect(() => {
    if (menu !== lastMenuRef.current) {
      lastMenuRef.current = menu;
      if (menu?.initialMode === "ai-prompt") setAiPromptOpen(true);
      else if (!menu) setAiPromptOpen(false);
    }
  }, [menu]);

  const close = useCallback(() => { setContextMenu(null); setAiPromptOpen(false); }, [setContextMenu]);

  const tracked = useCallback(async (mutation: Mutation) => {
    await sendMutation(mutation);
    incrementPending();
    close();
  }, [sendMutation, incrementPending, close]);

  if (!menu) return null;

  const { x, y, element: el, source, initialMode } = menu;
  // Annotate flow passes x as the element's horizontal centre, not its left
  // edge, so the menu opens centred over the element instead of at its side.
  const anchorCentre = initialMode === "ai-prompt";
  const classes = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean);
  const tag = el.tagName.toLowerCase();
  const hasSource = !!source;

  // Get direct text content
  let directText = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) directText += node.textContent || "";
  }
  const hasText = directText.trim().length > 0;

  const isMulti = multiSelection.length > 1;

  // Multi-select actions share a helper: fan out one mutation per member.
  // `reverseBySource` applies in descending source-line order — use this for
  // destructive or insertion-style mutations (delete, duplicate-element) so
  // rewriting an earlier member doesn't shift the line numbers of later ones.
  const fanOut = async (
    build: (s: (typeof multiSelection)[number]) => Mutation | null,
    reverseBySource = false,
  ) => {
    const store = useEditorStore.getState();
    const members = reverseBySource
      ? [...multiSelection].sort((a, b) => (b.source?.line ?? 0) - (a.source?.line ?? 0))
      : multiSelection;
    for (const s of members) {
      const m = build(s);
      if (!m) continue;
      await sendMutation(m);
      store.incrementPending();
    }
    close();
  };

  const items: MenuItem[] = isMulti ? [
    {
      label: `${multiSelection.length} elements selected`,
      icon: <Layers size={13} />,
      disabled: true,
      action: () => {},
      dividerAfter: true,
    },
    {
      label: "Add annotation...",
      icon: <MessageSquarePlus size={13} />,
      action: () => setAiPromptOpen(true),
      dividerAfter: true,
    },
    {
      label: "Duplicate All",
      icon: <Copy size={13} />,
      disabled: multiSelection.every(s => !s.source),
      action: () => {
        useEditorStore.getState().showToast(`Duplicated ${multiSelection.length} elements`);
        // Clear the selection after the fan-out — our stored source.line
        // references are stale once the file has been rewritten N times,
        // so the highlight would land on the wrong elements.
        fanOut(s => s.source ? { type: "duplicate-element", source: s.source } : null, true)
          .then(() => selectElement(null));
      },
    },
    {
      label: "Delete All",
      icon: <Trash2 size={13} />,
      danger: true,
      disabled: multiSelection.every(s => !s.source),
      action: () => {
        useEditorStore.getState().showToast(`Deleted ${multiSelection.length} elements`);
        fanOut(s => s.source ? { type: "delete", source: s.source } : null, true);
        selectElement(null);
      },
      dividerAfter: true,
    },
    {
      label: "Copy All Classes",
      icon: <Copy size={13} />,
      action: () => {
        const allClasses = multiSelection.flatMap(s => s.className.split(/\s+/).filter(Boolean));
        copiedClasses = [...new Set(allClasses)];
        navigator.clipboard?.writeText(copiedClasses.join(" "));
        useEditorStore.getState().showToast(`Copied ${copiedClasses.length} classes`);
        close();
      },
    },
    {
      label: "Paste Classes to All",
      icon: <ClipboardPaste size={13} />,
      disabled: copiedClasses.length === 0 || multiSelection.every(s => !s.source),
      action: () => {
        if (copiedClasses.length === 0) return;
        useEditorStore.getState().showToast(`Pasted to ${multiSelection.length} elements`);
        fanOut(s => s.source ? { type: "modify-class", source: s.source, add: copiedClasses } : null);
      },
      dividerAfter: true,
    },
    {
      label: "Clear Selection",
      icon: <Type size={13} />,
      action: () => { useEditorStore.getState().selectElement(null); close(); },
    },
  ] : [
    {
      label: "Edit Text",
      icon: <Type size={13} />,
      disabled: !hasText || !hasSource,
      action: () => {
        if (!hasSource) return;
        close();
        setTimeout(() => {
          el.dispatchEvent(new CustomEvent("canvas:start-text-edit", { bubbles: true }));
        }, 0);
      },
    },
    {
      label: "Select Parent",
      icon: <Layers size={13} />,
      action: () => {
        const parent = el.parentElement;
        if (!parent) return close();
        const parentSource = resolveSource(parent);
        const sel = useEditorStore.getState().selectedElement;
        selectElement({
          element: parent,
          source: parentSource,
          rect: parent.getBoundingClientRect(),
          className: typeof parent.className === "string" ? parent.className : "",
          tagName: parent.tagName.toLowerCase(),
          iframeRef: sel?.iframeRef,
        });
        useEditorStore.getState().showToast(`Selected <${parent.tagName.toLowerCase()}>`);
        close();
      },
      dividerAfter: true,
    },
    {
      label: "Duplicate",
      icon: <Copy size={13} />,
      shortcut: "\u2318D",
      disabled: !hasSource,
      action: () => {
        if (!source) return;
        useEditorStore.getState().showToast("Duplicated");
        tracked({ type: "duplicate-element", source });
      },
    },
    {
      label: "Delete",
      icon: <Trash2 size={13} />,
      danger: true,
      disabled: !hasSource,
      action: () => {
        if (!source) return;
        useEditorStore.getState().showToast("Deleted");
        tracked({ type: "delete", source });
        selectElement(null);
      },
      dividerAfter: true,
    },
    {
      label: "Move Up",
      icon: <ArrowUp size={13} />,
      action: () => {
        const parent = el.parentElement;
        if (!parent) return close();
        const parentSource = resolveSource(parent);
        if (!parentSource) return close();
        const children = Array.from(parent.children);
        const idx = children.indexOf(el);
        if (idx <= 0) return close();
        sendMutation({ type: "reorder", source: parentSource, fromIndex: idx, toIndex: idx - 1 }).then(() => incrementPending());
        close();
      },
    },
    {
      label: "Move Down",
      icon: <ArrowDown size={13} />,
      action: () => {
        const parent = el.parentElement;
        if (!parent) return close();
        const parentSource = resolveSource(parent);
        if (!parentSource) return close();
        const children = Array.from(parent.children);
        const idx = children.indexOf(el);
        if (idx >= children.length - 1) return close();
        sendMutation({ type: "reorder", source: parentSource, fromIndex: idx, toIndex: idx + 1 }).then(() => incrementPending());
        close();
      },
      dividerAfter: true,
    },
    {
      label: "Copy Classes",
      icon: <Copy size={13} />,
      action: () => { copiedClasses = [...classes]; navigator.clipboard?.writeText(classes.join(" ")); close(); },
    },
    {
      label: "Paste Classes",
      icon: <ClipboardPaste size={13} />,
      disabled: !hasSource || copiedClasses.length === 0,
      action: () => {
        if (!source || copiedClasses.length === 0) return close();
        tracked({ type: "modify-class", source, add: copiedClasses });
      },
      dividerAfter: true,
    },
    {
      label: "Add annotation...",
      icon: <MessageSquarePlus size={13} />,
      action: () => setAiPromptOpen(true),
    },
  ];

  // In annotate mode we render a dedicated Figma-style floating pill —
  // not the menu chrome. It's anchored to the element (via iframe-rect
  // translation upstream) and flips above/below based on room. The other
  // path (right-click → "Add annotation") also lands in this branch.
  if (aiPromptOpen) {
    return (
      <AnnotatePill
        element={el}
        fallbackX={x}
        fallbackYTop={y}
        elementTag={tag}
        onClose={close}
        onSubmit={(prompt) => {
          const opts = buildAnnotationOpts(prompt, multiSelection, source, tag, classes);
          postAnnotation(opts).then(() => {
            useEditorStore.getState().showToast("Sent to agent");
          }).catch(() => {
            useEditorStore.getState().showToast("Agent not connected");
          });
          close();
        }}
      />
    );
  }

  const menuWidth = 220;
  const menuHeight = items.length * 32 + 16;
  // x,y is the anchor point (top of the element, plus centre-x for annotate).
  // Position the menu's bottom at y so it floats above the element, falling
  // back below if there isn't room.
  const rawX = anchorCentre ? x - menuWidth / 2 : x;
  const posX = Math.min(
    Math.max(8, rawX),
    window.innerWidth - menuWidth - 8,
  );
  const posY = y - menuHeight >= 8 ? y - menuHeight : Math.min(y + 12, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      data-canvas-overlay="true"
      style={{
        position: "fixed", left: posX, top: posY, width: menuWidth,
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 2147483647,
        pointerEvents: "auto", padding: 4, fontFamily: C.font, fontSize: 12,
      }}
    >
      {/* Header */}
      <div style={{ padding: "4px 8px 6px", fontSize: 9, fontWeight: 600, color: C.fgMuted, fontFamily: C.mono, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 2 }}>
        {"<"}{tag}{">"}
        {source && <span style={{ marginLeft: 6, fontWeight: 400 }}>{source.filePath.split("/").pop()}:{source.line}</span>}
      </div>

      {items.map((item, i) => (
          <React.Fragment key={i}>
            <div
              onClick={item.disabled ? undefined : item.action}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 8px", borderRadius: 4,
                cursor: item.disabled ? "default" : "pointer",
                color: item.danger ? C.danger : item.disabled ? C.fgMuted : C.fg,
                opacity: item.disabled ? 0.4 : 1,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = C.bgHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ opacity: 0.7, flexShrink: 0, display: "flex" }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && <span style={{ fontSize: 10, color: C.fgMuted, fontFamily: C.mono }}>{item.shortcut}</span>}
            </div>
            {item.dividerAfter && <div style={{ height: 1, background: C.borderLight, margin: "2px 4px" }} />}
          </React.Fragment>
      ))}
    </div>
  );
});

// ── Figma-style annotate pill ─────────────────────────────────────────────
/**
 * Floating comment input anchored to the annotated element. Rendered
 * instead of the ContextMenu chrome when the user is in annotate mode.
 * Positions itself just below the element (flips above if no room),
 * horizontally centered on the anchor and clamped to the viewport.
 *
 * The design goal is Figma's "Add a comment" affordance: one pill, no
 * header, no kbd hints, with a soft dark background and a circular
 * submit button at the right. The submit button is enabled once the
 * input has non-empty text.
 */
const AnnotatePill = React.memo(function AnnotatePill({
  element,
  fallbackX,
  fallbackYTop,
  elementTag,
  onClose,
  onSubmit,
}: {
  /** The element being annotated. We track its rect so the pill stays
   *  pinned to it when the iframe scrolls. */
  element: HTMLElement;
  /** Used on first paint before we've measured the element ourselves. */
  fallbackX: number;
  fallbackYTop: number;
  elementTag: string;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [cssOpen, setCssOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dotPos, setDotPos] = useState<{ left: number; top: number } | null>(null);
  const [flippedAbove, setFlippedAbove] = useState(false);

  // Compact set of computed styles the user is most likely to want to see
  // when annotating — text, layout, spacing. Full getComputedStyle has 400+
  // properties; this curated list reads in one glance.
  const cssProps = [
    "color", "font-family", "font-size", "font-weight", "line-height",
    "background-color", "border", "border-radius",
    "padding", "margin", "width", "height",
    "display", "position",
  ];
  const cssRows = (() => {
    if (!element || !element.isConnected) return [];
    const doc = element.ownerDocument;
    const cs = doc.defaultView?.getComputedStyle(element);
    if (!cs) return [];
    return cssProps
      .map(p => ({ prop: p, value: cs.getPropertyValue(p).trim() }))
      .filter(r => r.value && r.value !== "none" && r.value !== "normal" && r.value !== "auto");
  })();

  // Focus immediately on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click or Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        useEditorStore.getState().setAnnotateMode(false);
        onClose();
      }
    };
    const onDocClick = (e: MouseEvent) => {
      const path = e.composedPath();
      if (boxRef.current && !path.includes(boxRef.current)) onClose();
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", onDocClick, true);
      try {
        const iframeDoc = getEditorIframe()?.contentDocument;
        if (iframeDoc) iframeDoc.addEventListener("click", onDocClick, true);
      } catch {}
    }, 50);
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey, true);
      try {
        const iframeDoc = getEditorIframe()?.contentDocument;
        if (iframeDoc) iframeDoc.removeEventListener("click", onDocClick, true);
      } catch {}
    };
  }, [onClose]);

  // Pin the pill to the element. The anchor is re-derived from the
  // element's current rect whenever the iframe content scrolls (or its
  // contents reflow) so the pill follows the element rather than staying
  // glued to an absolute viewport coordinate.
  //
  // Pill size is measured once and cached — re-anchoring while typing
  // doesn't cause it to drift, because we only update `top/left`, not the
  // height of the pill itself.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const pillSize = box.getBoundingClientRect();
    const pillW = pillSize.width;
    const pillH = pillSize.height;

    const place = () => {
      const iframe = getEditorIframe();
      // Prefer the live element rect so we track scroll/resize in the iframe.
      let anchorX = fallbackX;
      let anchorYTop = fallbackYTop;
      let anchorYBottom = fallbackYTop;
      if (element && element.isConnected) {
        const rect = element.getBoundingClientRect();
        if (iframe && element.ownerDocument === iframe.contentDocument) {
          const screenBox = iframeRectToScreenBox(rect, iframe);
          anchorX = screenBox.left + screenBox.width / 2;
          anchorYTop = screenBox.top;
          anchorYBottom = screenBox.top + screenBox.height;
        } else {
          anchorX = rect.left + rect.width / 2;
          anchorYTop = rect.top;
          anchorYBottom = rect.bottom;
        }
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 12;
      const left = clamp(anchorX - pillW / 2, 8, vw - pillW - 8);
      // Prefer below when the element's *top* is in the upper half of the
      // viewport; flip above when its bottom is past the halfway mark and
      // there isn't room below. This matches the user's "top → open below,
      // bottom → open above" ask without jittering when the element
      // straddles the midline.
      const belowTop = anchorYBottom + gap;
      const fitsBelow = belowTop + pillH <= vh - 8;
      const flipAbove = !fitsBelow;
      const top = flipAbove
        ? clamp(anchorYTop - pillH - gap, 8, vh - pillH - 8)
        : clamp(belowTop, 8, vh - pillH - 8);
      setPos({ left, top });
      setFlippedAbove(flipAbove);
      // Preview dot anchored to the element's centre — sits between the
      // target and the pill so the user sees "you're annotating HERE."
      setDotPos({ left: anchorX, top: flipAbove ? anchorYTop : anchorYBottom });
    };

    place();

    const iframe = getEditorIframe();
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    // `scroll` fires on both the scrolling element and window — capture-phase
    // catches scrolls on any ancestor, including overflow containers.
    doc?.addEventListener("scroll", place, true);
    win?.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    // Canvas zoom / pan changes the element's on-screen position without
    // firing a DOM scroll event — listen to the viewport store.
    const unsubViewport = useViewportStore.subscribe(place);
    return () => {
      doc?.removeEventListener("scroll", place, true);
      win?.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      unsubViewport();
    };
  }, [element, fallbackX, fallbackYTop]);

  const canSend = text.trim().length > 0 && !sending;
  const submit = () => {
    if (!canSend) return;
    setSending(true);
    onSubmit(text.trim());
  };

  return (
    <>
      {/* Preview dot at the click anchor — a small warning-coloured disc
          showing the user exactly where their annotation will drop. Lives
          between the element and the pill; flips side when the pill flips. */}
      {dotPos && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: dotPos.left - 10,
            top: dotPos.top - 10,
            width: 20, height: 20,
            borderRadius: "50%",
            background: C.warning,
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
            zIndex: 2147483647,
            pointerEvents: "none",
            transition: "left 120ms ease, top 120ms ease",
          }}
        >
          <Plus size={12} />
        </div>
      )}

      <div
        ref={boxRef}
        data-canvas-overlay="true"
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          width: 340,
          maxWidth: "calc(100vw - 16px)",
          display: "flex", flexDirection: "column",
          borderRadius: 10,
          background: C.bg,
          border: `1px solid ${C.border}`,
          boxShadow: "0 10px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)",
          zIndex: 2147483647,
          opacity: pos ? 1 : 0,
          transition: "opacity 100ms ease",
          fontFamily: C.font,
          overflow: "hidden",
        }}
      >
        {/* Header — tag name with chevron that expands the computed CSS. */}
        <button
          onClick={() => setCssOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 10px",
            background: "transparent",
            border: "none",
            borderBottom: cssOpen ? `1px solid ${C.borderLight}` : "none",
            color: C.fg,
            fontFamily: C.mono,
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            outline: "none",
            textAlign: "left",
          }}
        >
          {cssOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span style={{ color: C.fgDim }}>{elementTag}</span>
        </button>

        {cssOpen && (
          <div
            onWheel={e => e.stopPropagation()}
            style={{
              maxHeight: 200,
              overflowY: "auto",
              padding: "8px 10px",
              background: C.bgAlt,
              borderBottom: `1px solid ${C.borderLight}`,
              fontFamily: C.mono,
              fontSize: 10,
              lineHeight: 1.6,
              color: C.fg,
            }}
          >
            {cssRows.length === 0 ? (
              <span style={{ color: C.fgMuted }}>No computed styles.</span>
            ) : (
              cssRows.map(r => (
                <div key={r.prop}>
                  <span style={{ color: C.canvasLayer }}>{r.prop}</span>
                  <span style={{ color: C.fgDim }}>: </span>
                  <span style={{ color: C.fg }}>{r.value}</span>
                  <span style={{ color: C.fgDim }}>;</span>
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ padding: "10px 10px 6px" }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="What should change?"
            rows={1}
            style={{
              width: "100%",
              minHeight: 28,
              maxHeight: 160,
              resize: "none",
              background: C.bgAlt,
              border: `1px solid ${C.borderLight}`,
              borderRadius: 6,
              outline: "none",
              color: C.fg,
              fontSize: 12,
              lineHeight: "20px",
              padding: "6px 8px",
              margin: 0,
              display: "block",
              fontFamily: C.font,
              boxSizing: "border-box",
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "28px";
              el.style.height = Math.min(160, el.scrollHeight) + "px";
            }}
          />
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 6,
          padding: "0 10px 10px",
        }}>
          <button
            onClick={() => {
              useEditorStore.getState().setAnnotateMode(false);
              onClose();
            }}
            disabled={sending}
            style={{
              background: "transparent", border: "none",
              color: C.fgDim, fontSize: 11,
              padding: "4px 10px", borderRadius: 4, cursor: "pointer",
              fontFamily: C.font,
              outline: "none",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSend}
            style={{
              background: canSend ? C.warning : C.bgAlt,
              color: canSend ? "#fff" : C.fgMuted,
              border: "none", borderRadius: 4,
              padding: "4px 14px", fontSize: 11, fontWeight: 600,
              cursor: canSend ? "pointer" : "default",
              fontFamily: C.font,
              outline: "none",
            }}
            title={canSend ? "Send (↵)" : undefined}
          >
            {sending ? "Sending…" : "Add"}
          </button>
        </div>
      </div>
    </>
  );
});

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
