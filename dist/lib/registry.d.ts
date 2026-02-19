import type { WorktreeEntry } from "./types.js";
/**
 * Get the registry entry for a specific worktree path.
 */
export declare function getWorktreeEntry(worktreePath: string): Promise<WorktreeEntry | undefined>;
/**
 * Get all currently allocated port bases.
 */
export declare function getAllocatedPortBases(): Promise<number[]>;
/**
 * Get all currently allocated project IDs.
 */
export declare function getAllocatedProjectIds(): Promise<string[]>;
/**
 * Register a new worktree entry, replacing any existing entry for the same path.
 */
export declare function registerWorktree(entry: WorktreeEntry): Promise<void>;
/**
 * Remove a worktree entry by path.
 */
export declare function unregisterWorktree(worktreePath: string): Promise<boolean>;
/**
 * Get all registry entries.
 */
export declare function getAllEntries(): Promise<WorktreeEntry[]>;
/**
 * Remove entries whose worktree paths no longer exist on disk.
 */
export declare function cleanupStaleEntries(): Promise<WorktreeEntry[]>;
/**
 * Clear the entire registry.
 */
export declare function clearRegistry(): Promise<void>;
//# sourceMappingURL=registry.d.ts.map