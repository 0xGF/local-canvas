import React, { useEffect, useState } from "react";
import { THEME } from "../theme.js";

const C = THEME;

// Below this width the toolbar/panels don't have room to lay out, and the
// product is desktop-only anyway — show a block screen instead.
export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= DESKTOP_MIN_WIDTH
  );

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isDesktop;
}

function Wordmark() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 12,
          background: C.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px rgba(12,140,233,0.35)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 14V20H10M20 10V4H14M20 4L14 10M4 20L10 14"
            stroke="#ffffff"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span
        style={{
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: C.fg,
        }}
      >
        local canvas
      </span>
    </div>
  );
}

export function DesktopOnlyGate() {
  return (
    <div
      role="dialog"
      aria-label="Local Canvas is desktop only"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: C.bg,
        color: C.fg,
        fontFamily: C.font,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        textAlign: "center",
        pointerEvents: "auto",
      }}
    >
      <Wordmark />

      <h1
        style={{
          marginTop: 40,
          marginBottom: 12,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: C.fg,
        }}
      >
        Only Available On Desktop
      </h1>

      <p
        style={{
          margin: 0,
          maxWidth: 360,
          fontSize: 14,
          lineHeight: 1.55,
          color: C.fgDim,
        }}
      >
        Local Canvas is a dev tool built for a full-size screen. To preview your
        app at smaller breakpoints, open it on desktop and use the breakpoint
        switcher in the toolbar.
      </p>
    </div>
  );
}
