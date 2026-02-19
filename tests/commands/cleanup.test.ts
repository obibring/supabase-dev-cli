import { describe, it, expect, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { vi } from "vitest";
import { mkdirSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ── Mock setup ──────────────────────────────────────────────────────────────
const testHome = vi.hoisted(() => {
  return `/tmp/sb-vitest-cleanup-${process.pid}-${Date.now()}`;
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => testHome };
});

// ── Imports ─────────────────────────────────────────────────────────────────
import { cleanupCommand } from "../../src/commands/cleanup.js";
import { registerWorktree, getAllEntries } from "../../src/lib/registry.js";
import type { WorktreeEntry } from "../../src/lib/types.js";
import { buildTestContext, captureConsole } from "../helpers.js";

const REGISTRY_FILE = join(testHome, ".sb-worktrees.json");

function makeEntry(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    worktreePath: "/tmp/fake-worktree",
    branch: "main",
    portBase: 54321,
    projectId: "test-project-main",
    allocatedAt: new Date().toISOString(),
    portMap: {},
    ...overrides,
  };
}

describe("cleanupCommand", () => {
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

  it("removes entries whose worktree paths no longer exist", async () => {
    await registerWorktree(
      makeEntry({
        worktreePath: "/nonexistent/stale/path",
        branch: "stale-branch",
      })
    );
    await registerWorktree(
      makeEntry({
        worktreePath: testHome, // exists
        branch: "active-branch",
      })
    );

    const ctx = buildTestContext("/tmp");
    await cleanupCommand(ctx);

    expect(consoleCap.output).toContain("Removed 1 stale");
    expect(consoleCap.output).toContain("stale-branch");

    const remaining = await getAllEntries();
    expect(remaining.length).toBe(1);
    expect(remaining[0].branch).toBe("active-branch");
  });

  it("reports when no stale entries are found", async () => {
    await registerWorktree(makeEntry({ worktreePath: testHome }));

    const ctx = buildTestContext("/tmp");
    await cleanupCommand(ctx);

    expect(consoleCap.output).toContain("No stale entries found");
  });

  it("works with an empty registry", async () => {
    const ctx = buildTestContext("/tmp");
    await cleanupCommand(ctx);

    expect(consoleCap.output).toContain("No stale entries found");
  });

  it("removes all entries when all paths are stale", async () => {
    await registerWorktree(
      makeEntry({ worktreePath: "/gone/a", branch: "a" })
    );
    await registerWorktree(
      makeEntry({ worktreePath: "/gone/b", branch: "b" })
    );

    const ctx = buildTestContext("/tmp");
    await cleanupCommand(ctx);

    expect(consoleCap.output).toContain("Removed 2 stale");

    const remaining = await getAllEntries();
    expect(remaining.length).toBe(0);
  });
});
