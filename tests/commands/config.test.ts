import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { configCommand } from "../../src/commands/config.js";
import {
  createTestProject,
  cleanupDir,
  buildTestContext,
  captureConsole,
} from "../helpers.js";

describe("configCommand", () => {
  let projectDir: string;
  let consoleCap: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    consoleCap = captureConsole();
  });

  afterEach(() => {
    consoleCap.restore();
    if (projectDir) cleanupDir(projectDir);
  });

  it("prints 'no config found' when supabase-worktree key is missing", async () => {
    projectDir = createTestProject();
    const ctx = buildTestContext(projectDir);

    await configCommand(ctx);

    expect(consoleCap.output).toContain("No \"supabase-worktree\" key found");
    expect(consoleCap.output).toContain("sb-worktree init");
  });

  it("displays the config when present in package.json", async () => {
    projectDir = createTestProject({
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env"],
          configTemplate: "supabase/config.toml.template",
          portBlockSize: 100,
        },
      },
    });
    const ctx = buildTestContext(projectDir);

    await configCommand(ctx);

    expect(consoleCap.output).toContain("Found config in package.json");
    expect(consoleCap.output).toContain(".env");
  });

  it("shows field reference", async () => {
    projectDir = createTestProject({
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env"],
        },
      },
    });
    const ctx = buildTestContext(projectDir);

    await configCommand(ctx);

    expect(consoleCap.output).toContain("envFiles");
    expect(consoleCap.output).toContain("configTemplate");
    expect(consoleCap.output).toContain("portBlockSize");
    expect(consoleCap.output).not.toContain("defaultPortBase");
  });

  it("throws when no package.json exists", async () => {
    projectDir = createTestProject();
    const { unlinkSync } = await import("node:fs");
    unlinkSync(require("node:path").join(projectDir, "package.json"));

    const ctx = buildTestContext(projectDir);
    await expect(configCommand(ctx)).rejects.toThrow(/package\.json/);
  });

  it("does not show effective defaults section", async () => {
    projectDir = createTestProject({
      packageJsonExtra: {
        "supabase-worktree": {
          envFiles: [".env"],
          // Other fields missing — previously would show "effective config with defaults"
        },
      },
    });
    const ctx = buildTestContext(projectDir);

    await configCommand(ctx);

    expect(consoleCap.output).not.toContain("Effective config");
    expect(consoleCap.output).not.toContain("defaults for missing");
  });
});
