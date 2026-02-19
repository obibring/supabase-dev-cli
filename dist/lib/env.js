import { readFile, writeFile, copyFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { glob } from "glob";
import { REPLACEABLE_HOSTS, ENV_BACKUP_SUFFIX } from "./constants.js";
/**
 * Discover .env files matching the configured glob patterns.
 * Returns absolute paths.
 */
export async function discoverEnvFiles(patterns, projectRoot) {
    const allFiles = [];
    for (const pattern of patterns) {
        const matches = await glob(pattern, {
            cwd: projectRoot,
            absolute: true,
            dot: true,
            nodir: true,
            ignore: [
                "**/node_modules/**",
                `**/*${ENV_BACKUP_SUFFIX}`,
            ],
        });
        allFiles.push(...matches);
    }
    // Deduplicate and sort for deterministic output
    return [...new Set(allFiles)].sort();
}
/**
 * Replace port references in an .env file content string.
 *
 * Only replaces ports that appear after a known local host pattern
 * (e.g., localhost:54321, 127.0.0.1:54322) to avoid false positives.
 */
export function replacePortsInEnvContent(content, portMap) {
    let result = content;
    for (const [oldPort, newPort] of Object.entries(portMap)) {
        if (oldPort === newPort)
            continue;
        for (const host of REPLACEABLE_HOSTS) {
            // Replace host:port patterns (most common in URLs)
            result = result.replaceAll(`${host}:${oldPort}`, `${host}:${newPort}`);
        }
    }
    return result;
}
/**
 * Back up an .env file before modifying it.
 * Creates a .sb-backup file alongside the original.
 */
export async function backupEnvFile(envPath) {
    const backupPath = envPath + ENV_BACKUP_SUFFIX;
    await copyFile(envPath, backupPath);
    return backupPath;
}
/**
 * Restore an .env file from its backup.
 * Returns true if restoration occurred.
 */
export async function restoreEnvFile(envPath) {
    const backupPath = envPath + ENV_BACKUP_SUFFIX;
    if (!existsSync(backupPath)) {
        return false;
    }
    await copyFile(backupPath, envPath);
    await unlink(backupPath);
    return true;
}
/**
 * Process all .env files: back them up and apply port replacements.
 * Returns a list of files that were modified.
 */
export async function updateEnvFiles(options) {
    const { patterns, projectRoot, portMap } = options;
    const envFiles = await discoverEnvFiles(patterns, projectRoot);
    const modified = [];
    for (const filePath of envFiles) {
        const content = await readFile(filePath, "utf-8");
        const updated = replacePortsInEnvContent(content, portMap);
        if (updated !== content) {
            await backupEnvFile(filePath);
            await writeFile(filePath, updated, "utf-8");
            modified.push(relative(projectRoot, filePath));
        }
    }
    return modified;
}
/**
 * Restore all .env files from backups.
 * Returns a list of files that were restored.
 */
export async function restoreAllEnvFiles(options) {
    const { patterns, projectRoot } = options;
    const envFiles = await discoverEnvFiles(patterns, projectRoot);
    const restored = [];
    for (const filePath of envFiles) {
        const didRestore = await restoreEnvFile(filePath);
        if (didRestore) {
            restored.push(relative(projectRoot, filePath));
        }
    }
    return restored;
}
/**
 * Find all .env files that have backups (indicating they were modified
 * by a previous start).
 */
export async function findModifiedEnvFiles(options) {
    const { patterns, projectRoot } = options;
    const envFiles = await discoverEnvFiles(patterns, projectRoot);
    return envFiles
        .filter((f) => existsSync(f + ENV_BACKUP_SUFFIX))
        .map((f) => relative(projectRoot, f));
}
//# sourceMappingURL=env.js.map