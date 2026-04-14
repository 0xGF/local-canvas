import React, { useRef, useEffect, useCallback, useState } from "react";
import { useComponentViewStore } from "../stores/component-view-store.js";
import { useEditorStore } from "../stores/editor-store.js";
import { useViewportStore } from "../hooks/useViewport.js";
import { THEME } from "../theme.js";

const C = THEME;

/**
 * Single iframe component preview.
 * Uses the same breakpoint as the main editor — no separate Mobile/Tablet/Desktop.
 */
export function ComponentCanvas() {
  const activeComponent = useComponentViewStore((s) => s.activeComponent);
  const propValues = useComponentViewStore((s) => s.propValues);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(600);

  const frameWidth = breakpoint || 1280;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "preview-ready") {
        if (iframeRef.current?.contentWindow === e.source) setReady(true);
      }
      if (e.data?.type === "rendered" && e.data.height > 0) {
        setHeight(Math.max(200, e.data.height + 48));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const buildProps = useCallback(() => {
    if (!activeComponent) return {};
    const props: Record<string, any> = {};
    for (const p of activeComponent.props) {
      if (p.type === "function") continue;
      const userValue = propValues[p.name];
      if (userValue !== undefined) {
        props[p.name] = userValue;
      } else if (p.defaultValue !== undefined) {
        try { props[p.name] = JSON.parse(p.defaultValue); }
        catch { props[p.name] = p.defaultValue.replace(/^["']|["']$/g, ""); }
      } else {
        // Generate sensible defaults for required props with no default
        if (p.type === "string") props[p.name] = p.name;
        else if (p.type === "number") props[p.name] = 0;
        else if (p.type === "boolean") props[p.name] = false;
      }
    }
    return props;
  }, [activeComponent, propValues]);

  useEffect(() => {
    if (!activeComponent || !ready) return;
    const props = buildProps();
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({
        type: "render",
        componentPath: activeComponent.filePath,
        componentName: activeComponent.name,
        props,
      }, "*");
    }, 50);
    return () => clearTimeout(t);
  }, [activeComponent, propValues, ready, buildProps]);

  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);

  if (!activeComponent) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: C.bgAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: C.fgMuted }}>◇</div>
        <span style={{ color: C.fgMuted, fontSize: 13 }}>Select a component from the sidebar</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.fg }}>{activeComponent.name}</span>
        <span style={{ fontSize: 10, color: C.fgMuted, fontFamily: C.mono }}>{activeComponent.filePath}</span>
        <span style={{ fontSize: 10, color: C.fgDim, fontFamily: C.mono, marginLeft: "auto" }}>{frameWidth}px</span>
      </div>
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, left: 0,
          transformOrigin: "0 0",
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          display: "flex", flexDirection: "column", alignItems: "center", padding: 40,
        }}>
          <div style={{ marginBottom: 12, userSelect: "none" }}>
            <span style={{ fontSize: 11, color: "#666", fontFamily: C.mono }}>{frameWidth}px</span>
          </div>
          <div style={{
            width: frameWidth, background: "#fff", borderRadius: 8,
            boxShadow: "0 4px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}>
            <iframe
              ref={iframeRef}
              src="/__canvas/component-preview"
              style={{ width: frameWidth, height, border: "none", display: "block", background: "#fff" }}
              title={`${activeComponent.name} preview`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
