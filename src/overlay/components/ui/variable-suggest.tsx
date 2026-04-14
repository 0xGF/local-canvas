import React, { useState, useRef, useCallback, useEffect } from "react";
import { THEME } from "../../theme.js";

const C = THEME;

interface CSSVariable {
  name: string;
  value: string;
}

interface VariableSuggestProps {
  variables: CSSVariable[];
  onSelect: (varName: string) => void;
  onClose: () => void;
  anchor: { x: number; y: number };
  filter?: string;
}

export const VariableSuggest = React.memo(function VariableSuggest({
  variables,
  onSelect,
  onClose,
  anchor,
  filter = "",
}: VariableSuggestProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = filter
    ? variables.filter(v => v.name.toLowerCase().includes(filter.toLowerCase()))
    : variables;

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        onSelect(`var(${filtered[activeIndex].name})`);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [activeIndex, filtered, onSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement;
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      style={{
        position: "fixed",
        left: anchor.x,
        top: anchor.y,
        width: 240,
        maxHeight: 200,
        overflowY: "auto",
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        zIndex: 2147483647,
        pointerEvents: "auto",
        padding: 2,
      }}
    >
      {filtered.slice(0, 50).map((v, i) => (
        <div
          key={v.name}
          onClick={() => onSelect(`var(${v.name})`)}
          onMouseEnter={() => setActiveIndex(i)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 8px",
            fontSize: 10,
            fontFamily: C.mono,
            cursor: "pointer",
            borderRadius: 4,
            background: i === activeIndex ? C.bgHover : "transparent",
            color: C.fg,
            gap: 8,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {v.name}
          </span>
          <span style={{
            fontSize: 9,
            color: C.fgMuted,
            maxWidth: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {v.value.startsWith("#") || v.value.startsWith("rgb") ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: v.value, border: "1px solid rgba(255,255,255,0.2)", display: "inline-block" }} />
                {v.value}
              </span>
            ) : v.value}
          </span>
        </div>
      ))}
    </div>
  );
});
