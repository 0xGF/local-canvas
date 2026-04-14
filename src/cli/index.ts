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
  .option("-p, --port <port>", "Canvas editor server port", "3001")
  .option("--host <host>", "Target dev server host", "localhost")
  .option("-r, --root <path>", "Target project root directory", process.cwd())
  .action(devCommand);

program
  .command("init")
  .description("Add the canvas editor babel plugin to your project")
  .action(initCommand);

program.parse();
