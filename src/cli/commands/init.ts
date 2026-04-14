import chalk from "chalk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export async function initCommand() {
  const cwd = process.cwd();

  // Detect project type
  const viteConfig = findConfig(cwd, [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
  ]);
  const nextConfig = findConfig(cwd, [
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
  ]);
  const webpackConfig = findConfig(cwd, [
    "webpack.config.ts",
    "webpack.config.js",
  ]);

  if (viteConfig) {
    addToViteConfig(viteConfig);
  } else if (nextConfig) {
    printBabelInstructions("Next.js");
  } else if (webpackConfig) {
    printBabelInstructions("Webpack");
  } else {
    printProxyInstructions();
  }
}

function findConfig(cwd: string, names: string[]): string | null {
  for (const name of names) {
    const fullPath = resolve(cwd, name);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

function addToViteConfig(configPath: string) {
  const content = readFileSync(configPath, "utf-8");

  if (content.includes("canvasEditorPlugin")) {
    console.log(
      chalk.yellow("\n  Canvas editor plugin already configured.\n")
    );
    return;
  }

  const importLine = `import { canvasEditorPlugin } from "local-canvas/plugin";\n`;
  const updatedContent = importLine + content.replace(
    /plugins:\s*\[/,
    "plugins: [\n    canvasEditorPlugin(),"
  );

  writeFileSync(configPath, updatedContent);
  console.log(chalk.green("\n  Added canvasEditorPlugin to " + configPath.split("/").pop() + "\n"));
}

function printBabelInstructions(framework: string) {
  console.log(`
  ${chalk.bold("local-canvas")} ${chalk.dim("—")} ${framework} detected

  ${chalk.cyan("Option 1:")} Add the Babel plugin to your config:

    ${chalk.dim("// .babelrc or babel.config.js")}
    ${chalk.white(`{ "plugins": ["local-canvas/babel"] }`)}

  ${chalk.cyan("Option 2:")} Use proxy-only mode (no build plugin needed):

    ${chalk.white("npx local-canvas dev --target 3000")}

    Source mapping falls back to React DevTools fiber data.
    Works out of the box with any dev server.
`);
}

function printProxyInstructions() {
  console.log(`
  ${chalk.bold("local-canvas")} ${chalk.dim("—")} No config file detected

  Start your dev server on any port, then run:

    ${chalk.white("npx local-canvas dev --target 3000")}

  The editor proxy starts on port ${chalk.cyan("3001")} and injects the
  overlay into your app. No build plugin needed — source mapping
  uses React DevTools fiber data automatically.
`);
}
