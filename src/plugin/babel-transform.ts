import type { PluginObj } from "@babel/core";
import { relative } from "path";

interface PluginState {
  filename?: string;
  cwd?: string;
}

export default function canvasEditorBabelPlugin({
  types: t,
}: {
  types: typeof import("@babel/core").types;
}): PluginObj<PluginState> {
  return {
    name: "local-canvas-source-map",
    visitor: {
      JSXOpeningElement(path, state) {
        const loc = path.node.loc;
        if (!loc) return;

        const filePath = state.filename;
        if (!filePath) return;

        const cwd = state.cwd || process.cwd();
        const relativePath = relative(cwd, filePath);

        // Skip if already has source mapping attributes
        const hasAttr = path.node.attributes.some(
          (attr) =>
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "data-source-file"
        );
        if (hasAttr) return;

        // Skip fragments
        const name = path.node.name;
        if (
          name.type === "JSXIdentifier" &&
          (name.name === "Fragment" || name.name === "")
        )
          return;
        if (
          name.type === "JSXMemberExpression" &&
          name.property.name === "Fragment"
        )
          return;

        const line = loc.start.line;
        const col = loc.start.column;

        path.node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier("data-source-file"),
            t.stringLiteral(relativePath)
          ),
          t.jsxAttribute(
            t.jsxIdentifier("data-source-line"),
            t.stringLiteral(String(line))
          ),
          t.jsxAttribute(
            t.jsxIdentifier("data-source-col"),
            t.stringLiteral(String(col))
          )
        );
      },
    },
  };
}
