import { defineConfig } from "tsup";

// Two configs:
//  - Library entries (index + plugins) are emitted as dual ESM/CJS so
//    consumer projects can `import` or `require` them.
//  - CLI and MCP server are node binaries that we always invoke as ESM
//    (via bin/local-canvas.js + `type: module`), and they transitively
//    pull in `src/server/index.ts` which uses `import.meta.url`. Building
//    them as CJS would emit a broken bundle (`import.meta` is empty under
//    CJS and triggers the esbuild warning), so we scope them to ESM only.
export default defineConfig((options) => [
  {
    entry: {
      index: "src/index.ts",
      "plugin/vite": "src/plugin/vite.ts",
      "plugin/babel-transform": "src/plugin/babel-transform.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    target: "node18",
    platform: "node",
    external: ["vite", "react", "react-dom"],
    clean: !options.watch,
  },
  {
    entry: {
      "cli/index": "src/cli/index.ts",
      "mcp/server": "src/mcp/server.ts",
    },
    format: ["esm"],
    dts: true,
    target: "node18",
    platform: "node",
    external: ["vite", "react", "react-dom"],
    clean: false,
  },
]);
