import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";
import { basename } from "node:path";

const execAsync = promisify(exec);

/**
 * Detect whether the given directory is inside a linked git worktree.
 * Returns `linked: true` with the worktree directory name when it is.
 */
export async function isGitWorktree(cwd: string): Promise<{ linked: boolean; name: string | null }> {
  try {
    const [{ stdout: gitDir }, { stdout: commonDir }] = await Promise.all([
      execAsync("git rev-parse --git-dir", { cwd }),
      execAsync("git rev-parse --git-common-dir", { cwd }),
    ]);

    if (gitDir.trim() !== commonDir.trim()) {
      return { linked: true, name: basename(cwd) };
    }
  } catch {
    // Not a git repo or git not available
  }

  return { linked: false, name: null };
}

/**
 * Get the current git branch name.
 */
export async function getGitBranch(cwd: string): Promise<string> {
  const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd });
  return stdout.trim();
}

/**
 * Get the git repository name (from the remote or directory name).
 */
export async function getGitRepoName(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      "git remote get-url origin",
      { cwd }
    );
    // Extract repo name from URL like git@github.com:user/repo.git or https://github.com/user/repo.git
    const match = stdout.trim().match(/\/([^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // No remote configured
  }

  // Fall back to directory name
  const { stdout } = await execAsync(
    "git rev-parse --show-toplevel",
    { cwd }
  );
  return stdout.trim().split("/").pop() ?? "supabase-project";
}

/**
 * Run `supabase start` in the given directory.
 */
export async function supabaseStart(cwd: string): Promise<string> {
  const { stdout, stderr } = await execAsync("supabase start", {
    cwd,
    timeout: 5 * 60 * 1000, // 5 minutes
  });
  return stdout + stderr;
}

/**
 * Run `supabase stop` in the given directory.
 */
export async function supabaseStop(cwd: string): Promise<string> {
  const { stdout, stderr } = await execAsync("supabase stop", {
    cwd,
    timeout: 60 * 1000, // 1 minute
  });
  return stdout + stderr;
}
