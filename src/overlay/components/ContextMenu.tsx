import React, { useEffect, useCallback, useState, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import type { Mutation } from "../../server/types.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import {
  Type, Copy, ClipboardPaste, Trash2,
  ArrowUp, ArrowDown, ArrowLeft, Layers, MessageSquarePlus, Sparkles,
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

// ── Agentation MCP bridge ──
// Re-use the shared agentation client so ContextMenu and AnnotationPins
// share the same session and port config.
import { postAnnotation as sharedPostAnnotation } from "../utils/agentation.js";

async function postAnnotation(opts: {
  comment: string;
  element: string;
  elementPath: string;
  elementPaths?: string[];
  cssClasses?: string;
  intent?: "fix" | "change" | "question";
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
      intent: "change" as const,
      boundingBox: union ?? undefined,
    };
  }
  return {
    comment: prompt,
    element: `<${fallbackTag}>${fallbackClasses.length ? "." + fallbackClasses.join(".") : ""}`,
    elementPath: fallbackSource ? `${fallbackSource.filePath}:${fallbackSource.line}` : fallbackTag,
    cssClasses: fallbackClasses.join(" "),
    intent: "change" as const,
  };
}

export const ContextMenu = React.memo(function ContextMenu() {
  const menu = useEditorStore((s) => s.contextMenu);
  const setContextMenu = useEditorStore((s) => s.setContextMenu);
  const incrementPending = useEditorStore((s) => s.incrementPending);
  const selectElement = useEditorStore((s) => s.selectElement);
  const multiSelection = useEditorStore((s) => s.multiSelection);
  const { sendMutation, send } = useWebSocket();
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
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
  elementTag: _elementTag,
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
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

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
      if (element && element.isConnected) {
        const rect = element.getBoundingClientRect();
        if (iframe && element.ownerDocument === iframe.contentDocument) {
          const screenBox = iframeRectToScreenBox(rect, iframe);
          anchorX = screenBox.left + screenBox.width / 2;
          anchorYTop = screenBox.top;
        } else {
          anchorX = rect.left + rect.width / 2;
          anchorYTop = rect.top;
        }
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 12;
      const left = clamp(anchorX - pillW / 2, 8, vw - pillW - 8);
      const belowTop = anchorYTop + 16 + gap;
      const fitsBelow = belowTop + pillH <= vh - 8;
      const top = fitsBelow
        ? clamp(belowTop, 8, vh - pillH - 8)
        : clamp(anchorYTop - pillH - gap, 8, vh - pillH - 8);
      setPos({ left, top });
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
    <div
      ref={boxRef}
      data-canvas-overlay="true"
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: 380,
        maxWidth: "calc(100vw - 16px)",
        display: "flex",
        // Center vertically so the placeholder/caret sits on the same axis
        // as the submit button at rest. When the textarea grows past one
        // line the button stays centred — matches the Figma comment UI.
        alignItems: "center",
        gap: 10,
        padding: "8px 8px 8px 18px",
        borderRadius: 28,
        background: "rgba(32, 32, 36, 0.82)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        boxShadow:
          "0 10px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
        zIndex: 2147483647,
        opacity: pos ? 1 : 0, // hide until measured so it doesn't flicker at (-9999,-9999)
        transition: "opacity 100ms ease",
        fontFamily: C.font,
      }}
    >
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
        placeholder="Ask AI to change this…"
        rows={1}
        style={{
          flex: 1,
          // Match the circular send button height so both sit on the same
          // baseline when the input is a single line. Grows vertically
          // (capped by maxHeight) as the user types.
          minHeight: 32,
          maxHeight: 160,
          resize: "none",
          background: "transparent",
          border: "none",
          outline: "none",
          color: "#f5f5f5",
          fontSize: 14,
          lineHeight: "22px",
          padding: "5px 0",
          margin: 0,
          display: "block",
          fontFamily: C.font,
          boxSizing: "border-box",
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          // Reset then set from scrollHeight so the box shrinks when the
          // user deletes text.
          el.style.height = "32px";
          el.style.height = Math.min(160, el.scrollHeight) + "px";
        }}
      />
      <button
        onClick={submit}
        disabled={!canSend}
        aria-label="Send"
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "none",
          background: canSend ? "#fff" : "rgba(255,255,255,0.12)",
          color: canSend ? "#111" : "rgba(255,255,255,0.35)",
          cursor: canSend ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 120ms ease, color 120ms ease",
          padding: 0,
        }}
        title={canSend ? "Send (↵)" : undefined}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 13V3M8 3l-4 4M8 3l4 4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
});

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
