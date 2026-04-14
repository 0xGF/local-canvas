import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "../icons.js";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

import { THEME } from "../../theme.js";
const C = THEME;

export function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ borderBottom: `1px solid ${C.borderLight}` }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", cursor: "pointer",
          transition: "background 0.1s", minHeight: 32,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 11, fontWeight: 500, color: C.fgDim }}>{title}</span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: "flex", alignItems: "center" }}
        >
          <ChevronRight size={12} style={{ color: C.fgDim, flexShrink: 0 }} />
        </motion.span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
