import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `experimental.swcPlugins` is Next's own config key — the plugin API
  // itself is stable (styled-components, emotion, relay-compiler all ship
  // through it), Next just hasn't promoted this option out of experimental.
  //
  // The bare-module specifier is resolved by Next/Turbopack through
  // node_modules and lands on the WASM at `./dist/plugin/swc/local_canvas_swc_plugin.wasm`
  // via the package's `./swc` subpath export.
  experimental: {
    swcPlugins: [["local-canvas/swc", {}]],
  },

  // Pin the Turbopack workspace root to this package so paths stamped into
  // `data-source-file` are relative to this project (e.g. `src/app/page.tsx`),
  // not to the repo root of local-canvas itself. `next dev` runs from the
  // project dir, so cwd works here and avoids ESM/CJS import.meta shenanigans
  // in next.config.ts.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
