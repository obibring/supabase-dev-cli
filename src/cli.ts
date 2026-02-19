import { Command } from "commander";
import chalk from "chalk";
import { findProjectRoot, loadConfig } from "./lib/config.js";
import { CommandError } from "./lib/errors.js";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { cleanupCommand } from "./commands/cleanup.js";
import { nukeCommand } from "./commands/nuke.js";
import { instructionsCommand } from "./commands/instructions.js";
import { usageCommand } from "./commands/usage.js";
import { configCommand } from "./commands/config.js";
import { supabaseStop } from "./lib/exec.js";
import { restoreAllEnvFiles } from "./lib/env.js";
import { unregisterWorktree } from "./lib/registry.js";
import type { CommandContext } from "./lib/types.js";

/**
 * Tracks the project root of an instance started during this interactive
 * session.  Set after a successful `start`, cleared after `stop` / `nuke`.
 */
let activeSessionRoot: string | null = null;

/**
 * Gracefully stop the Supabase instance that was started during this
 * interactive session.  Idempotent — safe to call multiple times.
 */
async function cleanupActiveSession(): Promise<void> {
  if (!activeSessionRoot) return;

  const root = activeSessionRoot;
  activeSessionRoot = null; // prevent re-entry from concurrent signals

  console.log(
    chalk.yellow("\n⏳ Stopping Supabase instance before exit...\n")
  );

  try {
    await supabaseStop(root);
    console.log(chalk.green("  ✓ Supabase stopped"));
  } catch {
    console.log(
      chalk.yellow("  ⚠ Could not stop Supabase cleanly (may need manual cleanup)")
    );
  }

  try {
    const config = await loadConfig(root);
    const restored = await restoreAllEnvFiles({
      patterns: config?.envFiles ?? [],
      projectRoot: root,
    });
    if (restored.length > 0) {
      console.log(chalk.green(`  ✓ Restored ${restored.length} .env file(s)`));
    }
  } catch {
    // best-effort
  }

  try {
    await unregisterWorktree(root);
    console.log(chalk.green("  ✓ Removed registry entry"));
  } catch {
    // best-effort
  }

  console.log(
    chalk.dim("\n  Tip: run ") +
      chalk.cyan("sb-worktree status") +
      chalk.dim(" to verify everything is cleaned up.\n")
  );
}

type MenuChoice = "start" | "stop" | "status" | "cleanup" | "nuke" | "init" | "config" | "instructions" | "usage" | "quit";

const INTERACTIVE_CHOICES: { value: MenuChoice; name: string }[] = [
  {
    value: "start",
    name: "start        — Spin up an isolated Supabase instance for this worktree",
  },
  {
    value: "stop",
    name: "stop         — Tear down the instance and restore files",
  },
  {
    value: "status",
    name: "status       — Show all active instances",
  },
  {
    value: "cleanup",
    name: "cleanup      — Remove stale instances (deleted worktrees)",
  },
  {
    value: "nuke",
    name: "nuke         — Stop ALL instances everywhere",
  },
  {
    value: "init",
    name: "init         — Set up this project for supabase-worktree",
  },
  {
    value: "config",
    name: "config       — Show or explain project configuration",
  },
  {
    value: "instructions",
    name: "instructions — How to get started",
  },
  {
    value: "usage",
    name: "usage        — Workflow examples and patterns",
  },
  {
    value: "quit",
    name: "quit         — Exit and stop any running instance (or Ctrl+C / Ctrl+D)",
  },
];

const COMMANDS: Record<string, (ctx: CommandContext) => Promise<void>> = {
  init: initCommand,
  start: startCommand,
  stop: stopCommand,
  status: statusCommand,
  cleanup: cleanupCommand,
  nuke: nukeCommand,
  config: configCommand,
  instructions: instructionsCommand,
  usage: usageCommand,
};

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

/**
 * Returns true if the error was thrown by @inquirer/prompts when the
 * user pressed Ctrl+C or Ctrl+D during a prompt.
 */
function isPromptExit(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ExitPromptError" || error.name === "AbortPromptError")
  );
}

/**
 * Run a command with error handling.
 *
 * - CommandError → show the message and hint in a formatted way
 * - Prompt exit  → re-throw so the caller (the loop) can handle it
 * - Other errors → show a generic "something went wrong" message
 *
 * Returns true if the command succeeded, false if it failed.
 */
async function runCommand(
  fn: (ctx: CommandContext) => Promise<void>,
  ctx: CommandContext,
): Promise<boolean> {
  try {
    await fn(ctx);
    return true;
  } catch (error) {
    // Let prompt exits bubble up — the loop handles these
    if (isPromptExit(error)) {
      throw error;
    }

    if (error instanceof CommandError) {
      console.log(chalk.red(`\n✗ ${error.message}`));
      if (error.hint) {
        console.log(chalk.dim(`  ${error.hint}`));
      }
      console.log();
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`\n✗ Something went wrong: ${msg}`));
      if (ctx.verbose && error instanceof Error && error.stack) {
        console.log(chalk.dim(error.stack));
      }
      console.log();
    }

    if (!ctx.interactive) {
      process.exitCode = 1;
    }
    return false;
  }
}

