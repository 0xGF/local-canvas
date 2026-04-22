#!/usr/bin/env node

import { Command } from "commander";
import { devCommand } from "./commands/dev.js";
import { initCommand } from "./commands/init.js";

const program = new Command();

program
  .name("local-canvas")
  .description("Visual editor for React apps that writes to source code")
  .version("0.1.0");

program
  .command("dev")
  .description("Start the canvas editor overlay on your dev server")
  .option("-t, --target <port>", "Target dev server port", "3000")
  .option("-p, --port <port>", "Canvas editor server port", "6966")
  .option("--host <host>", "Target dev server host", "localhost")
  .option("-r, --root <path>", "Target project root directory", process.cwd())
  .action(devCommand);

program
  .command("init")
  .description("Add the canvas editor babel plugin to your project")
  .action(initCommand);

program
  .command("mcp")
  .description("Start the MCP stdio server (for `claude mcp add local-canvas -- npx local-canvas mcp`)")
  .option("-p, --port <port>", "Canvas editor port to bridge to", "6966")
  .action(async (opts: { port: string }) => {
    const { startMCPServer } = await import("../mcp/server.js");
    await startMCPServer(Number(opts.port));
  });

program.parse();
