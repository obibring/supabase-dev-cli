import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initCommand } from "../../src/commands/init.js";
import {
  createTestProject,
  cleanupDir,
  buildTestContext,
  captureConsole,
  SAMPLE_CONFIG_TOML,
} from "../helpers.js";

describe("initCommand", () => {
  let projectDir: string;
  let consoleCap: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    consoleCap = captureConsole();
  });

  afterEach(() => {
    consoleCap.restore();
    if (projectDir) cleanupDir(projectDir);
  });

  it("creates a config.toml.template from config.toml", async () => {
    projectDir = createTestProject({ withConfig: true });
    const ctx = buildTestContext(projectDir);

    await initCommand(ctx);

    const templatePath = join(projectDir, "supabase", "config.toml.template");
    expect(existsSync(templatePath)).toBe(true);

    const template = readFileSync(templatePath, "utf-8");
    const original = readFileSync(join(projectDir, "supabase", "config.toml"), "utf-8");
    expect(template).toBe(original);
  });

  it("writes supabase-worktree config to package.json", async () => {
    projectDir = createTestProject({ withConfig: true });
    const ctx = buildTestContext(projectDir);

    await initCommand(ctx);

    const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8"));
    expect(pkg["supabase-worktree"]).toBeDefined();
    expect(pkg["supabase-worktree"].configTemplate).toBe("supabase/config.toml.template");
    expect(pkg["supabase-worktree"].portBlockSize).toBe(100);
    expect(pkg["supabase-worktree"].defaultPortBase).toBeUndefined();
  });

  it("discovers existing .env files and includes them in config", async () => {
    projectDir = createTestProject({ withConfig: true, withEnvFiles: true });
    const ctx = buildTestContext(projectDir);

    await initCommand(ctx);

    const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8"));
    const envFiles: string[] = pkg["supabase-worktree"].envFiles;
    expect(envFiles).toContain(".env");
    expect(envFiles).toContain(".env.local");
  });

  it("uses default env patterns when no .env files exist", async () => {
    projectDir = createTestProject({ withConfig: true });
    const ctx = buildTestContext(projectDir);

    await initCommand(ctx);

    const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8"));
    const envFiles: string[] = pkg["supabase-worktree"].envFiles;
    // Should fall back to DEFAULT_ENV_PATTERNS
    expect(envFiles).toEqual([".env*", "apps/*/.env*", "packages/*/.env*"]);
  });

  it("updates .gitignore with supabase/config.toml", async () => {
    projectDir = createTestProject({ withConfig: true, withGitignore: true });
    const ctx = buildTestContext(projectDir);

    await initCommand(ctx);

    const gitignore = readFileSync(join(projectDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("supabase/config.toml");
  });

  it("does not duplicate gitignore entries", async () => {
    projectDir = createTestProject({ withConfig: true, withGitignore: true });
    // Pre-add the entry
    const gitignorePath = join(projectDir, ".gitignore");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(gitignorePath, "node_modules\nsupabase/config.toml\n");

    const ctx = buildTestContext(projectDir);
    await initCommand(ctx);

    const content = readFileSync(gitignorePath, "utf-8");
    const matches = content.match(/supabase\/config\.toml/g);
    expect(matches?.length).toBe(1);
  });

  it("skips .gitignore update when file does not exist", async () => {
    projectDir = createTestProject({ withConfig: true });
    const ctx = buildTestContext(projectDir);

    await initCommand(ctx);

    // Should not create a .gitignore
    expect(existsSync(join(projectDir, ".gitignore"))).toBe(false);
    expect(consoleCap.output).toContain("No .gitignore found");
  });

  it("throws when no package.json exists", async () => {
    projectDir = createTestProject({ withConfig: true });
    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(projectDir, "package.json"));

    const ctx = buildTestContext(projectDir);
    await expect(initCommand(ctx)).rejects.toThrow(/package\.json/);
  });

  it("throws when no supabase/config.toml exists", async () => {
    projectDir = createTestProject(); // no withConfig
    const ctx = buildTestContext(projectDir);
    await expect(initCommand(ctx)).rejects.toThrow(/config\.toml/);
  });

  it("skips template creation in non-interactive mode when template already exists", async () => {
    projectDir = createTestProject({ withConfig: true, withTemplate: true });
    const ctx = buildTestContext(projectDir);

    await initCommand(ctx);

    expect(consoleCap.output).toContain("Skipping template creation");
  });
});
