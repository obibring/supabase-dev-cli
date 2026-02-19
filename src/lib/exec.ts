import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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
