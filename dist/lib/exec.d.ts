/**
 * Detect whether the given directory is inside a linked git worktree.
 * Returns `linked: true` with the worktree directory name when it is.
 */
export declare function isGitWorktree(cwd: string): Promise<{
    linked: boolean;
    name: string | null;
}>;
/**
 * Get the current git branch name.
 */
export declare function getGitBranch(cwd: string): Promise<string>;
/**
 * Get the git repository name (from the remote or directory name).
 */
export declare function getGitRepoName(cwd: string): Promise<string>;
/**
 * Run `supabase start` in the given directory.
 */
export declare function supabaseStart(cwd: string): Promise<string>;
/**
 * Run `supabase stop` in the given directory.
 */
export declare function supabaseStop(cwd: string): Promise<string>;
//# sourceMappingURL=exec.d.ts.map