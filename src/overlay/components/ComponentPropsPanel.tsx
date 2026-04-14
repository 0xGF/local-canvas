import React, { useCallback } from "react";
import { useComponentViewStore } from "../stores/component-view-store.js";
import { Section, PropRow } from "./ui/section.js";
import { CustomSelect } from "./ui/custom-select.js";
import { NumberInput } from "./ui/number-input.js";
import { X, Reset } from "./icons.js";
import type { ScannedProp } from "../../core/scanner/types.js";

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
  danger: "#f24822",
  success: "#14ae5c",
  mono: "'SF Mono','Fira Code','Fira Mono',monospace",
  font: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
};

export function ComponentPropsPanel() {
  const activeComponent = useComponentViewStore((s) => s.activeComponent);
  const propValues = useComponentViewStore((s) => s.propValues);
  const setPropValue = useComponentViewStore((s) => s.setPropValue);
  const resetPropValues = useComponentViewStore((s) => s.resetPropValues);

  if (!activeComponent) return null;

  const requiredProps = activeComponent.props.filter((p) => p.required);
  const optionalProps = activeComponent.props.filter((p) => !p.required);

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.fg }}>Props</span>
          <span style={{
            fontSize: 9, color: C.fgMuted, fontFamily: C.mono,
            background: C.bgAlt, padding: "1px 5px", borderRadius: 3,
          }}>
            {activeComponent.props.length}
          </span>
        </div>
        <button
          onClick={resetPropValues}
          title="Reset all props"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 4,
            border: "none", background: "transparent",
            color: C.fgMuted, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.fg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.fgMuted; }}
        >
          <Reset size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeComponent.props.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: C.fgMuted, fontSize: 11 }}>
            No typed props detected
          </div>
        ) : (
          <>
            {requiredProps.length > 0 && (
              <Section title="Required" defaultOpen>
                {requiredProps.map((prop) => (
                  <PropControl
                    key={prop.name}
                    prop={prop}
                    value={propValues[prop.name]}
                    onChange={(v) => setPropValue(prop.name, v)}
                  />
                ))}
              </Section>
            )}
            {optionalProps.length > 0 && (
              <Section title="Optional" defaultOpen>
                {optionalProps.map((prop) => (
                  <PropControl
                    key={prop.name}
                    prop={prop}
                    value={propValues[prop.name]}
                    onChange={(v) => setPropValue(prop.name, v)}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PropControl({ prop, value, onChange }: {
  prop: ScannedProp;
  value: any;
  onChange: (v: any) => void;
}) {
  const displayValue = value !== undefined ? value : prop.defaultValue;

  return (
    <PropRow label={prop.name}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Type badge */}
        <span style={{
          fontSize: 8, color: C.fgMuted, fontFamily: C.mono,
          background: C.bgAlt, padding: "0 4px", borderRadius: 2,
          flexShrink: 0, lineHeight: "16px",
        }}>
          {prop.type}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {prop.type === "boolean" && (
            <ToggleSwitch
              checked={value !== undefined ? value : prop.defaultValue === "true"}
              onChange={onChange}
            />
          )}
          {prop.type === "string" && (
            <input
              style={inputStyle}
              value={displayValue ?? ""}
              placeholder={prop.defaultValue || ""}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
          {prop.type === "number" && (
            <NumberInput
              label=""
              value={displayValue ?? ""}
              onChange={(v) => onChange(Number(v))}
            />
          )}
          {prop.type === "enum" && prop.enumValues && (
            <CustomSelect
              value={String(displayValue ?? "")}
              options={prop.enumValues.map((v) => ({ value: v }))}
              onChange={onChange}
            />
          )}
          {prop.type === "function" && (
            <span style={{ fontSize: 10, color: C.fgMuted, fontStyle: "italic" }}>
              (callback)
            </span>
          )}
          {prop.type === "object" && (
            <input
              style={inputStyle}
              value={typeof displayValue === "object" ? JSON.stringify(displayValue) : (displayValue ?? "")}
              placeholder="{}"
              onChange={(e) => {
                try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
              }}
            />
          )}
          {prop.type === "unknown" && (
            <input
              style={inputStyle}
              value={displayValue ?? ""}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </div>
      </div>
    </PropRow>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        border: "none", cursor: "pointer",
        background: checked ? C.accent : C.bgAlt,
        position: "relative", transition: "background 0.15s",
        padding: 0,
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: "50%",
        background: "#fff", position: "absolute",
        top: 2, left: checked ? 16 : 2,
        transition: "left 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  width: "100%", background: C.bg,
  display: "flex", flexDirection: "row",
  fontFamily: C.font, fontSize: 11, color: C.fg,
  WebkitFontSmoothing: "antialiased",
};

const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
  minHeight: 36,
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 24, background: C.bgAlt,
  border: "1px solid transparent", borderRadius: 4,
  color: C.fg, fontSize: 10, fontFamily: C.mono,
  padding: "0 6px", outline: "none",
};
