import type { NextConfig } from "next";

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
  // paths should be relative to. The plugin handles the Turbopack quirk
  // where filenames come in already-stripped against its workspace root
  // — when the workspace root is above the project (e.g. a file:.. link
  // to an outside package, or a monorepo), it detects the overlap and
  // strips it without needing any further config.
  experimental: {
    swcPlugins: [
      ["local-canvas/swc", { projectRoot: __dirname }],
    ],
  },
};

export default nextConfig;
