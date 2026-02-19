import { describe, it, expect, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { vi } from "vitest";
import { mkdirSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ── Mock setup ──────────────────────────────────────────────────────────────
const testHome = vi.hoisted(() => {
  return `/tmp/sb-vitest-nuke-${process.pid}-${Date.now()}`;
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => testHome };
});

vi.mock("../../src/lib/exec.js", () => ({
  getGitBranch: vi.fn(async () => "test-branch"),
  getGitRepoName: vi.fn(async () => "test-repo"),
  supabaseStart: vi.fn(async () => "Started"),
  supabaseStop: vi.fn(async () => "Stopped"),
}));

// ── Imports ─────────────────────────────────────────────────────────────────
import { nukeCommand } from "../../src/commands/nuke.js";
import { registerWorktree, getAllEntries } from "../../src/lib/registry.js";
import { supabaseStop } from "../../src/lib/exec.js";
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

describe("nukeCommand", () => {
  let consoleCap: ReturnType<typeof captureConsole>;

  beforeAll(() => {
    mkdirSync(testHome, { recursive: true });
  });

  beforeEach(() => {
    consoleCap = captureConsole();
    vi.mocked(supabaseStop).mockResolvedValue("Stopped");
    if (existsSync(REGISTRY_FILE)) unlinkSync(REGISTRY_FILE);
  });

  afterEach(() => {
    consoleCap.restore();
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("stops all instances and clears the registry", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/a", branch: "branch-a" }));
    await registerWorktree(makeEntry({ worktreePath: "/b", branch: "branch-b" }));

    const ctx = buildTestContext("/tmp");
    await nukeCommand(ctx);

    const entries = await getAllEntries();
    expect(entries.length).toBe(0);
    expect(consoleCap.output).toContain("All instances nuked");
  });

  it("calls supabase stop for each instance", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/a" }));
    await registerWorktree(makeEntry({ worktreePath: "/b" }));

    const ctx = buildTestContext("/tmp");
    await nukeCommand(ctx);

    expect(supabaseStop).toHaveBeenCalledWith("/a");
    expect(supabaseStop).toHaveBeenCalledWith("/b");
  });

  it("continues even if supabase stop fails for some instances", async () => {
    vi.mocked(supabaseStop)
      .mockRejectedValueOnce(new Error("Docker dead"))
      .mockResolvedValueOnce("OK");

    await registerWorktree(makeEntry({ worktreePath: "/fail", branch: "fail" }));
    await registerWorktree(makeEntry({ worktreePath: "/ok", branch: "ok" }));

    const ctx = buildTestContext("/tmp");
    await nukeCommand(ctx);

    // Registry should still be cleared
    const entries = await getAllEntries();
    expect(entries.length).toBe(0);
    expect(consoleCap.output).toContain("Registry cleared");
  });

  it("handles empty registry", async () => {
    const ctx = buildTestContext("/tmp");
    await nukeCommand(ctx);

    expect(consoleCap.output).toContain("No instances to nuke");
  });

  it("lists instances before nuking them", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/a", branch: "feature-x" }));

    const ctx = buildTestContext("/tmp");
    await nukeCommand(ctx);

    expect(consoleCap.output).toContain("feature-x");
  });
});
