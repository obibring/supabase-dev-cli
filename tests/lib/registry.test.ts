import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { vi } from "vitest";
import { mkdirSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Create a unique temp home BEFORE any mocked imports load.
// vi.hoisted runs before imports are resolved, so the value is ready
// when registry.ts computes REGISTRY_FILE = join(homedir(), ...).
const testHome = vi.hoisted(() => {
  return `/tmp/sb-vitest-registry-${process.pid}-${Date.now()}`;
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => testHome };
});

// These imports happen AFTER the mock is in place, so registry.ts
// will use our mocked homedir for REGISTRY_FILE.
import {
  getWorktreeEntry,
  getAllocatedPortBases,
  registerWorktree,
  unregisterWorktree,
  getAllEntries,
  cleanupStaleEntries,
  clearRegistry,
} from "../../src/lib/registry.js";
import type { WorktreeEntry } from "../../src/lib/types.js";

const REGISTRY_FILE = join(testHome, ".sb-worktrees.json");

function makeEntry(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    worktreePath: "/tmp/fake-worktree",
    branch: "main",
    portBase: 54321,
    projectId: "test-project-main",
    allocatedAt: new Date().toISOString(),
    portMap: { "54321": "54321" },
    ...overrides,
  };
}

beforeAll(() => {
  mkdirSync(testHome, { recursive: true });
});

beforeEach(() => {
  // Clear registry between tests
  if (existsSync(REGISTRY_FILE)) {
    unlinkSync(REGISTRY_FILE);
  }
});

afterAll(() => {
  rmSync(testHome, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// registerWorktree / getAllEntries
// ---------------------------------------------------------------------------
describe("registerWorktree / getAllEntries", () => {
  it("registers a new worktree entry", async () => {
    const entry = makeEntry();
    await registerWorktree(entry);

    const entries = await getAllEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].worktreePath).toBe(entry.worktreePath);
    expect(entries[0].branch).toBe("main");
  });

  it("replaces an entry with the same worktreePath", async () => {
    const entry1 = makeEntry({ portBase: 54321 });
    const entry2 = makeEntry({ portBase: 60000 });

    await registerWorktree(entry1);
    await registerWorktree(entry2);

    const entries = await getAllEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].portBase).toBe(60000);
  });

  it("registers multiple entries with different paths", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/a", portBase: 54321 }));
    await registerWorktree(makeEntry({ worktreePath: "/b", portBase: 54421 }));

    const entries = await getAllEntries();
    expect(entries.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getWorktreeEntry
// ---------------------------------------------------------------------------
describe("getWorktreeEntry", () => {
  it("returns the entry for a registered path", async () => {
    const entry = makeEntry({ worktreePath: "/my/project" });
    await registerWorktree(entry);

    const found = await getWorktreeEntry("/my/project");
    expect(found).toBeDefined();
    expect(found!.portBase).toBe(54321);
  });

  it("returns undefined for an unregistered path", async () => {
    const found = await getWorktreeEntry("/nonexistent");
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllocatedPortBases
// ---------------------------------------------------------------------------
describe("getAllocatedPortBases", () => {
  it("returns all port bases", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/a", portBase: 54321 }));
    await registerWorktree(makeEntry({ worktreePath: "/b", portBase: 54421 }));

    const bases = await getAllocatedPortBases();
    expect(bases).toEqual(expect.arrayContaining([54321, 54421]));
  });

  it("returns empty array when registry is empty", async () => {
    const bases = await getAllocatedPortBases();
    expect(bases).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// unregisterWorktree
// ---------------------------------------------------------------------------
describe("unregisterWorktree", () => {
  it("removes the entry and returns true", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/project" }));

    const removed = await unregisterWorktree("/project");
    expect(removed).toBe(true);

    const entries = await getAllEntries();
    expect(entries.length).toBe(0);
  });

  it("returns false when the path is not in the registry", async () => {
    const removed = await unregisterWorktree("/nonexistent");
    expect(removed).toBe(false);
  });

  it("does not affect other entries", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/a" }));
    await registerWorktree(makeEntry({ worktreePath: "/b" }));

    await unregisterWorktree("/a");
    const entries = await getAllEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].worktreePath).toBe("/b");
  });
});

// ---------------------------------------------------------------------------
// cleanupStaleEntries
// ---------------------------------------------------------------------------
describe("cleanupStaleEntries", () => {
  it("removes entries whose worktreePath does not exist on disk", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/nonexistent/path" }));
    await registerWorktree(makeEntry({ worktreePath: testHome })); // this path exists

    const stale = await cleanupStaleEntries();
    expect(stale.length).toBe(1);
    expect(stale[0].worktreePath).toBe("/nonexistent/path");

    const remaining = await getAllEntries();
    expect(remaining.length).toBe(1);
    expect(remaining[0].worktreePath).toBe(testHome);
  });

  it("returns empty array when no entries are stale", async () => {
    await registerWorktree(makeEntry({ worktreePath: testHome }));
    const stale = await cleanupStaleEntries();
    expect(stale).toEqual([]);
  });

  it("returns empty array when registry is empty", async () => {
    const stale = await cleanupStaleEntries();
    expect(stale).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearRegistry
// ---------------------------------------------------------------------------
describe("clearRegistry", () => {
  it("removes all entries", async () => {
    await registerWorktree(makeEntry({ worktreePath: "/a" }));
    await registerWorktree(makeEntry({ worktreePath: "/b" }));

    await clearRegistry();

    const entries = await getAllEntries();
    expect(entries.length).toBe(0);
  });

  it("works when registry is already empty", async () => {
    await clearRegistry();
    const entries = await getAllEntries();
    expect(entries.length).toBe(0);
  });
});
