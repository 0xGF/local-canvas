import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import { Button } from "./ui/button.js";
import { useEditorStore } from "../stores/editor-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";

export function CommandBar() {
  const commandBarOpen = useEditorStore((s) => s.commandBarOpen);
  const setCommandBarOpen = useEditorStore((s) => s.setCommandBarOpen);
  const selectedElement = useEditorStore((s) => s.selectedElement);
  const { send, onMessage } = useWebSocket();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (commandBarOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setInput("");
      setResponse("");
      setIsLoading(false);
    }
  }, [commandBarOpen]);

  useEffect(() => {
    if (!commandBarOpen) return;

    return onMessage((message) => {
      if (message.type === "ai-stream") {
        setResponse((prev) => prev + message.chunk);
        if (message.done) {
          setIsLoading(false);
        }
      }
      if (message.type === "error") {
        setResponse(message.message);
        setIsLoading(false);
      }
    });
  }, [commandBarOpen, onMessage]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setResponse("");

    send({
      type: "ai-command",
      prompt: input,
      elementContext: selectedElement
        ? {
            filePath: selectedElement.source?.filePath || "",
            line: selectedElement.source?.line || 0,
            column: selectedElement.source?.column,
            tagName: selectedElement.tagName,
            className: selectedElement.className,
          }
        : {
            filePath: "",
            line: 0,
            tagName: "",
            className: "",
          },
    });
  };

  if (!commandBarOpen) return null;

  return (
    <div
      style={{ pointerEvents: "auto" }}
      className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[520px] bg-canvas-bg/95 backdrop-blur-md border border-canvas-border rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Input area */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-canvas-border">
        <Sparkles className="h-4 w-4 text-canvas-accent shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") setCommandBarOpen(false);
          }}
          placeholder={
            selectedElement
              ? `Edit ${selectedElement.tagName}...`
              : "Describe a change..."
          }
          className="flex-1 bg-transparent text-sm text-canvas-fg outline-none placeholder:text-canvas-muted-fg"
        />
        {isLoading ? (
          <Loader2 className="h-4 w-4 text-canvas-muted-fg animate-spin" />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="h-6 w-6"
          >
            <Send className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCommandBarOpen(false)}
          className="h-6 w-6"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Context badge */}
      {selectedElement && (
        <div className="px-3 py-1.5 border-b border-canvas-border bg-canvas-muted/30">
          <span className="text-[10px] text-canvas-muted-fg">
            Context:{" "}
            <span className="font-mono text-canvas-fg">
              {selectedElement.tagName}
            </span>
            {selectedElement.source && (
              <>
                {" "}
                at{" "}
                <span className="font-mono">
                  {selectedElement.source.filePath}:
                  {selectedElement.source.line}
                </span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Response area */}
      {response && (
        <div className="px-3 py-2 max-h-48 overflow-y-auto">
          <pre className="text-xs text-canvas-fg font-mono whitespace-pre-wrap">
            {response}
          </pre>
        </div>
      )}

      {/* Hints */}
      {!response && !isLoading && (
        <div className="px-3 py-2 space-y-1">
          {[
            "Make this section full width",
            "Add a gradient background",
            "Change the font to larger and bold",
            "Add rounded corners and a shadow",
            "Center this element horizontally",
          ].map((hint) => (
            <button
              key={hint}
              onClick={() => {
                setInput(hint);
                inputRef.current?.focus();
              }}
              className="w-full text-left text-xs text-canvas-muted-fg hover:text-canvas-fg hover:bg-canvas-muted/50 rounded px-2 py-1 transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
