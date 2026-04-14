import type { Plugin } from "vite";
import { transformSync } from "@babel/core";
import canvasEditorBabelPlugin from "./babel-transform.js";

export function localCanvasPlugin(): Plugin {
  return {
    name: "local-canvas-source-map",
    enforce: "pre",
    apply: "serve",

    transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return null;
      if (id.includes("node_modules")) return null;

      const result = transformSync(code, {
        filename: id,
        plugins: [
          ["@babel/plugin-syntax-jsx"],
          ["@babel/plugin-syntax-typescript", { isTSX: true }],
          [canvasEditorBabelPlugin],
        ],
        sourceMaps: true,
        configFile: false,
        babelrc: false,
      });

      if (!result?.code) return null;

      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}

export { localCanvasPlugin as canvasEditorPlugin }; // backward compat
export default localCanvasPlugin;
