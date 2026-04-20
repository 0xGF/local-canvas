import type { Plugin } from "vite";
import { createHash } from "node:crypto";
import { transformSync } from "@babel/core";
import canvasEditorBabelPlugin from "./babel-transform.js";

export function localCanvasPlugin(): Plugin {
  const cache = new Map<string, { hash: string; code: string; map: unknown }>();

  return {
    name: "local-canvas-source-map",
    enforce: "pre",
    apply: "serve",

    transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return null;
      if (id.includes("node_modules")) return null;

      const hash = createHash("sha1").update(code).digest("hex");
      const hit = cache.get(id);
      if (hit && hit.hash === hash) {
        return { code: hit.code, map: hit.map as never };
      }

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

      cache.set(id, { hash, code: result.code, map: result.map });
      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}

export { localCanvasPlugin as canvasEditorPlugin }; // backward compat
export default localCanvasPlugin;
