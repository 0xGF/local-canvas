import React, { useState } from "react";

interface ToggleItem {
  value: string;
  icon?: React.ReactNode;
  label?: string;
  title?: string;
}

interface ToggleGroupProps {
  value: string;
  items: ToggleItem[];
  onChange: (value: string) => void;
  showLabels?: boolean;
}

import { THEME } from "../../theme.js";
const C = { ...THEME, bgActive: THEME.accent, fgActive: "#fff" };

export const ToggleGroup = React.memo(function ToggleGroup({
  value,
  items,
  onChange,
  showLabels = false,
}: ToggleGroupProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          background: C.bgAlt,
          borderRadius: 6,
          padding: 2,
          gap: 1,
        }}
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              onClick={() => onChange(item.value === value ? "" : item.value)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  text: item.title || item.label || item.value,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                height: 26,
                minWidth: showLabels ? 0 : 30,
                padding: showLabels ? "0 8px" : "0 6px",
                borderRadius: 4,
                border: "none",
                background: active ? C.bgActive : "transparent",
                color: active ? C.fgActive : C.fgDim,
                cursor: "pointer",
                fontSize: 10,
                fontWeight: active ? 500 : 400,
                transition: "all 0.12s ease",
                flex: showLabels ? 1 : undefined,
              }}
              onMouseOver={(e) => {
                if (!active) e.currentTarget.style.background = C.bgHover;
              }}
              onMouseOut={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              {item.icon}
              {showLabels && (
                <span style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                  {item.label || item.value}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* Tooltip */}
      {tooltip && !showLabels && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y - 28,
            transform: "translateX(-50%)",
            background: "#000",
            color: "#fff",
            fontSize: 10,
            fontWeight: 500,
            padding: "3px 8px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 2147483647,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
});
