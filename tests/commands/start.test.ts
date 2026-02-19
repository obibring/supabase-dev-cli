import { describe, it, expect, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { vi } from "vitest";
import { readFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ── Mock setup (hoisted) ────────────────────────────────────────────────────
// Redirect the registry to a temp directory
const testHome = vi.hoisted(() => {
  return `/tmp/sb-vitest-start-${process.pid}-${Date.now()}`;
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => testHome };
});

// Mock exec functions — we never want to run real git/supabase in tests
vi.mock("../../src/lib/exec.js", () => ({
  getGitBranch: vi.fn(async () => "test-branch"),
  getGitRepoName: vi.fn(async () => "test-repo"),
  isGitWorktree: vi.fn(async () => ({ linked: false, name: null })),
  supabaseStart: vi.fn(async () => "Started supabase"),
  supabaseStop: vi.fn(async () => "Stopped supabase"),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────
import { startCommand } from "../../src/commands/start.js";
import { getAllEntries, clearRegistry } from "../../src/lib/registry.js";
import { isGitWorktree } from "../../src/lib/exec.js";
import {
  createTestProject,
  cleanupDir,
  buildTestContext,
  captureConsole,
} from "../helpers.js";

const REGISTRY_FILE = join(testHome, ".sb-worktrees.json");

describe("startCommand", () => {
  let projectDir: string;
  let consoleCap: ReturnType<typeof captureConsole>;

  beforeAll(() => {
    mkdirSync(testHome, { recursive: true });
  });

  beforeEach(() => {
    consoleCap = captureConsole();
    // Clear registry between tests
    if (existsSync(REGISTRY_FILE)) unlinkSync(REGISTRY_FILE);
  });

  afterEach(() => {
    consoleCap.restore();
    if (projectDir) cleanupDir(projectDir);
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("generates config.toml from the template with new ports", async () => {
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
    const ctx = buildTestContext(projectDir);

    await startCommand(ctx);

    // config.toml should be generated
    const configPath = join(projectDir, "supabase", "config.toml");
    expect(existsSync(configPath)).toBe(true);

    const config = readFileSync(configPath, "utf-8");
    // Should have a derived project_id
    expect(config).toContain("sbwt-test-branch");
  });

  it("registers the worktree in the global registry", async () => {
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
    const ctx = buildTestContext(projectDir);

    await startCommand(ctx);

    const entries = await getAllEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].worktreePath).toBe(projectDir);
    expect(entries[0].branch).toBe("test-branch");
    expect(entries[0].projectId).toBe("sbwt-test-branch");
    expect(entries[0].portBase).toBe(54321);
  });

  it("updates .env files with new ports", async () => {
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
    const ctx = buildTestContext(projectDir);

    await startCommand(ctx);

    // .env files should have backups (ports changed from 54321→54421 etc.)
    expect(existsSync(join(projectDir, ".env.sb-backup"))).toBe(true);

    // Verify ports were actually replaced
    const envContent = readFileSync(join(projectDir, ".env"), "utf-8");
    expect(envContent).toContain("localhost:54421");

    // Output should mention updated files
    expect(consoleCap.output).toContain(".env");
  });

  it("allocates non-conflicting port ranges for second start", async () => {
    // Register a first project to take the default range
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
    const ctx1 = buildTestContext(projectDir);
    await startCommand(ctx1);

    // Create a second project
    const projectDir2 = createTestProject({
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
    const ctx2 = buildTestContext(projectDir2);
    await startCommand(ctx2);

    const entries = await getAllEntries();
    expect(entries.length).toBe(2);

    const bases = entries.map((e) => e.portBase).sort();
    expect(bases[0]).toBe(54321);
    expect(bases[1]).toBe(54421); // next block

    cleanupDir(projectDir2);
  });

  it("throws when no supabase-worktree config in package.json", async () => {
    projectDir = createTestProject({ withConfig: true, withTemplate: true });
    const ctx = buildTestContext(projectDir);

    await expect(startCommand(ctx)).rejects.toThrow(/config.*found/i);
  });

  it("throws when template file is missing", async () => {
    projectDir = createTestProject({
      withConfig: true,
      // withTemplate: false — no template
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });
    const ctx = buildTestContext(projectDir);

    await expect(startCommand(ctx)).rejects.toThrow(/Template not found/);
  });

  it("shows success message with URLs", async () => {
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
    const ctx = buildTestContext(projectDir);

    await startCommand(ctx);

    expect(consoleCap.output).toContain("Supabase is running");
  });

  it("uses worktree name in project ID when inside a linked worktree", async () => {
    // Mock isGitWorktree to simulate being inside a linked worktree
    vi.mocked(isGitWorktree).mockResolvedValueOnce({
      linked: true,
      name: "my-feature",
    });

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
    const ctx = buildTestContext(projectDir);

    await startCommand(ctx);

    const entries = await getAllEntries();
    expect(entries.length).toBe(1);
    // Should use worktree name, not branch
    expect(entries[0].projectId).toBe("sbwt-my-feature");
    expect(entries[0].projectId).not.toContain("test-branch");

    // Config.toml should also reflect this
    const config = readFileSync(
      join(projectDir, "supabase", "config.toml"),
      "utf-8"
    );
    expect(config).toContain('project_id = "sbwt-my-feature"');
  });

  it("uses branch name in project ID when not in a worktree", async () => {
    // Ensure mock returns non-worktree (default, but be explicit)
    vi.mocked(isGitWorktree).mockResolvedValueOnce({
      linked: false,
      name: null,
    });

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
    const ctx = buildTestContext(projectDir);

    await startCommand(ctx);

    const entries = await getAllEntries();
    expect(entries[0].projectId).toBe("sbwt-test-branch");
  });

  it("generates unique project IDs when collisions exist in registry", async () => {
    // Start a first project — takes sbwt-test-branch
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

    // Start a second project with same branch name — should get sbwt-test-branch-2
    const projectDir2 = createTestProject({
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
    await startCommand(buildTestContext(projectDir2));

    const entries = await getAllEntries();
    const ids = entries.map((e) => e.projectId).sort();
    expect(ids).toContain("sbwt-test-branch");
    expect(ids).toContain("sbwt-test-branch-2");

    cleanupDir(projectDir2);
  });

  it("derives port base from template ports, not from config", async () => {
    // Use a custom template with non-default ports (base = 30000)
    const customToml = `[api]
port = 30000

[db]
port = 30001

[studio]
port = 30002

project_id = "my-project"
`;

    projectDir = createTestProject({
      withConfig: true,
      withTemplate: true,
      configToml: customToml,
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });
    const ctx = buildTestContext(projectDir);

    await startCommand(ctx);

    const entries = await getAllEntries();
    expect(entries.length).toBe(1);
    // Port base should be 30000 (from the template), not 54321
    expect(entries[0].portBase).toBe(30000);
  });
});
