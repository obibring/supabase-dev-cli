import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_PORT_BASE,
  DEFAULT_PORT_BLOCK_SIZE,
  DEFAULT_ENV_PATTERNS,
  DEFAULT_CONFIG_TEMPLATE,
} from "./constants.js";
import type { ProjectConfig } from "./types.js";

/**
 * Walk up the directory tree to find the project root (nearest package.json).
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);

  while (true) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }

    const parent = resolve(dir, "..");
    if (parent === dir) {
      // Reached filesystem root
      return process.cwd();
    }
    dir = parent;
  }
}

/**
 * Load the supabase-worktree config from package.json.
 * Returns null if no config is found.
 */
export async function loadConfig(projectRoot: string): Promise<ProjectConfig | null> {
  const pkgPath = join(projectRoot, "package.json");

  if (!existsSync(pkgPath)) {
    return null;
  }

  const raw = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);
  const config = pkg["supabase-worktree"];

  if (!config) {
    return null;
  }

  return {
    envFiles: config.envFiles ?? DEFAULT_ENV_PATTERNS,
    configTemplate: config.configTemplate ?? DEFAULT_CONFIG_TEMPLATE,
    defaultPortBase: config.defaultPortBase ?? DEFAULT_PORT_BASE,
    portBlockSize: config.portBlockSize ?? DEFAULT_PORT_BLOCK_SIZE,
  };
}