/**
 * Run the interactive menu loop.
 * Repeats until the user selects "quit" or presses Ctrl+C / Ctrl+D.
 *
 * If the user started a Supabase instance during this session, it is
 * automatically stopped on exit (quit, Ctrl+C, Ctrl+D, or SIGTERM).
 */
async function interactiveLoop(opts: Record<string, unknown>): Promise<void> {
  const { select } = await import("@inquirer/prompts");

  // --- signal handlers for cleanup on kill --------------------------------
  let cleaningUp = false;

  const signalHandler = async (signal: NodeJS.Signals) => {
    if (cleaningUp) {
      // Second signal while cleanup is running → force exit
      console.log(chalk.red("\nForce exiting.\n"));
      process.exit(1);
    }
    cleaningUp = true;
    await cleanupActiveSession();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);

  const removeSignalHandlers = () => {
    process.removeListener("SIGINT", signalHandler);
    process.removeListener("SIGTERM", signalHandler);
  };
  // -------------------------------------------------------------------------

  console.log(
    chalk.bold("\n🗄️  supabase-worktree") +
      chalk.dim(" — manage parallel Supabase instances\n")
  );

  try {
    while (true) {
      let choice: MenuChoice;

      try {
        choice = await select<MenuChoice>({
          message: "What would you like to do?",
          choices: INTERACTIVE_CHOICES.map((c) => ({
            value: c.value,
            name: c.name,
          })),
        });
      } catch (error) {
        if (isPromptExit(error)) {
          // Ctrl+C / Ctrl+D at the menu prompt
          await cleanupActiveSession();
          console.log(chalk.dim("\nGoodbye!\n"));
          return;
        }
        throw error;
      }

      if (choice === "quit") {
        await cleanupActiveSession();
        console.log(chalk.dim("\nGoodbye!\n"));
        return;
      }

      const fn = COMMANDS[choice];
      if (!fn) continue;

      const ctx = buildContext(opts);
      try {
        const ok = await runCommand(fn, ctx);

        // Track session lifecycle so we can clean up on exit
        if (ok && choice === "start") {
          activeSessionRoot = ctx.projectRoot;
        } else if (ok && (choice === "stop" || choice === "nuke")) {
          activeSessionRoot = null;
        }
      } catch (error) {
        // Prompt exit during a command (e.g. user hit Ctrl+C during a confirm)
        if (isPromptExit(error)) {
          console.log(chalk.dim("\n  Command cancelled.\n"));
          // Return to the menu instead of exiting
          continue;
        }
        throw error;
      }
    }
  } finally {
    removeSignalHandlers();
  }
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

  // Register subcommands — each runs once and exits (no loop)
  for (const [name, fn] of Object.entries(COMMANDS)) {
    program
      .command(name)
      .description(commandDescription(name))
      .action(async () => {
        const ctx = buildContext(program.opts());
        await runCommand(fn, ctx);
      });
  }

  // When no command is given: interactive loop or help
  program.action(async () => {
    const opts = program.opts();
    const isCI = !process.stdout.isTTY || !!process.env.CI;
    const interactive = opts.interactive !== false && !opts.ci && !isCI;

    if (!interactive) {
      program.help();
      return;
    }

    await interactiveLoop(opts);
  });

  return program;
}

function commandDescription(name: string): string {
  const descriptions: Record<string, string> = {
    init:
      "Initialize the project: detect files, write config to package.json, set up templates\n" +
      "  Non-interactive (--ci): skips overwrite prompts, uses defaults",
    start:
      "Allocate ports, generate config.toml, update .env files, and start Supabase\n" +
      "  Non-interactive (--ci): fails if an instance is already running instead of prompting",
    stop:
      "Stop Supabase, restore .env files, clean up generated config\n" +
      "  Non-interactive (--ci): stops without confirmation",
    status:
      "Show all active Supabase worktree instances\n" +
      "  Non-interactive (--ci): same output, suitable for scripting",
    cleanup:
      "Find and remove stale instances whose worktree directories no longer exist\n" +
      "  Non-interactive (--ci): removes stale entries without confirmation",
    nuke:
      "Stop ALL tracked Supabase instances and clear the registry\n" +
      "  Non-interactive (--ci): nukes without confirmation (use with caution)",
    config:
      "Show current project configuration from package.json\n" +
      "  Non-interactive (--ci): same output, suitable for debugging CI setups",
    instructions:
      "Show getting-started guide with project status and next steps\n" +
      "  Non-interactive (--ci): same output, suitable for onboarding scripts",
    usage:
      "Show workflow examples: solo dev, parallel worktrees, CI, cleanup\n" +
      "  Non-interactive (--ci): same output, suitable for reference",
  };
  return descriptions[name] ?? name;
}
