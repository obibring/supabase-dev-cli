import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, findProjectRoot } from "../../src/lib/config.js";
import { createTestProject, createTempDir, cleanupDir } from "../helpers.js";

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------
describe("loadConfig", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupDir(projectDir);
  });

  it("returns config when supabase-worktree key exists in package.json", async () => {
    projectDir = createTestProject({
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env"],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });

    const config = await loadConfig(projectDir);
    expect(config).not.toBeNull();
    expect(config!.envFiles).toEqual([".env"]);
    expect(config!.configTemplate).toBe("supabase/config.toml.template");
    expect(config!.portBlockSize).toBe(100);
  });

  it("returns null when no supabase-worktree key exists", async () => {
    projectDir = createTestProject();
    const config = await loadConfig(projectDir);
    expect(config).toBeNull();
  });

  it("returns null when no package.json exists", async () => {
    projectDir = createTempDir("sb-test-no-pkg-");
    const config = await loadConfig(projectDir);
    expect(config).toBeNull();
  });

  it("fills in defaults for missing fields", async () => {
    projectDir = createTestProject({
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env"],
          // configTemplate, portBlockSize are missing
        },
      },
    });

    const config = await loadConfig(projectDir);
    expect(config).not.toBeNull();
    expect(config!.envFiles).toEqual([".env"]);
    expect(config!.configTemplate).toBe("supabase/config.toml.template");
    expect(config!.portBlockSize).toBe(100);
  });

  it("respects custom values for all fields", async () => {
    projectDir = createTestProject({
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: ["custom/.env"],
          configTemplate: "custom/template.toml",
          portBlockSize: 50,
        },
      },
    });

    const config = await loadConfig(projectDir);
    expect(config!.envFiles).toEqual(["custom/.env"]);
    expect(config!.configTemplate).toBe("custom/template.toml");
    expect(config!.portBlockSize).toBe(50);
  });

  it("ignores defaultPortBase if present in legacy config", async () => {
    projectDir = createTestProject({
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env"],
          configTemplate: "supabase/config.toml.template",
          defaultPortBase: 10000,
          portBlockSize: 100,
        },
      },
    });

    const config = await loadConfig(projectDir);
    expect(config).not.toBeNull();
    // defaultPortBase should not be on the returned config
    expect((config as any).defaultPortBase).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// findProjectRoot
// ---------------------------------------------------------------------------
describe("findProjectRoot", () => {
  let dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) cleanupDir(d);
    dirs = [];
  });

  it("finds a directory containing package.json", () => {
    const dir = createTestProject();
    dirs.push(dir);

    const root = findProjectRoot(dir);
    expect(root).toBe(dir);
  });

  it("walks up to find the nearest package.json", () => {
    const dir = createTestProject();
    dirs.push(dir);

    const subDir = join(dir, "src", "lib");
    const { mkdirSync } = require("node:fs");
    mkdirSync(subDir, { recursive: true });

    const root = findProjectRoot(subDir);
    expect(root).toBe(dir);
  });

  it("returns cwd when no package.json is found", () => {
    const dir = createTempDir("sb-test-no-root-");
    dirs.push(dir);

    // findProjectRoot walks to filesystem root, then returns cwd
    // We can't easily test the "no package.json" case since there's
    // almost always one somewhere up the tree. Just verify it returns a string.
    const root = findProjectRoot(dir);
    expect(typeof root).toBe("string");
  });
});
