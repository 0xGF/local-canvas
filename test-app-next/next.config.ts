import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // `experimental.swcPlugins` is Next's own config key — the plugin API
  // itself is stable (styled-components, emotion, relay-compiler all ship
  // through it), Next just hasn't promoted this option out of experimental.
  //
  // The bare-module specifier is resolved by Next/Turbopack through
  // node_modules and lands on the WASM at
  // `./dist/plugin/swc/local_canvas_swc_plugin.wasm` via the package's
  // `./swc` subpath export.
  //
  // `projectRoot` tells the plugin which directory `data-source-file`
  // paths should be relative to. Without it, Turbopack hands the plugin
  // filenames already stripped against its own workspace root (which can
  // be above this project when a lockfile exists further up, common in
  // monorepos). The plugin joins those with the host CWD before computing
  // relative-to-projectRoot, so the stamped paths come out clean
  // (`src/app/page.tsx`, not `apps/web/src/app/page.tsx`).
  experimental: {
    swcPlugins: [
      ["local-canvas/swc", { projectRoot: __dirname }],
    ],
  },

  // Consuming `local-canvas` via `file:..` means npm symlinks the package
  // into our node_modules but the real files live one directory up (the
  // local-canvas repo root). Per Next 16's turbopack docs, when any linked
  // dependency lives outside the project root, `turbopack.root` must be
  // the common parent of both the project and the linked dep.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
