/**
 * Generate a config.toml from the template, replacing port values
 * and setting the project_id.
 */
export declare function generateConfig(options: {
    templatePath: string;
    outputPath: string;
    portMap: Record<string, string>;
    projectId: string;
}): Promise<void>;
/**
 * Derive a unique, grepable project_id prefixed with `sbwt-`.
 *
 * Uses the worktree directory name when inside a linked worktree,
 * otherwise falls back to the branch name. Appends `-2`, `-3`, etc.
 * if the derived name collides with an existing ID.
 */
export declare function deriveProjectId(options: {
    branch: string;
    worktreeName: string | null;
    existingIds?: string[];
}): string;
//# sourceMappingURL=template.d.ts.map