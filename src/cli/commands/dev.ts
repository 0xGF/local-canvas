import chalk from "chalk";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { createServer } from "../../server/index.js";

interface DevOptions {
  target?: string;
  port?: string;
  host?: string;
  root?: string;
}

interface LegacyDevConfig {
  target?: number;
  port?: number;
  host?: string;
  root?: string;
}

/** Read .local-canvas.json from the project root (server/port/host config). */
function loadLegacyConfig(root: string): LegacyDevConfig {
  const configPath = resolve(root, ".local-canvas.json");
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

export async function devCommand(options: DevOptions) {
  const root = options.root || process.cwd();
  const config = loadLegacyConfig(root);

  // CLI flags > config file > defaults
  const targetPort = parseInt(options.target || String(config.target || 3000), 10);
  const serverPort = parseInt(options.port || String(config.port || 6966), 10);
  const targetHost = options.host || config.host || "localhost";
  const projectRoot = config.root ? resolve(root, config.root) : root;

  console.log(
    chalk.bold("\n  local-canvas"),
    chalk.dim("v0.1.0"),
    "\n"
  );
  console.log(chalk.dim("  Target:"), `http://${targetHost}:${targetPort}`);
  console.log(chalk.dim("  Editor:"), `http://localhost:${serverPort}`);
  console.log(chalk.dim("  Project:"), projectRoot);
  console.log();

  try {
    await createServer({
      targetHost,
      targetPort,
      serverPort,
      projectRoot,
    });

    console.log(
      chalk.green("  Ready!"),
      chalk.dim("Open"),
      chalk.cyan(`http://localhost:${serverPort}`),
      chalk.dim("in your browser\n")
    );
  } catch (error) {
    console.error(chalk.red("\n  Failed to start:"), error);
    process.exit(1);
  }
}
