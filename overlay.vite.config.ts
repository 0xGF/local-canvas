import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import terser from "@rollup/plugin-terser";
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
      formats: ["es"],
      fileName: () => "overlay.js",
    },
    rollupOptions: {
      external: [],
      // Vite lib-mode ES silently skips minification — wire terser in directly.
      plugins: [terser()],
      output: {
        chunkFileNames: "chunk-[hash].js",
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
