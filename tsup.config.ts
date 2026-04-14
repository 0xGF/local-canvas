import { defineConfig } from "tsup";

export default defineConfig((options) => [
  {
    entry: {
      "cli/index": "src/cli/index.ts",
      index: "src/index.ts",
      "plugin/vite": "src/plugin/vite.ts",
      "plugin/babel-transform": "src/plugin/babel-transform.ts",
      "mcp/server": "src/mcp/server.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    target: "node18",
    platform: "node",
    external: ["vite", "react", "react-dom"],
    clean: !options.watch,
  },
]);
