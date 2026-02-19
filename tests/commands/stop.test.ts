import { describe, it, expect, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { vi } from "vitest";
import { readFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ── Mock setup ──────────────────────────────────────────────────────────────
const testHome = vi.hoisted(() => {
  return `/tmp/sb-vitest-stop-${process.pid}-${Date.now()}`;
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => testHome };
});

vi.mock("../../src/lib/exec.js", () => ({
  getGitBranch: vi.fn(async () => "test-branch"),
  getGitRepoName: vi.fn(async () => "test-repo"),
  isGitWorktree: vi.fn(async () => ({ linked: false, name: null })),
  supabaseStart: vi.fn(async () => "Started"),
  supabaseStop: vi.fn(async () => "Stopped"),
}));

// ── Imports ─────────────────────────────────────────────────────────────────
import { startCommand } from "../../src/commands/start.js";
import { stopCommand } from "../../src/commands/stop.js";
import { getAllEntries } from "../../src/lib/registry.js";
import { supabaseStop } from "../../src/lib/exec.js";
import {
  createTestProject,
  cleanupDir,
  buildTestContext,
  captureConsole,
  SAMPLE_ENV_CONTENT,
} from "../helpers.js";

const REGISTRY_FILE = join(testHome, ".sb-worktrees.json");

describe("stopCommand", () => {
  let projectDir: string;
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
    if (projectDir) cleanupDir(projectDir);
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("stops the instance and unregisters from the registry", async () => {
    projectDir = createTestProject({
      withConfig: true,
      withTemplate: true,
      withEnvFiles: true,
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env", ".env.local"],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });

    // Start first
    await startCommand(buildTestContext(projectDir));

    // Verify registered
    let entries = await getAllEntries();
    expect(entries.length).toBe(1);

    // Clear console capture and stop
    consoleCap.restore();
    consoleCap = captureConsole();
    await stopCommand(buildTestContext(projectDir));

    // Should be unregistered
    entries = await getAllEntries();
    expect(entries.length).toBe(0);

    expect(consoleCap.output).toContain("stopped and cleaned up");
  });

  it("restores .env files from backups", async () => {
    // Pre-register a dummy entry at 54321 so this project gets 54421
    // (different from template ports), forcing actual .env replacements.
    const { registerWorktree } = await import("../../src/lib/registry.js");
    await registerWorktree({
      worktreePath: "/dummy-occupying-default",
      branch: "dummy",
      portBase: 54321,
      projectId: "dummy",
      allocatedAt: new Date().toISOString(),
      portMap: {},
    });

    projectDir = createTestProject({
      withConfig: true,
      withTemplate: true,
      withEnvFiles: true,
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env", ".env.local"],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });

    const originalEnv = readFileSync(join(projectDir, ".env"), "utf-8");

    // Start (modifies .env files — ports change from 54321→54421)
    await startCommand(buildTestContext(projectDir));
    expect(readFileSync(join(projectDir, ".env"), "utf-8")).not.toBe(originalEnv);

    // Stop (restores .env files)
    consoleCap.restore();
    consoleCap = captureConsole();
    await stopCommand(buildTestContext(projectDir));

    expect(readFileSync(join(projectDir, ".env"), "utf-8")).toBe(originalEnv);
    // Backups should be removed
    expect(existsSync(join(projectDir, ".env.sb-backup"))).toBe(false);
  });

  it("calls supabase stop", async () => {
    projectDir = createTestProject({
      withConfig: true,
      withTemplate: true,
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });

    await startCommand(buildTestContext(projectDir));

    consoleCap.restore();
    consoleCap = captureConsole();
    await stopCommand(buildTestContext(projectDir));

    expect(supabaseStop).toHaveBeenCalledWith(projectDir);
  });

  it("handles stop when no active instance exists", async () => {
    projectDir = createTestProject({
      withConfig: true,
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [],
          configTemplate: "supabase/config.toml.template",
        },
      },
    });

    await stopCommand(buildTestContext(projectDir));

    expect(consoleCap.output).toContain("No active instance found");
  });

  it("continues cleanup even if supabase stop fails", async () => {
    vi.mocked(supabaseStop).mockRejectedValueOnce(new Error("Docker not running"));

    projectDir = createTestProject({
      withConfig: true,
      withTemplate: true,
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });

    await startCommand(buildTestContext(projectDir));

    consoleCap.restore();
    consoleCap = captureConsole();
    await stopCommand(buildTestContext(projectDir));

    // Registry should still be cleaned up
    const entries = await getAllEntries();
    expect(entries.length).toBe(0);
    expect(consoleCap.output).toContain("Removed registry entry");
  });
});
