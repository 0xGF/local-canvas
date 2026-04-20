import type { Plugin } from "vite";
import { createHash } from "node:crypto";
import { transformSync } from "@babel/core";
import canvasEditorBabelPlugin, {
  type BabelPluginOptions,
} from "./babel-transform.js";

export interface CanvasEditorPluginOptions {
  /**
   * Absolute path to the project root. Defaults to Vite's resolved root
   * at `configResolved` time, falling back to `process.cwd()`.
   */
  projectRoot?: string;
}

export function localCanvasPlugin(
  options: CanvasEditorPluginOptions = {},
): Plugin {
  const cache = new Map<string, { hash: string; code: string; map: unknown }>();
  let projectRoot = options.projectRoot;

  return {
    name: "local-canvas-source-map",
    enforce: "pre",
    apply: "serve",

    configResolved(config) {
      if (!projectRoot) projectRoot = config.root;
    },

    transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return null;
      if (id.includes("node_modules")) return null;

      const hash = createHash("sha1").update(code).digest("hex");
      const hit = cache.get(id);
      if (hit && hit.hash === hash) {
        return { code: hit.code, map: hit.map as never };
      }

      const babelOpts: BabelPluginOptions = {
        projectRoot: projectRoot,
      };

      const result = transformSync(code, {
        filename: id,
        plugins: [
          ["@babel/plugin-syntax-jsx"],
          ["@babel/plugin-syntax-typescript", { isTSX: true }],
          [canvasEditorBabelPlugin, babelOpts],
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
