import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  replacePortsInEnvContent,
  discoverEnvFiles,
  updateEnvFiles,
  restoreAllEnvFiles,
  backupEnvFile,
  restoreEnvFile,
  findModifiedEnvFiles,
} from "../../src/lib/env.js";
import {
  createTestProject,
  cleanupDir,
  SAMPLE_ENV_CONTENT,
} from "../helpers.js";

// ---------------------------------------------------------------------------
// replacePortsInEnvContent (pure function — no filesystem)
// ---------------------------------------------------------------------------
describe("replacePortsInEnvContent", () => {
  it("replaces ports after localhost", () => {
    const content = "URL=http://localhost:54321/api";
    const result = replacePortsInEnvContent(content, { "54321": "60000" });
    expect(result).toBe("URL=http://localhost:60000/api");
  });

  it("replaces ports after 127.0.0.1", () => {
    const content = "URL=http://127.0.0.1:54321";
    const result = replacePortsInEnvContent(content, { "54321": "60000" });
    expect(result).toBe("URL=http://127.0.0.1:60000");
  });

  it("replaces ports after 0.0.0.0", () => {
    const content = "URL=http://0.0.0.0:54321";
    const result = replacePortsInEnvContent(content, { "54321": "60000" });
    expect(result).toBe("URL=http://0.0.0.0:60000");
  });

  it("replaces ports after host.docker.internal", () => {
    const content = "URL=http://host.docker.internal:54321";
    const result = replacePortsInEnvContent(content, { "54321": "60000" });
    expect(result).toBe("URL=http://host.docker.internal:60000");
  });

  it("does NOT replace standalone port numbers (no host prefix)", () => {
    const result = replacePortsInEnvContent(SAMPLE_ENV_CONTENT, {
      "54321": "60000",
    });
    // SOME_UNRELATED_VALUE=54321 should NOT be changed
    expect(result).toContain("SOME_UNRELATED_VALUE=54321");
    // But localhost:54321 SHOULD be changed
    expect(result).toContain("localhost:60000");
  });

  it("replaces multiple different ports in one pass", () => {
    const content = `API=http://localhost:54321
DB=postgresql://localhost:54322/db`;
    const result = replacePortsInEnvContent(content, {
      "54321": "60000",
      "54322": "60001",
    });
    expect(result).toContain("localhost:60000");
    expect(result).toContain("localhost:60001");
  });

  it("replaces all occurrences of the same port", () => {
    const content = `URL1=http://localhost:54321
URL2=http://127.0.0.1:54321`;
    const result = replacePortsInEnvContent(content, { "54321": "60000" });
    expect(result).not.toContain("54321");
    expect(result).toContain("localhost:60000");
    expect(result).toContain("127.0.0.1:60000");
  });

  it("skips replacement when old equals new", () => {
    const content = "URL=http://localhost:54321";
    const result = replacePortsInEnvContent(content, { "54321": "54321" });
    expect(result).toBe(content);
  });

  it("does not modify content when no ports match", () => {
    const content = "URL=http://localhost:9999";
    const result = replacePortsInEnvContent(content, { "54321": "60000" });
    expect(result).toBe(content);
  });

  it("handles empty content", () => {
    expect(replacePortsInEnvContent("", { "54321": "60000" })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// discoverEnvFiles
// ---------------------------------------------------------------------------
describe("discoverEnvFiles", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupDir(projectDir);
  });

  it("discovers .env files matching patterns", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    const files = await discoverEnvFiles([".env*"], projectDir);

    expect(files.length).toBe(2);
    expect(files.some((f) => f.endsWith(".env"))).toBe(true);
    expect(files.some((f) => f.endsWith(".env.local"))).toBe(true);
  });

  it("returns absolute paths", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    const files = await discoverEnvFiles([".env*"], projectDir);

    for (const f of files) {
      expect(f.startsWith("/")).toBe(true);
    }
  });

  it("ignores .sb-backup files", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    writeFileSync(join(projectDir, ".env.sb-backup"), "backup");

    const files = await discoverEnvFiles([".env*"], projectDir);
    expect(files.every((f) => !f.endsWith(".sb-backup"))).toBe(true);
  });

  it("returns empty array when no files match", async () => {
    projectDir = createTestProject();
    const files = await discoverEnvFiles([".env*"], projectDir);
    expect(files).toEqual([]);
  });

  it("deduplicates overlapping patterns", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    const files = await discoverEnvFiles([".env*", ".env"], projectDir);
    const unique = [...new Set(files)];
    expect(files.length).toBe(unique.length);
  });
});

