import { useEffect, useCallback, useState, useRef } from "react";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "./useWebSocket.js";
import { resolveSource } from "../../core/source-map/resolver.js";
import { deepElementFromPoint } from "../utils/element-picker.js";
import { attachToDocumentAndIframe } from "../utils/iframe-events.js";

interface TextEditState {
  element: HTMLElement;
  originalText: string;
  rect: DOMRect;
}

/**
 * Double-click on text elements to enter inline editing mode.
 * Shows a contenteditable overlay, commits text changes via modify-text mutation.
 */
export function useTextEdit() {
  const [editState, setEditState] = useState<TextEditState | null>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const { sendMutation } = useWebSocket();
  const incrementPending = useEditorStore((s) => s.incrementPending);

  const commitText = useCallback(async (el: HTMLElement, newText: string, originalText: string) => {
    if (newText === originalText) return;
    const source = resolveSource(el);
    if (!source) return;
    await sendMutation({
      type: "modify-text",
      source,
      newText,
    });
    incrementPending();
  }, [sendMutation, incrementPending]);

  const closeEdit = useCallback(() => {
    if (!editState || !editRef.current) {
      setEditState(null);
      return;
    }
    const newText = editRef.current.textContent || "";
    commitText(editState.element, newText.trim(), editState.originalText);
    setEditState(null);
  }, [editState, commitText]);

  // Listen for double-click to start text editing
  useEffect(() => {
    function isTextElement(el: HTMLElement): boolean {
      // Check if element is a leaf node with direct text content
      const childEls = el.children.length;
      if (childEls > 0) {
        // Has child elements — only allow if the element itself has meaningful text
        // e.g. <p>Hello <span>world</span></p> — double-clicking "Hello" should work
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            return true;
          }
        }
        return false;
      }
      // Leaf element — check for text content
      const text = el.textContent?.trim();
      return Boolean(text && text.length > 0);
    }

    function onDblClick(e: MouseEvent) {
      const mode = useEditorStore.getState().mode;
      if (mode !== "edit") return;

      // Don't intercept if clicking inside overlay UI
      const path = e.composedPath();
      for (const node of path) {
        if (node instanceof HTMLElement) {
          if (node.id === "local-canvas-host") return;
          if (node.getAttribute?.("data-canvas-overlay") === "true") return;
        }
      }

      // Find target in iframe document (elements are inside iframe in edit mode)
      const host = document.getElementById("local-canvas-host");
      const shadow = host?.shadowRoot;
      const iframe = shadow?.querySelector("iframe") as HTMLIFrameElement | null;
      let targetDoc: Document = document;
      let offsetX = 0, offsetY = 0;
      if (iframe?.contentDocument) {
        const ir = iframe.getBoundingClientRect();
        targetDoc = iframe.contentDocument;
        offsetX = ir.left;
        offsetY = ir.top;
      }
      const target = deepElementFromPoint(e.clientX - offsetX, e.clientY - offsetY, targetDoc);
      if (!target || !isTextElement(target)) return;

      // Only edit elements with source location
      const source = resolveSource(target);
      if (!source) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = target.getBoundingClientRect();
      const textContent = target.textContent?.trim() || "";

      setEditState({
        element: target,
        originalText: textContent,
        rect,
      });
    }

    return attachToDocumentAndIframe([{ event: "dblclick", handler: onDblClick }]);
  }, []);

  // Focus the editable div when it appears
  useEffect(() => {
    if (editState && editRef.current) {
      const el = editRef.current;
      el.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editState]);

  return { editState, editRef, closeEdit };
}
