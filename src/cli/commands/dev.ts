import chalk from "chalk";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
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

    tryAutoRegisterMCP();
  } catch (error) {
    console.error(chalk.red("\n  Failed to start:"), error);
    process.exit(1);
  }
}

/**
 * If the Claude Code CLI is installed, auto-register the local-canvas MCP
 * server the first time `local-canvas dev` runs. Idempotent — no-op when
 * already registered. Silent when `claude` isn't on PATH (user probably
 * uses a different agent, so we don't nag).
 *
 * Claude Code reads its MCP list at session start, so a running session
 * won't see the new server — we print a one-line hint telling the user
 * to restart any open sessions if we actually added it.
 */
function tryAutoRegisterMCP() {
  // Fast-exit if claude CLI isn't installed.
  const which = spawnSync("which", ["claude"], { stdio: ["ignore", "pipe", "ignore"] });
  if (which.status !== 0) return;

  // Already registered? Look for our name in `claude mcp list`.
  try {
    const list = execFileSync("claude", ["mcp", "list"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    if (/^local-canvas:/m.test(list)) return;
  } catch {
    // `mcp list` failed — claude might be an older version that doesn't
    // support the subcommand. Skip quietly rather than spam the user.
    return;
  }

  // Path to this binary's `mcp` entrypoint. After tsup bundles, this module
  // lives at `dist/cli/index.js`, so the package root is two directories up.
  // We walk from the current module so the path works whether invoked via
  // `npx local-canvas`, `node ./node_modules/.bin/local-canvas`, or the monorepo.
  const here = fileURLToPath(import.meta.url);
  const binPath = resolve(here, "..", "..", "..", "bin", "local-canvas.js");

  const add = spawnSync("claude", ["mcp", "add", "local-canvas", "--", "node", binPath, "mcp"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (add.status === 0) {
    console.log(chalk.dim("  Registered Claude MCP:"), chalk.green("local-canvas"));
    console.log(chalk.dim("  (restart any running Claude Code sessions to pick up the new tools)\n"));
  }
}
