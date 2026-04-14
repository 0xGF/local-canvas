import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({}),
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/overlay/index.tsx"),
      formats: ["iife"],
      name: "CanvasEditorOverlay",
      fileName: "overlay",
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
      },
    },
    cssCodeSplit: false,
    cssMinify: true,
    outDir: "dist/overlay",
    emptyOutDir: true,
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
