import chalk from "chalk";
import type { CommandContext } from "../lib/types.js";

export async function usageCommand(_ctx: CommandContext): Promise<void> {
  console.log(
    chalk.bold("\n📘 Usage workflows\n")
  );

  // ── Solo developer workflow ──
  section("Solo developer — single worktree");
  console.log(chalk.dim("  The simplest workflow. One repo, one Supabase instance,"));
  console.log(chalk.dim("  but with port isolation so it won't clash with other projects.\n"));
  step("sb-worktree init", "One-time setup: creates the template and configures package.json");
  step("sb-worktree start", "Allocate ports, generate config, update .env files, start Supabase");
  step("sb-worktree stop", "Stop Supabase, restore .env files, clean up");

  // ── Parallel worktree workflow ──
  section("Parallel development — multiple worktrees");
  console.log(chalk.dim("  The core use case. Run independent Supabase instances in"));
  console.log(chalk.dim("  each git worktree without port or Docker conflicts.\n"));
  step("git worktree add ../feature-branch feature-branch", "Create a new worktree");
  step("cd ../feature-branch", "Switch to the worktree");
  step("sb-worktree start", "Each worktree gets its own port block and project_id");
  console.log(chalk.dim("  Meanwhile, your main worktree keeps running undisturbed.\n"));
  step("sb-worktree status", "See all active instances across worktrees");
  step("sb-worktree stop", "Stop this worktree's instance when done");

  // ── CI / automation workflow ──
  section("CI / automation");
  console.log(chalk.dim("  Use --no-interactive (or --ci) to disable all prompts.\n"));
  step("sb-worktree start --ci", "Start without prompts — exits with code 1 on errors");
  step("sb-worktree stop --ci", "Stop without confirmation");
  step("sb-worktree cleanup --ci", "Remove stale entries (e.g., after worktree removal in CI)");

  // ── Cleanup workflow ──
  section("Cleanup and recovery");
  console.log(chalk.dim("  When worktrees are removed or things get out of sync.\n"));
  step("sb-worktree cleanup", "Remove registry entries for worktrees that no longer exist on disk");
  step("sb-worktree nuke", "Nuclear option: stop ALL tracked instances and clear the registry");
  step("sb-worktree stop", "If a single instance is stuck, stop it and restore files");

  // ── Recommended git alias ──
  section("Recommended git alias");
  console.log(chalk.dim("  Auto-stop the instance when removing a worktree:\n"));
  console.log(chalk.cyan('    git config --global alias.wt-remove \\'));
  console.log(chalk.cyan('      \'!f() { sb-worktree stop --ci --project-root "$1" 2>/dev/null; git worktree remove "$@"; }; f\''));
  console.log();
  console.log(chalk.dim("  Then use:"));
  console.log(chalk.cyan("    git wt-remove ../feature-branch\n"));

  // ── Port allocation ──
  section("How port allocation works");
  console.log(chalk.dim("  Each worktree gets a contiguous block of ports (default: 100).\n"));
  console.log(chalk.dim("    Worktree 1 (main):     54321 – 54420"));
  console.log(chalk.dim("    Worktree 2 (feature-a): 54421 – 54520"));
  console.log(chalk.dim("    Worktree 3 (feature-b): 54521 – 54620\n"));
  console.log(chalk.dim("  Service ports are offset from the base:"));
  console.log(chalk.dim("    API   = base + 0    (e.g., 54321)"));
  console.log(chalk.dim("    DB    = base + 1    (e.g., 54322)"));
  console.log(chalk.dim("    Studio = base + 2   (e.g., 54323)\n"));
  console.log(chalk.dim("  The global registry at ~/.sb-worktrees.json tracks all"));
  console.log(chalk.dim("  allocations to prevent collisions.\n"));
}

function section(title: string): void {
  console.log(chalk.bold.underline(`  ${title}\n`));
}

function step(command: string, description: string): void {
  console.log(`  ${chalk.cyan(command)}`);
  console.log(chalk.dim(`    ${description}\n`));
}
