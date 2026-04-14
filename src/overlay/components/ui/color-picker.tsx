import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ColorPickerProps {
  label: string;
  prefix: string;
  classes: string[];
  onApply: (remove?: string[], add?: string[]) => void;
}

import { THEME } from "../../theme.js";
const C = THEME;

const COLORS = ["slate","gray","zinc","neutral","red","orange","amber","yellow","lime","green","emerald","teal","cyan","sky","blue","indigo","violet","purple","fuchsia","pink","rose"];
const SHADES = ["50","100","200","300","400","500","600","700","800","900","950"];
const SIMPLE = [
  { name: "white", bg: "#fff" },
  { name: "black", bg: "#000" },
  { name: "transparent", bg: "repeating-conic-gradient(#808080 0 25%,transparent 0 50%) 0/8px 8px" },
];

const TW_COLORS: Record<string, Record<string, string>> = {
  slate: { "50":"#f8fafc","100":"#f1f5f9","200":"#e2e8f0","300":"#cbd5e1","400":"#94a3b8","500":"#64748b","600":"#475569","700":"#334155","800":"#1e293b","900":"#0f172a","950":"#020617" },
  gray: { "50":"#f9fafb","100":"#f3f4f6","200":"#e5e7eb","300":"#d1d5db","400":"#9ca3af","500":"#6b7280","600":"#4b5563","700":"#374151","800":"#1f2937","900":"#111827","950":"#030712" },
  zinc: { "50":"#fafafa","100":"#f4f4f5","200":"#e4e4e7","300":"#d4d4d8","400":"#a1a1aa","500":"#71717a","600":"#52525b","700":"#3f3f46","800":"#27272a","900":"#18181b","950":"#09090b" },
  neutral: { "50":"#fafafa","100":"#f5f5f5","200":"#e5e5e5","300":"#d4d4d4","400":"#a3a3a3","500":"#737373","600":"#525252","700":"#404040","800":"#262626","900":"#171717","950":"#0a0a0a" },
  red: { "50":"#fef2f2","100":"#fee2e2","200":"#fecaca","300":"#fca5a5","400":"#f87171","500":"#ef4444","600":"#dc2626","700":"#b91c1c","800":"#991b1b","900":"#7f1d1d","950":"#450a0a" },
  orange: { "50":"#fff7ed","100":"#ffedd5","200":"#fed7aa","300":"#fdba74","400":"#fb923c","500":"#f97316","600":"#ea580c","700":"#c2410c","800":"#9a3412","900":"#7c2d12","950":"#431407" },
  amber: { "50":"#fffbeb","100":"#fef3c7","200":"#fde68a","300":"#fcd34d","400":"#fbbf24","500":"#f59e0b","600":"#d97706","700":"#b45309","800":"#92400e","900":"#78350f","950":"#451a03" },
  yellow: { "50":"#fefce8","100":"#fef9c3","200":"#fef08a","300":"#fde047","400":"#facc15","500":"#eab308","600":"#ca8a04","700":"#a16207","800":"#854d0e","900":"#713f12","950":"#422006" },
  lime: { "50":"#f7fee7","100":"#ecfccb","200":"#d9f99d","300":"#bef264","400":"#a3e635","500":"#84cc16","600":"#65a30d","700":"#4d7c0f","800":"#3f6212","900":"#365314","950":"#1a2e05" },
  green: { "50":"#f0fdf4","100":"#dcfce7","200":"#bbf7d0","300":"#86efac","400":"#4ade80","500":"#22c55e","600":"#16a34a","700":"#15803d","800":"#166534","900":"#14532d","950":"#052e16" },
  emerald: { "50":"#ecfdf5","100":"#d1fae5","200":"#a7f3d0","300":"#6ee7b7","400":"#34d399","500":"#10b981","600":"#059669","700":"#047857","800":"#065f46","900":"#064e3b","950":"#022c22" },
  teal: { "50":"#f0fdfa","100":"#ccfbf1","200":"#99f6e4","300":"#5eead4","400":"#2dd4bf","500":"#14b8a6","600":"#0d9488","700":"#0f766e","800":"#115e59","900":"#134e4a","950":"#042f2e" },
  cyan: { "50":"#ecfeff","100":"#cffafe","200":"#a5f3fc","300":"#67e8f9","400":"#22d3ee","500":"#06b6d4","600":"#0891b2","700":"#0e7490","800":"#155e75","900":"#164e63","950":"#083344" },
  sky: { "50":"#f0f9ff","100":"#e0f2fe","200":"#bae6fd","300":"#7dd3fc","400":"#38bdf8","500":"#0ea5e9","600":"#0284c7","700":"#0369a1","800":"#075985","900":"#0c4a6e","950":"#082f49" },
  blue: { "50":"#eff6ff","100":"#dbeafe","200":"#bfdbfe","300":"#93c5fd","400":"#60a5fa","500":"#3b82f6","600":"#2563eb","700":"#1d4ed8","800":"#1e40af","900":"#1e3a8a","950":"#172554" },
  indigo: { "50":"#eef2ff","100":"#e0e7ff","200":"#c7d2fe","300":"#a5b4fc","400":"#818cf8","500":"#6366f1","600":"#4f46e5","700":"#4338ca","800":"#3730a3","900":"#312e81","950":"#1e1b4b" },
  violet: { "50":"#f5f3ff","100":"#ede9fe","200":"#ddd6fe","300":"#c4b5fd","400":"#a78bfa","500":"#8b5cf6","600":"#7c3aed","700":"#6d28d9","800":"#5b21b6","900":"#4c1d95","950":"#2e1065" },
  purple: { "50":"#faf5ff","100":"#f3e8ff","200":"#e9d5ff","300":"#d8b4fe","400":"#c084fc","500":"#a855f7","600":"#9333ea","700":"#7e22ce","800":"#6b21a8","900":"#581c87","950":"#3b0764" },
  fuchsia: { "50":"#fdf4ff","100":"#fae8ff","200":"#f5d0fe","300":"#f0abfc","400":"#e879f9","500":"#d946ef","600":"#c026d3","700":"#a21caf","800":"#86198f","900":"#701a75","950":"#4a044e" },
  pink: { "50":"#fdf2f8","100":"#fce7f3","200":"#fbcfe8","300":"#f9a8d4","400":"#f472b6","500":"#ec4899","600":"#db2777","700":"#be185d","800":"#9d174d","900":"#831843","950":"#500724" },
  rose: { "50":"#fff1f2","100":"#ffe4e6","200":"#fecdd3","300":"#fda4af","400":"#fb7185","500":"#f43f5e","600":"#e11d48","700":"#be123c","800":"#9f1239","900":"#881337","950":"#4c0519" },
};

