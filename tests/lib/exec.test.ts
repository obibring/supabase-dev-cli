import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isGitWorktree } from "../../src/lib/exec.js";

// ---------------------------------------------------------------------------
// isGitWorktree
// ---------------------------------------------------------------------------
describe("isGitWorktree", () => {
  let mainRepoDir: string;
  let worktreeDir: string;
  let nonGitDir: string;

  beforeAll(() => {
    // Create a real git repo with a linked worktree
    mainRepoDir = mkdtempSync(join(tmpdir(), "sb-test-exec-main-"));
    execSync("git init", { cwd: mainRepoDir });
    execSync("git commit --allow-empty -m 'init'", { cwd: mainRepoDir });

    // Add a linked worktree
    worktreeDir = join(mainRepoDir, "..", "sb-test-exec-worktree");
    execSync(`git worktree add "${worktreeDir}" -b test-wt-branch`, {
      cwd: mainRepoDir,
    });

    // A plain directory that is not a git repo
    nonGitDir = mkdtempSync(join(tmpdir(), "sb-test-exec-nogit-"));
  });

  afterAll(() => {
    // Clean up worktree first, then the main repo and non-git dir
    try {
      execSync(`git worktree remove "${worktreeDir}" --force`, {
        cwd: mainRepoDir,
      });
    } catch {
      // Worktree dir might already be gone
    }
    rmSync(mainRepoDir, { recursive: true, force: true });
    rmSync(worktreeDir, { recursive: true, force: true });
    rmSync(nonGitDir, { recursive: true, force: true });
  });

  it("returns linked: false for a regular git repository", async () => {
    const result = await isGitWorktree(mainRepoDir);
    expect(result).toEqual({ linked: false, name: null });
  });

  it("returns linked: true with directory name for a linked worktree", async () => {
    const result = await isGitWorktree(worktreeDir);
    expect(result.linked).toBe(true);
    expect(result.name).toBe("sb-test-exec-worktree");
  });

  it("returns linked: false for a non-git directory", async () => {
    const result = await isGitWorktree(nonGitDir);
    expect(result).toEqual({ linked: false, name: null });
  });

  it("returns linked: false for a nonexistent directory", async () => {
    const result = await isGitWorktree("/tmp/this-path-does-not-exist-xyz");
    expect(result).toEqual({ linked: false, name: null });
  });
});
