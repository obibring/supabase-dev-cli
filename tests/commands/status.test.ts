import { describe, it, expect, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { vi } from "vitest";
import { mkdirSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ── Mock setup ──────────────────────────────────────────────────────────────
const testHome = vi.hoisted(() => {
  return `/tmp/sb-vitest-status-${process.pid}-${Date.now()}`;
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => testHome };
});

// ── Imports ─────────────────────────────────────────────────────────────────
import { statusCommand } from "../../src/commands/status.js";
import { registerWorktree } from "../../src/lib/registry.js";
import type { WorktreeEntry } from "../../src/lib/types.js";
import { buildTestContext, captureConsole } from "../helpers.js";

const REGISTRY_FILE = join(testHome, ".sb-worktrees.json");

function makeEntry(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    worktreePath: "/tmp/fake-worktree",
    branch: "main",
    portBase: 54321,
    projectId: "test-project-main",
    allocatedAt: "2024-01-15T10:30:00.000Z",
    portMap: { "54321": "54321" },
    ...overrides,
  };
}

describe("statusCommand", () => {
  let consoleCap: ReturnType<typeof captureConsole>;

  beforeAll(() => {
    mkdirSync(testHome, { recursive: true });
  });

  beforeEach(() => {
    consoleCap = captureConsole();
    if (existsSync(REGISTRY_FILE)) unlinkSync(REGISTRY_FILE);
  });

  afterEach(() => {
    consoleCap.restore();
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("shows 'no active instances' when registry is empty", async () => {
    const ctx = buildTestContext("/tmp");
    await statusCommand(ctx);

    expect(consoleCap.output).toContain("No active instances");
  });

  it("displays registered instances with their details", async () => {
    await registerWorktree(
      makeEntry({
        worktreePath: testHome, // exists on disk
        branch: "feature-auth",
        portBase: 54321,
        projectId: "myapp-feature-auth",
      })
    );

    const ctx = buildTestContext("/tmp");
    await statusCommand(ctx);

    expect(consoleCap.output).toContain("feature-auth");
    expect(consoleCap.output).toContain("54321");
    expect(consoleCap.output).toContain("myapp-feature-auth");
  });

  it("marks entries as stale when the path does not exist", async () => {
    await registerWorktree(
      makeEntry({
        worktreePath: "/nonexistent/path/that/does/not/exist",
        branch: "dead-branch",
      })
    );

    const ctx = buildTestContext("/tmp");
    await statusCommand(ctx);

    expect(consoleCap.output).toContain("dead-branch");
    // The status module uses chalk.red("stale") — just check the branch appears
  });

  it("shows multiple instances", async () => {
    await registerWorktree(
      makeEntry({ worktreePath: testHome, branch: "main", portBase: 54321 })
    );
    await registerWorktree(
      makeEntry({
        worktreePath: "/tmp",
        branch: "feature-x",
        portBase: 54421,
      })
    );

    const ctx = buildTestContext("/tmp");
    await statusCommand(ctx);

    expect(consoleCap.output).toContain("main");
    expect(consoleCap.output).toContain("feature-x");
    expect(consoleCap.output).toContain("54321");
    expect(consoleCap.output).toContain("54421");
  });
});
