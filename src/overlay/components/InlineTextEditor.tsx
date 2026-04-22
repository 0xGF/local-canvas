import React, { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { deepElementFromPoint } from "../utils/element-picker.js";
import { THEME } from "../theme.js";
import { getCachedStyleMap, cssPx } from "../utils/style-cache.js";

const C = THEME;

interface EditingState {
  element: HTMLElement;
  originalText: string;
  rect: DOMRect;
}

export const InlineTextEditor = React.memo(function InlineTextEditor() {
  const mode = useEditorStore((s) => s.mode);
  const incrementPending = useEditorStore((s) => s.incrementPending);
  const { sendMutation } = useWebSocket();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  // Listen for double-click on text elements in edit mode
  useEffect(() => {
    if (mode !== "edit") return;

    function onDblClick(e: MouseEvent) {
      // Don't capture double-clicks on overlay UI
      const path = e.composedPath();
      for (const node of path) {
        if (node instanceof HTMLElement) {
          if (node.id === "local-canvas-host") return;
          if (node.dataset?.canvasOverlay === "true") return;
        }
      }

      const target = deepElementFromPoint(e.clientX, e.clientY, document);
      if (!target) return;

      // Only edit elements that have direct text content
      const textContent = getDirectTextContent(target);
      if (!textContent.trim()) return;

      // Must have a source mapping
      const source = resolveSource(target);
      if (!source) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = target.getBoundingClientRect();
      setValue(textContent);
      setEditing({ element: target, originalText: textContent, rect });
    }

    document.addEventListener("dblclick", onDblClick, true);
    return () => document.removeEventListener("dblclick", onDblClick, true);
  }, [mode]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    if (!editing) return;
    const newText = value.trim();
    if (newText === editing.originalText.trim()) {
      setEditing(null);
      return;
    }

    const source = resolveSource(editing.element);
    if (!source) {
      setEditing(null);
      return;
    }

    sendMutation({
      type: "modify-text",
      source,
      newText,
    }).then(() => incrementPending());

    setEditing(null);
  }, [editing, value, sendMutation, incrementPending]);

  const cancel = useCallback(() => {
    setEditing(null);
  }, []);

  if (!editing) return null;

  const cs = getComputedStyle(editing.element);
  const map = getCachedStyleMap(editing.element);
  const rect = editing.element.getBoundingClientRect();

  return (
    <div
      data-canvas-overlay="true"
      style={{
        position: "fixed",
        left: rect.left - 2,
        top: rect.top - 2,
        zIndex: 2147483647,
        pointerEvents: "auto",
      }}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        style={{
          width: Math.max(rect.width + 4, 80),
          minHeight: Math.max(rect.height + 4, 24),
          maxHeight: 300,
          fontSize: cs.fontSize,
          fontFamily: cs.fontFamily,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          color: cs.color,
          textAlign: cs.textAlign as React.CSSProperties["textAlign"],
          background: "rgba(0,0,0,0.8)",
          border: `2px solid ${C.accent}`,
          borderRadius: 4,
          padding: `${cssPx(map, "padding-top") || 2}px ${cssPx(map, "padding-right") || 4}px`,
          outline: "none",
          resize: "both",
          overflow: "auto",
          boxShadow: `0 0 0 4px rgba(12,140,233,0.2), 0 4px 16px rgba(0,0,0,0.4)`,
        }}
      />
      <div style={{
        display: "flex", gap: 4, marginTop: 4,
        justifyContent: "flex-end",
      }}>
        <span style={{
          fontSize: 9, color: C.fgMuted, fontFamily: C.mono,
          padding: "2px 4px",
        }}>
          Enter to save, Esc to cancel
        </span>
      </div>
    </div>
  );
});

/** Get the direct text content of an element (excluding child elements' text) */
function getDirectTextContent(el: HTMLElement): string {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    }
  }
  return text;
}
