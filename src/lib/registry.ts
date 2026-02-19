import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { WorktreeEntry } from "./types.js";

const REGISTRY_FILE = join(homedir(), ".sb-worktrees.json");

async function readRegistry(): Promise<WorktreeEntry[]> {
  if (!existsSync(REGISTRY_FILE)) {
    return [];
  }

  const raw = await readFile(REGISTRY_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeRegistry(entries: WorktreeEntry[]): Promise<void> {
  const dir = dirname(REGISTRY_FILE);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(REGISTRY_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

/**
 * Get the registry entry for a specific worktree path.
 */
export async function getWorktreeEntry(
  worktreePath: string
): Promise<WorktreeEntry | undefined> {
  const entries = await readRegistry();
  return entries.find((e) => e.worktreePath === worktreePath);
}

/**
 * Get all currently allocated port bases.
 */
export async function getAllocatedPortBases(): Promise<number[]> {
  const entries = await readRegistry();
  return entries.map((e) => e.portBase);
}

/**
 * Get all currently allocated project IDs.
 */
export async function getAllocatedProjectIds(): Promise<string[]> {
  const entries = await readRegistry();
  return entries.map((e) => e.projectId);
}

/**
 * Register a new worktree entry, replacing any existing entry for the same path.
 */
export async function registerWorktree(entry: WorktreeEntry): Promise<void> {
  const entries = await readRegistry();
  const filtered = entries.filter((e) => e.worktreePath !== entry.worktreePath);
  filtered.push(entry);
  await writeRegistry(filtered);
}

/**
 * Remove a worktree entry by path.
 */
export async function unregisterWorktree(worktreePath: string): Promise<boolean> {
  const entries = await readRegistry();
  const filtered = entries.filter((e) => e.worktreePath !== worktreePath);

  if (filtered.length === entries.length) {
    return false;
  }

  await writeRegistry(filtered);
  return true;
}

/**
 * Get all registry entries.
 */
export async function getAllEntries(): Promise<WorktreeEntry[]> {
  return readRegistry();
}

/**
 * Remove entries whose worktree paths no longer exist on disk.
 */
export async function cleanupStaleEntries(): Promise<WorktreeEntry[]> {
  const entries = await readRegistry();
  const stale = entries.filter((e) => !existsSync(e.worktreePath));
  const active = entries.filter((e) => existsSync(e.worktreePath));

  if (stale.length > 0) {
    await writeRegistry(active);
  }

  return stale;
}

/**
 * Clear the entire registry.
 */
export async function clearRegistry(): Promise<void> {
  await writeRegistry([]);
}
