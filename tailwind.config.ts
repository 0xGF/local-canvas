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
    },
  },
  plugins: [],
};

export default config;
