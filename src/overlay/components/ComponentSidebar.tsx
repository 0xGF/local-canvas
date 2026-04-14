import React, { useEffect, useMemo } from "react";
import { useComponentViewStore } from "../stores/component-view-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { Search, ChevronRight, Reset } from "./icons.js";
import { Section } from "./ui/section.js";
import type { ScannedComponent, ScannedProp } from "../../core/scanner/types.js";

const C = {
  bg: "#1e1e1e",
  bgAlt: "#2c2c2c",
  bgHover: "#363636",
  fg: "#e0e0e0",
  fgDim: "#8c8c8c",
  fgMuted: "#5c5c5c",
  border: "#3a3a3a",
  borderLight: "#2f2f2f",
  accent: "#0c8ce9",
  mono: "'SF Mono','Fira Code','Fira Mono',monospace",
  font: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
};

export function ComponentSidebar() {
  const components = useComponentViewStore((s) => s.components);
  const isScanning = useComponentViewStore((s) => s.isScanning);
  const setComponents = useComponentViewStore((s) => s.setComponents);
  const setIsScanning = useComponentViewStore((s) => s.setIsScanning);
  const searchQuery = useComponentViewStore((s) => s.searchQuery);
  const setSearchQuery = useComponentViewStore((s) => s.setSearchQuery);
  const activeComponent = useComponentViewStore((s) => s.activeComponent);
  const setActiveComponent = useComponentViewStore((s) => s.setActiveComponent);
  const propValues = useComponentViewStore((s) => s.propValues);
  const setPropValue = useComponentViewStore((s) => s.setPropValue);
  const resetPropValues = useComponentViewStore((s) => s.resetPropValues);
  const { send, onMessage } = useWebSocket();

  // Scan on mount — register handler first, then send request
  useEffect(() => {
    const unsubscribe = onMessage((msg: any) => {
      if (msg.type === "components-scanned") {
        setComponents(msg.components);
        setIsScanning(false);
      }
    });

    // Small delay to ensure WS is connected before sending
    const timer = setTimeout(() => {
      setIsScanning(true);
      send({ type: "scan-components" } as any);
    }, 500);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [send, onMessage, setComponents, setIsScanning]);

  // Group components by directory
  const grouped = useMemo(() => {
    const filtered = searchQuery
      ? components.filter((c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : components;

    const groups: Record<string, ScannedComponent[]> = {};
    for (const comp of filtered) {
      const dir = comp.filePath.split("/").slice(0, -1).join("/") || "src";
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(comp);
    }
    return groups;
  }, [components, searchQuery]);

  return (
    <div style={sidebarStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.fg }}>Components</span>
        <span style={{ fontSize: 10, color: C.fgMuted }}>
          {isScanning ? "Scanning..." : `${components.length}`}
        </span>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: C.bgAlt, borderRadius: 4, padding: "0 8px",
          height: 28,
        }}>
          <Search size={12} style={{ color: C.fgMuted, flexShrink: 0 }} />
          <input
            style={{
              flex: 1, background: "transparent", border: "none",
              color: C.fg, fontSize: 11, outline: "none",
              fontFamily: C.font,
            }}
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Component list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {Object.entries(grouped).map(([dir, comps]) => (
          <div key={dir}>
            <div style={{
              padding: "6px 12px", fontSize: 9, color: C.fgMuted,
              textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600,
              fontFamily: C.mono,
            }}>
              {dir}
            </div>
            {comps.map((comp) => {
              const isActive = activeComponent?.name === comp.name && activeComponent?.filePath === comp.filePath;
              return (
                <div
                  key={`${comp.filePath}:${comp.name}`}
                  onClick={() => setActiveComponent(comp)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 12px", cursor: "pointer",
                    background: isActive ? "rgba(12,140,233,0.15)" : "transparent",
                    borderLeft: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = C.bgHover; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: isActive ? C.accent : C.bgAlt,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 600,
                    color: isActive ? "#fff" : C.fgDim,
                    flexShrink: 0, fontFamily: C.mono,
                  }}>
                    {comp.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.fg, fontWeight: 500 }}>{comp.name}</div>
                    <div style={{ fontSize: 9, color: C.fgMuted, fontFamily: C.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {comp.props.length} props
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ color: C.fgMuted, flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        ))}
        {!isScanning && components.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: C.fgMuted, fontSize: 11 }}>
            No components found in project
          </div>
        )}
      </div>

      {/* Props editor - inline in sidebar */}
      {activeComponent && activeComponent.props.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, overflowY: "auto", maxHeight: "40%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.fg }}>Props</span>
            <button
              onClick={resetPropValues}
              style={{ background: "none", border: "none", color: C.fgMuted, cursor: "pointer", display: "flex", alignItems: "center" }}
              title="Reset"
            >
              <Reset size={12} />
            </button>
          </div>
          {activeComponent.props.map(prop => (
            <div key={prop.name} style={{ padding: "3px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: C.fg, fontWeight: 500 }}>{prop.name}</span>
                <span style={{ fontSize: 8, color: C.fgMuted, fontFamily: C.mono }}>{prop.type}</span>
              </div>
              <PropInput prop={prop} value={propValues[prop.name]} onChange={v => setPropValue(prop.name, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PropInput({ prop, value, onChange }: { prop: ScannedProp; value: any; onChange: (v: any) => void }) {
  const display = value !== undefined ? value : prop.defaultValue;
  if (prop.type === "boolean") {
    const checked = value !== undefined ? value : prop.defaultValue === "true";
    return (
      <button onClick={() => onChange(!checked)} style={{
        width: 32, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
        background: checked ? C.accent : C.bgAlt, position: "relative", padding: 0,
      }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: checked ? 16 : 2, transition: "left 0.15s" }} />
      </button>
    );
  }
  if (prop.type === "enum" && prop.enumValues) {
    return (
      <select
        value={String(display ?? "")}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", height: 24, background: C.bgAlt, border: `1px solid ${C.borderLight}`, borderRadius: 4, color: C.fg, fontSize: 10, fontFamily: C.mono, padding: "0 6px", outline: "none" }}
      >
        {prop.enumValues.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  return (
    <input
      value={display ?? ""}
      placeholder={prop.defaultValue || ""}
      onChange={e => {
        if (prop.type === "number") onChange(Number(e.target.value));
        else onChange(e.target.value);
      }}
      style={{ width: "100%", height: 24, background: C.bgAlt, border: `1px solid transparent`, borderRadius: 4, color: C.fg, fontSize: 10, fontFamily: C.mono, padding: "0 6px", outline: "none" }}
    />
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 240, height: "100%", background: C.bg,
  borderRight: `1px solid ${C.border}`,
  display: "flex", flexDirection: "column",
  fontFamily: C.font, fontSize: 11, color: C.fg,
  WebkitFontSmoothing: "antialiased",
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
  minHeight: 36,
};
