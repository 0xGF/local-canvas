import React from "react";
import { ComponentSidebar } from "./ComponentSidebar.js";
import { ComponentCanvas } from "./ComponentCanvas.js";
import { useComponentViewStore } from "../stores/component-view-store.js";

const DOT_BG = "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)";

export function ComponentView() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        display: "flex",
        pointerEvents: "auto",
        zIndex: 2147483640,
        background: "#0f0f0f",
        backgroundImage: DOT_BG,
        backgroundSize: "20px 20px",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Sidebar with components + props */}
      <ComponentSidebar />
      {/* Canvas area */}
      <ComponentCanvas />
    </div>
  );
}
