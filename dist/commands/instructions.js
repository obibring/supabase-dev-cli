import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
export async function instructionsCommand(ctx) {
    const { projectRoot } = ctx;
    const hasSupabaseDir = existsSync(join(projectRoot, "supabase"));
    const hasConfigToml = existsSync(join(projectRoot, "supabase", "config.toml"));
    const hasTemplate = existsSync(join(projectRoot, "supabase", "config.toml.template"));
    const hasPkgJson = existsSync(join(projectRoot, "package.json"));
    console.log(chalk.bold("\n📖 Getting started with supabase-worktree\n"));
    console.log(chalk.dim("  supabase-worktree lets you run multiple Supabase instances\n") +
        chalk.dim("  in parallel across git worktrees without port conflicts.\n"));
    // Detect project state and show relevant steps
    console.log(chalk.bold("  Your project:\n"));
    console.log(printCheck(hasPkgJson, "package.json"));
    console.log(printCheck(hasSupabaseDir, "supabase/ directory"));
    console.log(printCheck(hasConfigToml, "supabase/config.toml"));
    console.log(printCheck(hasTemplate, "supabase/config.toml.template"));
    console.log(chalk.bold("\n  Steps to get running:\n"));
    if (!hasPkgJson) {
        printStep(1, "Initialize a Node project", "npm init -y");
        printStep(2, "Initialize Supabase", "supabase init");
        printStep(3, "Install supabase-worktree", "npm install -D supabase-worktree");
        printStep(4, "Set up the worktree config", "npx sb-worktree init");
        printStep(5, "Commit the template and config changes", "git add supabase/config.toml.template .gitignore package.json\n" +
            '            git commit -m "chore: set up supabase-worktree"');
        printStep(6, "Start an isolated instance", "npx sb-worktree start");
    }
    else if (!hasSupabaseDir || !hasConfigToml) {
        printStep(1, "Initialize Supabase", "supabase init");
        printStep(2, "Set up the worktree config", "npx sb-worktree init");
        printStep(3, "Commit the template and config changes", "git add supabase/config.toml.template .gitignore package.json\n" +
            '            git commit -m "chore: set up supabase-worktree"');
        printStep(4, "Start an isolated instance", "npx sb-worktree start");
    }
    else if (!hasTemplate) {
        printStep(1, "Set up the worktree config", "npx sb-worktree init");
        printStep(2, "Commit the template and config changes", "git add supabase/config.toml.template .gitignore package.json\n" +
            '            git commit -m "chore: set up supabase-worktree"');
        printStep(3, "Start an isolated instance", "npx sb-worktree start");
    }
    else {
        console.log(chalk.green("  You're all set! Run a command:\n"));
        printStep(1, "Start an isolated instance in this worktree", "npx sb-worktree start");
        printStep(2, "Stop and restore when done", "npx sb-worktree stop");
        printStep(3, "See all active instances", "npx sb-worktree status");
    }
    console.log(chalk.bold("\n  How it works:\n"));
    console.log(chalk.dim("  1. Your config.toml is converted to a .template file (committed)."));
    console.log(chalk.dim("     The actual config.toml is gitignored and generated per-worktree."));
    console.log(chalk.dim("  2. Each worktree gets a non-overlapping block of 100 ports,"));
    console.log(chalk.dim("     tracked in a global registry at ~/.sb-worktrees.json."));
    console.log(chalk.dim("  3. All .env files in your repo are updated to use the new ports"));
    console.log(chalk.dim("     (with backups for clean restoration on stop)."));
    console.log(chalk.dim("  4. Each instance gets a unique project_id derived from your"));
    console.log(chalk.dim("     branch name, so Docker containers never collide.\n"));
    console.log(chalk.bold("  CI / automation:\n"));
    console.log(chalk.dim("  Use --no-interactive (or --ci) to disable all prompts:"));
    console.log(chalk.cyan("    npx sb-worktree start --ci"));
    console.log(chalk.cyan("    npx sb-worktree stop --ci\n"));
}
function printCheck(ok, label) {
    return ok
        ? chalk.green(`    ✓ ${label}`)
        : chalk.yellow(`    ✗ ${label}`) + chalk.dim(" (missing)");
}
function printStep(n, description, command) {
    console.log(`  ${chalk.bold(`${n}.`)} ${description}`);
    console.log(chalk.cyan(`            ${command}`));
    console.log();
}
//# sourceMappingURL=instructions.js.map