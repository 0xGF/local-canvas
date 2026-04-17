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
  cssClasses?: string;
  intent?: "fix" | "change" | "question";
}) {
  return sharedPostAnnotation(opts);
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
        // If AI prompt is open, first Escape returns to the menu;
        // second Escape closes the whole thing.
        if (aiPromptOpen) { e.stopPropagation(); setAiPromptOpen(false); return; }
        setContextMenu(null);
      }
    }
    function onClick(e: MouseEvent) {
      const path = e.composedPath();
      if (menuRef.current && !path.includes(menuRef.current)) {
        setContextMenu(null); setAiPromptOpen(false);
      }
    }
    const timer = setTimeout(() => document.addEventListener("click", onClick, true), 50);
    document.addEventListener("keydown", onKey, true);
    return () => { clearTimeout(timer); document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true); };
  }, [menu, setContextMenu, aiPromptOpen]);

  useEffect(() => {
    if (aiPromptOpen && aiInputRef.current) aiInputRef.current.focus();
  }, [aiPromptOpen]);

  // When the menu is opened with `initialMode: "ai-prompt"` (annotate-tool
  // click path), skip the main item list and open the Ask AI textarea.
  // Reset on dismiss so a subsequent right-click sees the full item list.
  useEffect(() => {
    if (menu?.initialMode === "ai-prompt" && !aiPromptOpen) setAiPromptOpen(true);
    if (!menu && aiPromptOpen) setAiPromptOpen(false);
  }, [menu, aiPromptOpen]);

  const close = useCallback(() => { setContextMenu(null); setAiPromptOpen(false); }, [setContextMenu]);

  const tracked = useCallback(async (mutation: Mutation) => {
    await sendMutation(mutation);
    incrementPending();
    close();
  }, [sendMutation, incrementPending, close]);

  if (!menu) return null;

  const { x, y, element: el, source } = menu;
  const classes = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean);
  const tag = el.tagName.toLowerCase();
  const hasSource = !!source;

  // Get direct text content
  let directText = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) directText += node.textContent || "";
  }
  const hasText = directText.trim().length > 0;

  const items: MenuItem[] = [
    {
      label: "Edit Text",
      icon: <Type size={13} />,
      disabled: !hasText || !hasSource,
      action: () => {
        if (!hasSource) return;
        close();
        // Dispatch custom event for useTextEdit to start inline editing
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

  const menuWidth = aiPromptOpen ? 320 : 220;
  const menuHeight = aiPromptOpen ? 180 : items.length * 32 + 16;
  // x,y is the anchor point (top of the element). Position the menu's bottom
  // at that point so it floats above the element. Fall back to below if there
  // isn't room above.
  const posX = x + menuWidth > window.innerWidth ? Math.max(8, window.innerWidth - menuWidth - 8) : x;
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

      {aiPromptOpen ? (
        <div style={{ padding: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <button
              onClick={() => setAiPromptOpen(false)}
              title="Back to menu (esc)"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none", padding: 2,
                borderRadius: 4, color: C.fgMuted, cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.fg; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgMuted; }}
            >
              <ArrowLeft size={13} />
            </button>
            <MessageSquarePlus size={12} />
            <div style={{ fontSize: 10, color: C.fgMuted, fontWeight: 600 }}>
              {multiSelection.length > 1
                ? `${multiSelection.length} elements: ${multiSelection.map(s => s.tagName).join(", ")}`
                : "Add Annotation"}
            </div>
          </div>
          <textarea
            ref={aiInputRef}
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => {
              // Stop propagation so nothing upstream steals keystrokes
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey && aiPrompt.trim()) {
                e.preventDefault();
                const prompt = aiPrompt.trim();
                const multi = useEditorStore.getState().multiSelection;
                const elementPath = multi.length > 1
                  ? multi.map(s => s.source ? `${s.source.filePath}:${s.source.line}` : s.tagName).join(", ")
                  : source ? `${source.filePath}:${source.line}` : tag;
                const elementDesc = multi.length > 1
                  ? `${multi.length} elements: ${multi.map(s => `<${s.tagName}>`).join(", ")}`
                  : `<${tag}>${classes.length ? "." + classes.join(".") : ""}`;
                postAnnotation({
                  comment: prompt,
                  element: elementDesc,
                  elementPath,
                  cssClasses: multi.length > 1 ? multi.map(s => s.className).filter(Boolean).join(" | ") : classes.join(" "),
                  intent: "change",
                }).then(() => {
                  useEditorStore.getState().showToast("Sent to agent");
                }).catch(() => {
                  useEditorStore.getState().showToast("Agent not connected");
                });
                setAiPrompt(""); close();
              }
              if (e.key === "Escape") { e.preventDefault(); setAiPromptOpen(false); }
            }}
            placeholder={multiSelection.length > 1
              ? "Feedback for this group of elements..."
              : "Describe the change... (e.g. make this a 3-column responsive grid with 16px gap)"}
            rows={4}
            style={{
              width: "100%", minHeight: 90, resize: "vertical",
              background: C.bgAlt, border: `1px solid ${C.accent}`, borderRadius: 6,
              color: C.fg, fontSize: 12, fontFamily: C.font,
              padding: "8px 10px", outline: "none", boxSizing: "border-box",
              lineHeight: 1.4,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
            <div style={{ fontSize: 9, color: C.fgMuted, fontFamily: C.mono }}>
              <kbd style={{ padding: "1px 4px", borderRadius: 3, background: C.bgAlt, border: `1px solid ${C.borderLight}` }}>↵</kbd> send&nbsp;&nbsp;
              <kbd style={{ padding: "1px 4px", borderRadius: 3, background: C.bgAlt, border: `1px solid ${C.borderLight}` }}>⇧↵</kbd> newline&nbsp;&nbsp;
              <kbd style={{ padding: "1px 4px", borderRadius: 3, background: C.bgAlt, border: `1px solid ${C.borderLight}` }}>esc</kbd> cancel
            </div>
            <button
              disabled={!aiPrompt.trim()}
              onClick={() => {
                const prompt = aiPrompt.trim();
                if (!prompt) return;
                const elementPath = source ? `${source.filePath}:${source.line}` : tag;
                postAnnotation({
                  comment: prompt,
                  element: `<${tag}>${classes.length ? "." + classes.join(".") : ""}`,
                  elementPath,
                  cssClasses: classes.join(" "),
                  intent: "change",
                }).then(() => {
                  useEditorStore.getState().showToast("Sent to agent");
                }).catch(() => {
                  useEditorStore.getState().showToast("Agent not connected");
                });
                setAiPrompt(""); close();
              }}
              style={{
                background: aiPrompt.trim() ? C.accent : C.bgAlt,
                color: aiPrompt.trim() ? "#fff" : C.fgMuted,
                border: "none", borderRadius: 5,
                padding: "5px 12px", fontSize: 11, fontWeight: 600,
                cursor: aiPrompt.trim() ? "pointer" : "default",
                fontFamily: C.font,
              }}
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        items.map((item, i) => (
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
        ))
      )}
    </div>
  );
});