// ---------------------------------------------------------------------------
// backupEnvFile / restoreEnvFile
// ---------------------------------------------------------------------------
describe("backupEnvFile / restoreEnvFile", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupDir(projectDir);
  });

  it("creates a .sb-backup copy", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    const envPath = join(projectDir, ".env");
    const backupPath = await backupEnvFile(envPath);

    expect(backupPath).toBe(envPath + ".sb-backup");
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, "utf-8")).toBe(readFileSync(envPath, "utf-8"));
  });

  it("restores from backup and removes the backup file", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    const envPath = join(projectDir, ".env");
    const original = readFileSync(envPath, "utf-8");

    await backupEnvFile(envPath);
    // Modify the original
    writeFileSync(envPath, "MODIFIED=true");

    const restored = await restoreEnvFile(envPath);
    expect(restored).toBe(true);
    expect(readFileSync(envPath, "utf-8")).toBe(original);
    expect(existsSync(envPath + ".sb-backup")).toBe(false);
  });

  it("returns false when no backup exists", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    const envPath = join(projectDir, ".env");
    expect(await restoreEnvFile(envPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateEnvFiles
// ---------------------------------------------------------------------------
describe("updateEnvFiles", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupDir(projectDir);
  });

  it("modifies env files and creates backups", async () => {
    projectDir = createTestProject({ withEnvFiles: true });

    const modified = await updateEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
      portMap: { "54321": "60000", "54322": "60001" },
    });

    expect(modified.length).toBe(2);
    expect(modified).toContain(".env");
    expect(modified).toContain(".env.local");

    // Check that backups exist
    expect(existsSync(join(projectDir, ".env.sb-backup"))).toBe(true);
    expect(existsSync(join(projectDir, ".env.local.sb-backup"))).toBe(true);

    // Check that ports were replaced
    const envContent = readFileSync(join(projectDir, ".env"), "utf-8");
    expect(envContent).toContain("localhost:60000");
    expect(envContent).toContain("localhost:60001");
  });

  it("does not modify files with no matching ports", async () => {
    projectDir = createTestProject({ withEnvFiles: true, envContent: "FOO=bar\nBAZ=123\n" });

    const modified = await updateEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
      portMap: { "54321": "60000" },
    });

    expect(modified).toEqual([]);
    // No backups should be created
    expect(existsSync(join(projectDir, ".env.sb-backup"))).toBe(false);
  });

  it("returns relative paths", async () => {
    projectDir = createTestProject({ withEnvFiles: true });

    const modified = await updateEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
      portMap: { "54321": "60000" },
    });

    for (const path of modified) {
      expect(path.startsWith("/")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// restoreAllEnvFiles
// ---------------------------------------------------------------------------
describe("restoreAllEnvFiles", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupDir(projectDir);
  });

  it("restores all modified env files from backups", async () => {
    projectDir = createTestProject({ withEnvFiles: true });
    const originalEnv = readFileSync(join(projectDir, ".env"), "utf-8");

    // First update (creates backups)
    await updateEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
      portMap: { "54321": "60000" },
    });

    // Verify files were changed
    expect(readFileSync(join(projectDir, ".env"), "utf-8")).not.toBe(originalEnv);

    // Restore
    const restored = await restoreAllEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
    });

    expect(restored.length).toBe(2);
    expect(readFileSync(join(projectDir, ".env"), "utf-8")).toBe(originalEnv);
    expect(existsSync(join(projectDir, ".env.sb-backup"))).toBe(false);
  });

  it("returns empty array when no backups exist", async () => {
    projectDir = createTestProject({ withEnvFiles: true });

    const restored = await restoreAllEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
    });

    expect(restored).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findModifiedEnvFiles
// ---------------------------------------------------------------------------
describe("findModifiedEnvFiles", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupDir(projectDir);
  });

  it("finds files that have backups", async () => {
    projectDir = createTestProject({ withEnvFiles: true });

    // Create a backup for .env only
    await backupEnvFile(join(projectDir, ".env"));

    const modified = await findModifiedEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
    });

    expect(modified).toEqual([".env"]);
  });

  it("returns empty when no backups exist", async () => {
    projectDir = createTestProject({ withEnvFiles: true });

    const modified = await findModifiedEnvFiles({
      patterns: [".env*"],
      projectRoot: projectDir,
    });

    expect(modified).toEqual([]);
  });
});
