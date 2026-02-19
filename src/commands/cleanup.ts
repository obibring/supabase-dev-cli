import chalk from "chalk";
import { cleanupStaleEntries } from "../lib/registry.js";
import type { CommandContext } from "../lib/types.js";

export async function cleanupCommand(ctx: CommandContext): Promise<void> {
  console.log(chalk.bold("\n🧹 Cleaning up stale instances\n"));

  const stale = await cleanupStaleEntries();

  if (stale.length === 0) {
    console.log(chalk.dim("  No stale entries found."));
  } else {
    console.log(chalk.green(`  ✓ Removed ${stale.length} stale entry(ies):`));
    for (const entry of stale) {
      console.log(chalk.dim(`    - ${entry.branch} (${entry.worktreePath})`));
    }
  }

  console.log();
}
