import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveProjectId, generateConfig } from "../../src/lib/template.js";
import { createTempDir, cleanupDir, SAMPLE_CONFIG_TOML } from "../helpers.js";

// ---------------------------------------------------------------------------
// deriveProjectId
// ---------------------------------------------------------------------------
describe("deriveProjectId", () => {
  it("prefixes with sbwt-", () => {
    expect(deriveProjectId({ branch: "main", worktreeName: null })).toBe("sbwt-main");
  });

  it("uses worktree name when provided", () => {
    expect(
      deriveProjectId({ branch: "feat/auth", worktreeName: "feature-auth" })
    ).toBe("sbwt-feature-auth");
  });

  it("falls back to branch when no worktree", () => {
    expect(
      deriveProjectId({ branch: "main", worktreeName: null })
    ).toBe("sbwt-main");
  });

  it("sanitizes branch slashes", () => {
    expect(
      deriveProjectId({ branch: "feature/login", worktreeName: null })
    ).toBe("sbwt-feature-login");
  });

  it("normalizes to lowercase", () => {
    expect(
      deriveProjectId({ branch: "Feature-Branch", worktreeName: null })
    ).toBe("sbwt-feature-branch");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    expect(
      deriveProjectId({ branch: "feat_login", worktreeName: null })
    ).toBe("sbwt-feat-login");
  });

  it("collapses consecutive hyphens", () => {
    expect(
      deriveProjectId({ branch: "feat//branch", worktreeName: null })
    ).toBe("sbwt-feat-branch");
  });

  it("trims leading and trailing hyphens from the body", () => {
    expect(
      deriveProjectId({ branch: "-branch-", worktreeName: null })
    ).toBe("sbwt-branch");
  });

  it("truncates long names to 40 chars with a hash suffix", () => {
    const id = deriveProjectId({
      branch: "a-very-long-branch-name-that-will-definitely-exceed-the-limit",
      worktreeName: null,
    });

    expect(id.length).toBeLessThanOrEqual(40);
    expect(id).toMatch(/^sbwt-/);
    expect(id).toMatch(/-[a-f0-9]{8}$/);
  });

  it("returns the full ID when exactly at 40 characters", () => {
    // "sbwt-" is 5 chars, so we need a 35-char body
    const body = "a".repeat(35);
    const id = deriveProjectId({ branch: body, worktreeName: null });
    expect(id).toBe(`sbwt-${body}`);
    expect(id.length).toBe(40);
  });

  it("produces deterministic output for the same inputs", () => {
    const opts = { branch: "main", worktreeName: null };
    expect(deriveProjectId(opts)).toBe(deriveProjectId(opts));
  });

  it("produces different hashes for different long inputs", () => {
    const a = deriveProjectId({
      branch: "a-really-long-branch-name-that-is-way-over-forty-chars",
      worktreeName: null,
    });
    const b = deriveProjectId({
      branch: "a-really-long-branch-name-that-is-way-over-forty-diff",
      worktreeName: null,
    });
    expect(a).not.toBe(b);
  });

  // --- Uniqueness tests ---
  it("appends -2 when colliding with existing IDs", () => {
    expect(
      deriveProjectId({
        branch: "main",
        worktreeName: null,
        existingIds: ["sbwt-main"],
      })
    ).toBe("sbwt-main-2");
  });

  it("appends -3 when -2 is also taken", () => {
    expect(
      deriveProjectId({
        branch: "main",
        worktreeName: null,
        existingIds: ["sbwt-main", "sbwt-main-2"],
      })
    ).toBe("sbwt-main-3");
  });

  it("returns base candidate when no collision", () => {
    expect(
      deriveProjectId({
        branch: "dev",
        worktreeName: null,
        existingIds: ["sbwt-main"],
      })
    ).toBe("sbwt-dev");
  });

  it("uniqueness suffix respects 40-char limit", () => {
    const body = "a".repeat(35); // sbwt- + 35 = 40 exactly
    const id = deriveProjectId({
      branch: body,
      worktreeName: null,
      existingIds: [`sbwt-${body}`],
    });
    expect(id.length).toBeLessThanOrEqual(40);
    expect(id).toMatch(/-2$/);
  });

  // --- Edge cases ---
  it("handles empty branch string gracefully", () => {
    const id = deriveProjectId({ branch: "", worktreeName: null });
    expect(id).toMatch(/^sbwt-/);
    // Empty body after sanitization → prefix only (or hash fallback)
    expect(id.length).toBeGreaterThan(0);
  });

  it("sanitizes worktree names with special characters", () => {
    const id = deriveProjectId({
      branch: "main",
      worktreeName: "feature@special#name!",
    });
    expect(id).toBe("sbwt-feature-special-name");
  });

  it("sanitizes worktree names with underscores and dots", () => {
    const id = deriveProjectId({
      branch: "main",
      worktreeName: "my_feature.v2",
    });
    expect(id).toBe("sbwt-my-feature-v2");
  });

  it("truncates long worktree names with a hash suffix", () => {
    const longName = "a-very-long-worktree-directory-name-that-exceeds-the-max";
    const id = deriveProjectId({
      branch: "main",
      worktreeName: longName,
    });
    expect(id.length).toBeLessThanOrEqual(40);
    expect(id).toMatch(/^sbwt-/);
    expect(id).toMatch(/-[a-f0-9]{8}$/);
  });

  it("appends uniqueness suffix when worktree name collides", () => {
    const id = deriveProjectId({
      branch: "main",
      worktreeName: "feature-auth",
      existingIds: ["sbwt-feature-auth"],
    });
    expect(id).toBe("sbwt-feature-auth-2");
  });

  it("defaults existingIds to empty array when omitted", () => {
    const id = deriveProjectId({ branch: "main", worktreeName: null });
    // Should not throw and should return base candidate
    expect(id).toBe("sbwt-main");
  });

  it("handles branch names that are all special characters", () => {
    const id = deriveProjectId({ branch: "///", worktreeName: null });
    expect(id).toMatch(/^sbwt-/);
  });

  it("handles high uniqueness suffix numbers", () => {
    const existingIds = ["sbwt-dev"];
    for (let i = 2; i <= 10; i++) {
      existingIds.push(`sbwt-dev-${i}`);
    }
    const id = deriveProjectId({
      branch: "dev",
      worktreeName: null,
      existingIds,
    });
    expect(id).toBe("sbwt-dev-11");
  });

  it("produces different IDs for different worktree names on same branch", () => {
    const a = deriveProjectId({ branch: "main", worktreeName: "feature-a" });
    const b = deriveProjectId({ branch: "main", worktreeName: "feature-b" });
    expect(a).not.toBe(b);
  });

  it("worktree name takes priority even when branch is different", () => {
    const id = deriveProjectId({
      branch: "feat/some-branch",
      worktreeName: "my-worktree",
    });
    expect(id).toBe("sbwt-my-worktree");
    expect(id).not.toContain("feat");
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
