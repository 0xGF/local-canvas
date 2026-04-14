import React, { useEffect, useCallback, useState, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import {
  Type, Copy, ClipboardPaste, Trash2,
  ArrowUp, ArrowDown, Layers, Sparkles,
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

export const ContextMenu = React.memo(function ContextMenu() {
  const menu = useEditorStore((s) => s.contextMenu);
  const setContextMenu = useEditorStore((s) => s.setContextMenu);
  const incrementPending = useEditorStore((s) => s.incrementPending);
  const selectElement = useEditorStore((s) => s.selectElement);
  const { sendMutation, send } = useWebSocket();
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const aiInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setContextMenu(null); setAiPromptOpen(false); }
    }
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null); setAiPromptOpen(false);
      }
    }
    const timer = setTimeout(() => document.addEventListener("click", onClick, true), 50);
    document.addEventListener("keydown", onKey, true);
    return () => { clearTimeout(timer); document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true); };
  }, [menu, setContextMenu]);

  useEffect(() => {
    if (aiPromptOpen && aiInputRef.current) aiInputRef.current.focus();
  }, [aiPromptOpen]);

  const close = useCallback(() => { setContextMenu(null); setAiPromptOpen(false); }, [setContextMenu]);

  const tracked = useCallback(async (mutation: any) => {
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
        useEditorStore.getState().setEditingText(true);
        close();
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
        sendMutation({ type: "reorder", source: parentSource, fromIndex: idx, toIndex: idx - 1 } as any).then(() => incrementPending());
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
        sendMutation({ type: "reorder", source: parentSource, fromIndex: idx, toIndex: idx + 1 } as any).then(() => incrementPending());
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
      label: "Ask AI...",
      icon: <Sparkles size={13} />,
      action: () => setAiPromptOpen(true),
    },
  ];

  const menuWidth = 220;
  const menuHeight = items.length * 32 + 16;
  const posX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const posY = y + menuHeight > window.innerHeight ? Math.max(8, y - menuHeight) : y;

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
          <div style={{ fontSize: 10, color: C.fgMuted, marginBottom: 4, fontWeight: 600 }}>AI Prompt</div>
          <input
            ref={aiInputRef}
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && aiPrompt.trim() && source) {
                send({ type: "ai-command", prompt: aiPrompt.trim(), elementContext: {
                  filePath: source.filePath, line: source.line, column: source.column,
                  tagName: tag, className: classes.join(" "),
                  innerHTML: el.innerHTML?.substring(0, 200),
                  parentTag: el.parentElement?.tagName.toLowerCase(),
                }});
                incrementPending(); setAiPrompt(""); close();
              }
              if (e.key === "Escape") setAiPromptOpen(false);
            }}
            placeholder="e.g. make this a 3-column grid..."
            style={{ width: "100%", height: 32, background: C.bgAlt, border: `1px solid ${C.accent}`, borderRadius: 6, color: C.fg, fontSize: 11, fontFamily: C.mono, padding: "0 8px", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 9, color: C.fgMuted, marginTop: 4 }}>Enter to send, Escape to cancel</div>
        </div>
      ) : (
        items.map((item, i) => (
          <React.Fragment key={i}>
            <div
              onClick={item.disabled ? undefined : item.action}
              style={{
                display: "flex", alignItems: "center", gap: 8,
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
