/**
 * Discover .env files matching the configured glob patterns.
 * Returns absolute paths.
 */
export declare function discoverEnvFiles(patterns: string[], projectRoot: string): Promise<string[]>;
/**
 * Replace port references in an .env file content string.
 *
 * Only replaces ports that appear after a known local host pattern
 * (e.g., localhost:54321, 127.0.0.1:54322) to avoid false positives.
 */
export declare function replacePortsInEnvContent(content: string, portMap: Record<string, string>): string;
/**
 * Back up an .env file before modifying it.
 * Creates a .sb-backup file alongside the original.
 */
export declare function backupEnvFile(envPath: string): Promise<string>;
/**
 * Restore an .env file from its backup.
 * Returns true if restoration occurred.
 */
export declare function restoreEnvFile(envPath: string): Promise<boolean>;
/**
 * Process all .env files: back them up and apply port replacements.
 * Returns a list of files that were modified.
 */
export declare function updateEnvFiles(options: {
    patterns: string[];
    projectRoot: string;
    portMap: Record<string, string>;
}): Promise<string[]>;
/**
 * Restore all .env files from backups.
 * Returns a list of files that were restored.
 */
export declare function restoreAllEnvFiles(options: {
    patterns: string[];
    projectRoot: string;
}): Promise<string[]>;
/**
 * Find all .env files that have backups (indicating they were modified
 * by a previous start).
 */
export declare function findModifiedEnvFiles(options: {
    patterns: string[];
    projectRoot: string;
}): Promise<string[]>;
//# sourceMappingURL=env.d.ts.map