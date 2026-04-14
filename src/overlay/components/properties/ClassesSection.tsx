import React, { useState } from "react";
import { usePropertyHelpers } from "./PropertyContext.js";
import { Section } from "../ui/section.js";
import { THEME } from "../../theme.js";

const C = THEME;

export const ClassesSection = React.memo(function ClassesSection() {
  const { sel, classes, trackedSendMutation } = usePropertyHelpers();
  const [newCls, setNewCls] = useState("");
  if (!sel) return null;

  return (
    <Section title="Classes" defaultOpen={false}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {classes.map((c: string) => (
          <span
            key={c}
            onClick={() => trackedSendMutation({ type: "modify-class", source: sel.source, remove: [c] })}
            title={`Click to remove: ${c}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: C.bgAlt, border: `1px solid ${C.borderLight}`,
              borderRadius: 4, padding: "2px 6px",
              fontSize: 10, fontFamily: C.mono, color: C.fg,
              cursor: "pointer", transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.background = "rgba(242,72,34,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.borderLight; e.currentTarget.style.background = C.bgAlt; }}
          >
            {c}
            <span style={{ color: C.fgMuted, fontSize: 10, transition: "color 0.12s" }}>x</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          style={{
            flex: 1, height: 28, background: C.bgAlt,
            border: "1px solid transparent", borderRadius: 6,
            color: C.fg, fontSize: 11, fontFamily: C.mono,
            padding: "0 8px", outline: "none",
            transition: "border-color 0.15s",
          }}
          placeholder="Add class..."
          value={newCls}
          onChange={e => setNewCls(e.target.value)}
          onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
          onBlur={e => (e.currentTarget.style.borderColor = "transparent")}
          onKeyDown={e => {
            if (e.key === "Enter" && newCls.trim()) {
              trackedSendMutation({ type: "modify-class", source: sel.source, add: [newCls.trim()] });
              setNewCls("");
            }
          }}
        />
        <button
          onClick={() => {
            if (newCls.trim()) {
              trackedSendMutation({ type: "modify-class", source: sel.source, add: [newCls.trim()] });
              setNewCls("");
            }
          }}
          style={{
            width: 28, height: 28, background: C.accent,
            border: "none", borderRadius: 6, color: "#fff",
            fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.12s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#3da8f5")}
          onMouseLeave={e => (e.currentTarget.style.background = C.accent)}
        >
          +
        </button>
      </div>
    </Section>
  );
});
