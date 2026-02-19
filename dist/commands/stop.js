import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../lib/config.js";
import { getWorktreeEntry, unregisterWorktree } from "../lib/registry.js";
import { restoreAllEnvFiles } from "../lib/env.js";
import { supabaseStop } from "../lib/exec.js";
export async function stopCommand(ctx) {
    const { interactive, projectRoot, verbose } = ctx;
    console.log(chalk.bold("\n🛑 Stopping Supabase worktree instance\n"));
    const entry = await getWorktreeEntry(projectRoot);
    if (!entry) {
        console.log(chalk.yellow("  No active instance found for this worktree."));
        console.log(chalk.dim("  Nothing to stop."));
        return;
    }
    if (interactive) {
        const proceed = await confirm({
            message: `Stop the instance on port ${entry.portBase} (branch: ${entry.branch})?`,
            default: true,
        });
        if (!proceed) {
            console.log(chalk.dim("  Aborted."));
            return;
        }
    }
    // 1. Stop Supabase
    try {
        const output = await supabaseStop(projectRoot);
        if (verbose && output) {
            console.log(chalk.dim(output));
        }
        console.log(chalk.green("  ✓ Supabase stopped"));
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`  ⚠ Supabase stop returned an error: ${msg}`));
        console.log(chalk.dim("  Continuing with cleanup..."));
    }
    // 2. Restore .env files
    try {
        const config = await loadConfig(projectRoot);
        const restored = await restoreAllEnvFiles({
            patterns: config?.envFiles ?? [],
            projectRoot,
        });
        if (restored.length > 0) {
            console.log(chalk.green(`  ✓ Restored ${restored.length} .env file(s)`));
        }
        else {
            console.log(chalk.dim("  No .env backups to restore"));
        }
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`  ⚠ Could not restore .env files: ${msg}`));
        console.log(chalk.dim("  Continuing with registry cleanup..."));
    }
    // 3. Unregister
    await unregisterWorktree(projectRoot);
    console.log(chalk.green("  ✓ Removed registry entry"));
    console.log(chalk.bold.green("\n✅ Instance stopped and cleaned up.\n"));
}
//# sourceMappingURL=stop.js.map