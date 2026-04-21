import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/overlay/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: "hsl(var(--canvas-bg))",
          fg: "hsl(var(--canvas-fg))",
          muted: "hsl(var(--canvas-muted))",
          "muted-fg": "hsl(var(--canvas-muted-fg))",
          border: "hsl(var(--canvas-border))",
          accent: "hsl(var(--canvas-accent))",
          "accent-fg": "hsl(var(--canvas-accent-fg))",
          destructive: "hsl(var(--canvas-destructive))",
        },
      },
      borderRadius: {
        canvas: "var(--canvas-radius)",
      },
      keyframes: {
        "canvas-halftone-shimmer": {
          "0%":   { "background-position": "200% 0" },
          "100%": { "background-position": "-100% 0" },
        },
        "canvas-halftone-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "canvas-halftone-shimmer": "canvas-halftone-shimmer 2.6s linear infinite",
        "canvas-halftone-in": "canvas-halftone-in 0.25s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
