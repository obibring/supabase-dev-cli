import type { ProjectConfig } from "./types.js";
/**
 * Walk up the directory tree to find the project root (nearest package.json).
 */
export declare function findProjectRoot(startDir?: string): string;
/**
 * Load the supabase-worktree config from package.json.
 * Returns null if no config is found.
 */
export declare function loadConfig(projectRoot: string): Promise<ProjectConfig | null>;
//# sourceMappingURL=config.d.ts.map