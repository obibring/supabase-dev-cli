import { existsSync } from "node:fs";
import chalk from "chalk";
import { getAllEntries } from "../lib/registry.js";
import type { CommandContext } from "../lib/types.js";

export async function statusCommand(ctx: CommandContext): Promise<void> {
  console.log(chalk.bold("\n📊 Supabase worktree instances\n"));

  const entries = await getAllEntries();

  if (entries.length === 0) {
    console.log(chalk.dim("  No active instances."));
    console.log();
    return;
  }

  for (const entry of entries) {
    const exists = existsSync(entry.worktreePath);
    const status = exists ? chalk.green("active") : chalk.red("stale");

    console.log(`  ${status}  ${chalk.bold(entry.branch)}`);
    console.log(chalk.dim(`         Path:      ${entry.worktreePath}`));
    console.log(chalk.dim(`         Port base: ${entry.portBase}`));
    console.log(chalk.dim(`         Project:   ${entry.projectId}`));
    console.log(chalk.dim(`         Started:   ${entry.allocatedAt}`));
    console.log();
  }
}
