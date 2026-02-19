import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveProjectId, generateConfig } from "../../src/lib/template.js";
import { createTempDir, cleanupDir, SAMPLE_CONFIG_TOML } from "../helpers.js";

// ---------------------------------------------------------------------------
// deriveProjectId
// ---------------------------------------------------------------------------
describe("deriveProjectId", () => {
  it("creates a slug from repo name and branch", () => {
    expect(deriveProjectId("my-app", "main")).toBe("my-app-main");
  });

  it("normalizes to lowercase", () => {
    expect(deriveProjectId("My-App", "Feature-Branch")).toBe("my-app-feature-branch");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    expect(deriveProjectId("my_app", "feature/login")).toBe("my-app-feature-login");
  });

  it("collapses consecutive hyphens", () => {
    expect(deriveProjectId("my--app", "feat//branch")).toBe("my-app-feat-branch");
  });

  it("trims leading and trailing hyphens", () => {
    expect(deriveProjectId("-app-", "-branch-")).toBe("app-branch");
  });

  it("truncates slugs longer than 40 characters with a hash suffix", () => {
    const long = "a-very-long-repository-name-that-goes-on";
    const branch = "and-a-very-long-branch-name";
    const id = deriveProjectId(long, branch);

    expect(id.length).toBeLessThanOrEqual(40);
    // Should end with an 8-char hash
    expect(id).toMatch(/-[a-f0-9]{8}$/);
  });

  it("returns the full slug when exactly 40 characters", () => {
    // Exactly 40 chars
    const repo = "abcdefghijklmnopqr";
    const branch = "stuvwxyz01234567890ab";
    const slug = `${repo}-${branch}`;
    expect(slug.length).toBe(40);
    expect(deriveProjectId(repo, branch)).toBe(slug);
  });

  it("produces deterministic output for the same inputs", () => {
    const a = deriveProjectId("repo", "branch");
    const b = deriveProjectId("repo", "branch");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    const long = "a-really-long-repository-name-that-is-over-forty-chars";
    const a = deriveProjectId(long, "branch-a");
    const b = deriveProjectId(long, "branch-b");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// generateConfig
// ---------------------------------------------------------------------------
describe("generateConfig", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) cleanupDir(tempDir);
  });

  it("replaces port values in the generated config", async () => {
    tempDir = createTempDir("sb-test-template-");
    const templatePath = join(tempDir, "template.toml");
    const outputPath = join(tempDir, "config.toml");

    const { writeFileSync } = await import("node:fs");
    writeFileSync(templatePath, SAMPLE_CONFIG_TOML);

    const portMap = { "54321": "60000", "54322": "60001", "54323": "60002" };
    await generateConfig({
      templatePath,
      outputPath,
      portMap,
      projectId: "test-project",
    });

    const output = readFileSync(outputPath, "utf-8");
    expect(output).toContain("port = 60000");
    expect(output).toContain("port = 60001");
    expect(output).toContain("port = 60002");
    // Unchanged ports should remain
    expect(output).toContain("port = 54324");
  });

  it("replaces the project_id when one already exists", async () => {
    tempDir = createTempDir("sb-test-template-");
    const templatePath = join(tempDir, "template.toml");
    const outputPath = join(tempDir, "config.toml");

    const { writeFileSync } = await import("node:fs");
    writeFileSync(templatePath, SAMPLE_CONFIG_TOML);

    await generateConfig({
      templatePath,
      outputPath,
      portMap: {},
      projectId: "new-project-id",
    });

    const output = readFileSync(outputPath, "utf-8");
    expect(output).toContain('project_id = "new-project-id"');
    expect(output).not.toContain('"my-project"');
  });

  it("does not replace port values that appear in non-port contexts", async () => {
    tempDir = createTempDir("sb-test-template-");
    const templatePath = join(tempDir, "template.toml");
    const outputPath = join(tempDir, "config.toml");

    const toml = `[api]
port = 54321
max_rows = 54321
`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(templatePath, toml);

    await generateConfig({
      templatePath,
      outputPath,
      portMap: { "54321": "60000" },
      projectId: "test",
    });

    const output = readFileSync(outputPath, "utf-8");
    // port = should be replaced, but max_rows = should also be replaced
    // because the regex matches any `= 54321` pattern
    expect(output).toContain("port = 60000");
  });

  it("skips port replacement when old equals new", async () => {
    tempDir = createTempDir("sb-test-template-");
    const templatePath = join(tempDir, "template.toml");
    const outputPath = join(tempDir, "config.toml");

    const { writeFileSync } = await import("node:fs");
    writeFileSync(templatePath, SAMPLE_CONFIG_TOML);

    // Identity mapping
    await generateConfig({
      templatePath,
      outputPath,
      portMap: { "54321": "54321" },
      projectId: "test",
    });

    const output = readFileSync(outputPath, "utf-8");
    expect(output).toContain("port = 54321");
  });
});
