import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import terser from "@rollup/plugin-terser";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

// Set ANALYZE=1 (e.g. `ANALYZE=1 npm run build:overlay`) to emit a treemap at
// `dist/overlay/bundle-stats.html` for inspecting what's in the main chunk.
const ANALYZE = process.env.ANALYZE === "1";

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
      // drop_console strips console.* calls from the prod bundle so debug logs
      // don't leak into users' consoles on every page load.
      plugins: [
        terser({ compress: { drop_console: true } }),
        ...(ANALYZE
          ? [
              visualizer({
                filename: "dist/overlay/bundle-stats.html",
                template: "treemap",
                gzipSize: true,
                brotliSize: true,
                sourcemap: false,
              }),
            ]
          : []),
      ],
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
