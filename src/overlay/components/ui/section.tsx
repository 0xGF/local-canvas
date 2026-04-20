import React, { useState } from "react";
import { ChevronRight } from "../icons.js";
import { EASE, DURATION } from "../../utils/easings.js";
import { ExpandY } from "../../utils/motion-presets.js";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Optional hover-explained warning shown as a ⚠ next to the chevron. */
  warning?: string;
}

import { THEME } from "../../theme.js";
const C = THEME;

export function Section({ title, children, defaultOpen = true, warning }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [warningHovered, setWarningHovered] = useState(false);

  return (
    <div style={{ borderBottom: `1px solid ${C.borderLight}` }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", cursor: "pointer",
          transition: `background ${DURATION.micro}ms ${EASE.snappy}`, minHeight: 32,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 11, fontWeight: 500, color: C.fgDim }}>{title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {warning && (
            <span
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setWarningHovered(true)}
              onMouseLeave={() => setWarningHovered(false)}
              style={{
                position: "relative",
                fontSize: 12, lineHeight: 1, color: "#facc15",
                cursor: "help", padding: "0 2px",
              }}
            >
              ⚠
              {warningHovered && (
                <span
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 4,
                    background: "#18181b",
                    color: "#fafafa",
                    border: "1px solid #facc15",
                    borderRadius: 4,
                    padding: "6px 8px",
                    fontSize: 10,
                    lineHeight: 1.4,
                    width: 220,
                    zIndex: 100,
                    fontWeight: 400,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    pointerEvents: "none",
                  }}
                >
                  {warning}
                </span>
              )}
            </span>
          )}
          <span
            style={{
              display: "flex", alignItems: "center",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: `transform 150ms ${EASE.smooth}`,
            }}
          >
            <ChevronRight size={12} style={{ color: C.fgDim, flexShrink: 0 }} />
          </span>
        </div>
      </div>
      <ExpandY open={open}>
        <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {children}
        </div>
      </ExpandY>
    </div>
  );
}

export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 26 }}>
      <span style={{ fontSize: 10, color: C.fgDim, width: 44, flexShrink: 0, fontWeight: 400 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, color: C.fgDim, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginTop: 2, marginBottom: -2 }}>
      {children}
    </div>
  );
}
