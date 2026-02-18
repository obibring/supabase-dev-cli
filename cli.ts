import { Command } from "commander";
import chalk from "chalk";
import { findProjectRoot } from "./lib/config.js";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { cleanupCommand } from "./commands/cleanup.js";
import { nukeCommand } from "./commands/nuke.js";
import type { CommandContext } from "./lib/types.js";

const INTERACTIVE_CHOICES = [
  {
    value: "start",
    name: "start   — Spin up an isolated Supabase instance for this worktree",
  },
  {
    value: "stop",
    name: "stop    — Tear down the instance and restore files",
  },
  {
    value: "status",
    name: "status  — Show all active instances",
  },
  {
    value: "cleanup",
    name: "cleanup — Remove stale instances (deleted worktrees)",
  },
  {
    value: "nuke",
    name: "nuke    — Stop ALL instances everywhere",
  },
  {
    value: "init",
    name: "init    — Set up this project for supabase-worktree",
  },
] as const;

function buildContext(opts: {
  interactive?: boolean;
  verbose?: boolean;
  projectRoot?: string;
}): CommandContext {
  const isCI = !process.stdout.isTTY || !!process.env.CI;
  return {
    interactive: opts.interactive ?? !isCI,
    verbose: opts.verbose ?? false,
    projectRoot: opts.projectRoot ?? findProjectRoot(),
  };
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("sb-worktree")
    .description(
      "Manage multiple parallel Supabase instances across git worktrees"
    )
    .version("1.0.0")
    .option("--no-interactive", "Disable interactive prompts (for CI/agents)")
    .option("--ci", "Alias for --no-interactive")
    .option("-v, --verbose", "Show detailed output")
    .option(
      "--project-root <path>",
      "Override project root detection"
    );

  program
    .command("init")
    .description(
      "Initialize the project: detect files, write config to package.json, set up templates"
    )
    .action(async () => {
      const ctx = buildContext(program.opts());
      await initCommand(ctx);
    });

  program
    .command("start")
    .description(
      "Allocate ports, generate config.toml, update .env files, and start Supabase"
    )
    .action(async () => {
      const ctx = buildContext(program.opts());
      await startCommand(ctx);
    });

  program
    .command("stop")
    .description(
      "Stop Supabase, restore .env files, clean up generated config"
    )
    .action(async () => {
      const ctx = buildContext(program.opts());
      await stopCommand(ctx);
    });

  program
    .command("status")
    .description("Show all active Supabase worktree instances")
    .action(async () => {
      const ctx = buildContext(program.opts());
      await statusCommand(ctx);
    });

  program
    .command("cleanup")
    .description(
      "Find and remove stale instances whose worktree directories no longer exist"
    )
    .action(async () => {
      const ctx = buildContext(program.opts());
      await cleanupCommand(ctx);
    });

  program
    .command("nuke")
    .description(
      "Stop ALL tracked Supabase instances and clear the registry"
    )
    .action(async () => {
      const ctx = buildContext(program.opts());
      await nukeCommand(ctx);
    });

  // When no command is given, show interactive menu or help
  program.action(async () => {
    const opts = program.opts();
    const isCI = !process.stdout.isTTY || !!process.env.CI;
    const interactive = opts.interactive !== false && !opts.ci && !isCI;

    if (!interactive) {
      program.help();
      return;
    }

    // Interactive mode
    console.log(
      chalk.bold("\n🗄️  supabase-worktree") +
        chalk.dim(" — manage parallel Supabase instances\n")
    );

    const { select } = await import("@inquirer/prompts");
    const choice = await select({
      message: "What would you like to do?",
      choices: INTERACTIVE_CHOICES.map((c) => ({
        value: c.value,
        name: c.name,
      })),
    });

    const ctx = buildContext(opts);

    switch (choice) {
      case "init":
        return initCommand(ctx);
      case "start":
        return startCommand(ctx);
      case "stop":
        return stopCommand(ctx);
      case "status":
        return statusCommand(ctx);
      case "cleanup":
        return cleanupCommand(ctx);
      case "nuke":
        return nukeCommand(ctx);
    }
  });

  return program;
}
