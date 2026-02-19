import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { getAllEntries, clearRegistry } from "../lib/registry.js";
import { supabaseStop } from "../lib/exec.js";
import { CommandError } from "../lib/errors.js";
import type { CommandContext } from "../lib/types.js";

export async function nukeCommand(ctx: CommandContext): Promise<void> {
  const { interactive, verbose } = ctx;

  console.log(chalk.bold("\n💣 Nuking ALL Supabase worktree instances\n"));

  let entries;
  try {
    entries = await getAllEntries();
  } catch {
    console.log(chalk.yellow("  ⚠ Could not read the instance registry."));
    console.log(chalk.dim("  Clearing the registry file..."));
    await clearRegistry();
    console.log(chalk.green("  ✓ Registry cleared."));
    return;
  }

  if (entries.length === 0) {
    console.log(chalk.dim("  No instances to nuke."));
    console.log();
    return;
  }

  console.log(chalk.yellow(`  Found ${entries.length} instance(s):`));
  for (const entry of entries) {
    console.log(chalk.dim(`    - ${entry.branch} @ ${entry.worktreePath}`));
  }
  console.log();

  if (interactive) {
    const proceed = await confirm({
      message: "Stop ALL instances and clear the registry?",
      default: false,
    });
    if (!proceed) {
      console.log(chalk.dim("  Aborted."));
      return;
    }
  }

  for (const entry of entries) {
    try {
      console.log(chalk.dim(`  Stopping ${entry.branch}...`));
      await supabaseStop(entry.worktreePath);
      console.log(chalk.green(`  ✓ Stopped ${entry.branch}`));
    } catch {
      console.log(chalk.yellow(`  ⚠ Could not stop ${entry.branch} (may already be stopped)`));
    }
  }

  await clearRegistry();
  console.log(chalk.green("\n  ✓ Registry cleared"));
  console.log(chalk.bold.green("\n✅ All instances nuked.\n"));
}