function getSwatchColor(name: string, shade: string): string {
  return TW_COLORS[name]?.[shade] || "#666";
}

function isColorValue(val: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(val) || /^rgba?\(/.test(val) || /^hsla?\(/.test(val);
}

function getCSSVariables(): { name: string; value: string }[] {
  const vars: { name: string; value: string }[] = [];
  const styles = getComputedStyle(document.documentElement);
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ":root") {
            for (const prop of rule.style) {
              if (prop.startsWith("--")) {
                const val = styles.getPropertyValue(prop).trim();
                if (isColorValue(val)) vars.push({ name: prop, value: val });
              }
            }
          }
        }
      } catch { /* cross-origin */ }
    }
  } catch { /* no access */ }
  return vars;
}

type Tab = "palette" | "variables" | "custom";

export function ColorPicker({ label, prefix, classes, onApply }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("palette");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [hexInput, setHexInput] = useState("");

  const current = classes.find((c: string) => {
    // Strip breakpoint prefix for matching
    const bare = c.replace(/^(sm|md|lg|xl|2xl):/, "");
    if (!bare.startsWith(prefix + "-")) return false;
    const val = bare.slice(prefix.length + 1);
    // Exclude non-color values: numeric sizes, font weights, alignment, arbitrary px/rem values
    if (/^[0-9]/.test(val)) return false; // text-xs → starts with letter (ok), text-2xl → starts with 2 (but it's a size)
    if (/^\[.*px\]$/.test(val) || /^\[.*rem\]$/.test(val) || /^\[.*em\]$/.test(val)) return false; // text-[15px]
    if (["left","center","right","justify","start","end","wrap","nowrap","ellipsis","clip"].includes(val)) return false;
    if (["xs","sm","base","lg","xl","2xl","3xl","4xl","5xl","6xl","7xl","8xl","9xl"].includes(val)) return false; // font sizes
    if (["thin","extralight","light","normal","medium","semibold","bold","extrabold","black"].includes(val)) return false; // weights
    if (bare === "border") return false;
    return true;
  });
  const display = current ? current.replace(`${prefix}-`, "") : "none";
  // Strip breakpoint prefix + property prefix for color lookups
  const currentBare = current ? current.replace(/^(sm|md|lg|xl|2xl):/, "").replace(`${prefix}-`, "") : "";

  let swatchBg = "transparent";
  if (currentBare) {
    const parts = currentBare.split("-");
    if (parts.length === 2) swatchBg = getSwatchColor(parts[0], parts[1]);
    else if (parts[0] === "white") swatchBg = "#fff";
    else if (parts[0] === "black") swatchBg = "#000";
    // Arbitrary value
    const arbMatch = currentBare.match(/\[(.+)\]/);
    if (arbMatch) swatchBg = arbMatch[1].replace("var(", "").replace(")", "");
  }

  const cssVars = useMemo(() => (tab === "variables" ? getCSSVariables() : []), [tab]);

  const applyColor = (colorClass: string) => {
    onApply(current ? [current] : undefined, [colorClass]);
    setOpen(false);
    setSelectedColor(null);
  };

  const tabStyle = (t: Tab): React.CSSProperties => ({
    flex: 1, padding: "4px 0", fontSize: 9, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? C.fg : C.fgMuted, background: tab === t ? C.bgAlt : "transparent",
    border: "none", borderRadius: 4, cursor: "pointer", transition: "all 0.12s",
    fontFamily: C.mono,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: C.fgMuted, width: 44, flexShrink: 0 }}>{label}</span>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: "flex", alignItems: "center", flex: 1, height: 26,
            background: C.bgAlt, border: `1px solid ${open ? C.border : "transparent"}`,
            borderRadius: 4, padding: "0 6px", cursor: "pointer", gap: 8,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
          onMouseLeave={e => (e.currentTarget.style.background = C.bgAlt)}
        >
          <div style={{ width: 14, height: 14, borderRadius: 3, border: "1px solid rgba(255,255,255,0.12)", background: swatchBg, flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</span>
        </button>
        {current && (
          <button onClick={() => onApply([current], undefined)} style={{ width: 20, height: 20, background: "transparent", border: "none", color: C.fgMuted, cursor: "pointer", fontSize: 12, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }} title="Remove">×</button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ marginTop: 6, padding: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6 }}>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 2, marginBottom: 8, background: "#161616", borderRadius: 5, padding: 2 }}>
                <button style={tabStyle("palette")} onClick={() => setTab("palette")}>Palette</button>
                <button style={tabStyle("variables")} onClick={() => setTab("variables")}>Variables</button>
                <button style={tabStyle("custom")} onClick={() => setTab("custom")}>Custom</button>
              </div>

              {/* Palette tab */}
              {tab === "palette" && (
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                    {SIMPLE.map(c => (
                      <button key={c.name} onClick={() => applyColor(`${prefix}-${c.name}`)} title={c.name} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)", background: c.bg, cursor: "pointer", padding: 0 }} />
                    ))}
                  </div>
                  {selectedColor ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <button onClick={() => setSelectedColor(null)} style={{ background: "none", border: "none", color: C.fgDim, cursor: "pointer", fontSize: 10, padding: 0 }}>← Back</button>
                        <span style={{ fontSize: 10, color: C.fg, fontWeight: 500 }}>{selectedColor}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 2 }}>
                        {SHADES.map(shade => (
                          <button key={shade} onClick={() => applyColor(`${prefix}-${selectedColor}-${shade}`)} title={`${selectedColor}-${shade}`} style={{ width: "100%", aspectRatio: "1", borderRadius: 3, border: currentBare === `${selectedColor}-${shade}` ? "2px solid #fff" : "1px solid rgba(255,255,255,0.08)", background: getSwatchColor(selectedColor, shade), cursor: "pointer", padding: 0 }} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                      {COLORS.map(color => (
                        <button key={color} onClick={() => setSelectedColor(color)} title={color} style={{ width: "100%", aspectRatio: "1", borderRadius: 3, border: "1px solid rgba(255,255,255,0.06)", background: getSwatchColor(color, "500"), cursor: "pointer", padding: 0 }} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Variables tab */}
              {tab === "variables" && (
                <div style={{ maxHeight: 180, overflowY: "auto" }}>
                  {cssVars.length === 0 ? (
                    <div style={{ padding: 12, textAlign: "center", color: C.fgMuted, fontSize: 10 }}>No CSS variables found in :root</div>
                  ) : (
                    cssVars.map(v => (
                      <button
                        key={v.name}
                        onClick={() => applyColor(`${prefix}-[var(${v.name})]`)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%",
                          padding: "4px 6px", background: "transparent", border: "none",
                          cursor: "pointer", borderRadius: 4, color: C.fg, fontSize: 10,
                          fontFamily: C.mono, textAlign: "left",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.bgHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid rgba(255,255,255,0.12)", background: v.value, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                        <span style={{ color: C.fgMuted, fontSize: 9, marginLeft: "auto", flexShrink: 0 }}>{v.value}</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Custom tab */}
              {tab === "custom" && (
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: hexInput || swatchBg, flexShrink: 0 }} />
                    <input
                      value={hexInput}
                      onChange={e => setHexInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && hexInput) {
                          applyColor(`${prefix}-[${hexInput}]`);
                          setHexInput("");
                        }
                      }}
                      placeholder="#ff5733 or rgb(...)"
                      style={{
                        flex: 1, height: 28, background: C.bgAlt, border: `1px solid ${C.border}`,
                        borderRadius: 4, color: C.fg, fontSize: 10, fontFamily: C.mono,
                        padding: "0 8px", outline: "none",
                      }}
                    />
                  </div>
                  <button
                    onClick={() => { if (hexInput) { applyColor(`${prefix}-[${hexInput}]`); setHexInput(""); } }}
                    disabled={!hexInput}
                    style={{
                      marginTop: 6, width: "100%", height: 26, borderRadius: 4,
                      border: "none", background: hexInput ? C.accent : C.bgAlt,
                      color: hexInput ? "#fff" : C.fgMuted, fontSize: 10, fontWeight: 500,
                      cursor: hexInput ? "pointer" : "default",
                    }}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
