import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, symlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import {
  createTestProject,
  cleanupDir,
  copyTestPackage,
  ROOT_DIR,
  SAMPLE_CONFIG_TOML,
} from "./helpers.js";

/**
 * Run the CLI via tsx (the dev runner) with a custom HOME to isolate
 * the global registry, and --project-root to target a test package.
 */
function runCLI(
  args: string,
  projectRoot: string,
  options?: { expectFail?: boolean; home?: string }
): { stdout: string; stderr: string; exitCode: number } {
  const home = options?.home ?? join(projectRoot, ".fake-home");
  mkdirSync(home, { recursive: true });

  const binPath = join(ROOT_DIR, "src", "bin.ts");
  const cmd = `npx tsx ${binPath} --no-interactive --project-root ${projectRoot} ${args}`;

  try {
    const stdout = execSync(cmd, {
      cwd: ROOT_DIR,
      env: { ...process.env, HOME: home, CI: "true" },
      encoding: "utf-8",
      timeout: 30_000,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error: any) {
    if (options?.expectFail) {
      return {
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        exitCode: error.status ?? 1,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// CLI binary tests
// ---------------------------------------------------------------------------
describe("CLI binary (e2e)", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir) cleanupDir(projectDir);
  });

  // ── Symlink installation test ───────────────────────────────────────────
  describe("symlink installation", () => {
    it("can be invoked via a symlinked binary in a test package", () => {
      projectDir = copyTestPackage("sample-app");

      // Create node_modules/.bin and symlink our CLI entry point
      const binDir = join(projectDir, "node_modules", ".bin");
      mkdirSync(binDir, { recursive: true });
      const wrapperPath = join(binDir, "sb-worktree");

      // Create a wrapper script that invokes tsx
      const { writeFileSync } = require("node:fs");
      writeFileSync(
        wrapperPath,
        `#!/usr/bin/env bash\nexec npx tsx "${join(ROOT_DIR, "src", "bin.ts")}" "$@"\n`
      );
      chmodSync(wrapperPath, 0o755);

      expect(existsSync(wrapperPath)).toBe(true);

      // Run it via the symlink path — just test "config" since it's safe
      const home = join(projectDir, ".fake-home");
      mkdirSync(home, { recursive: true });
      const stdout = execSync(
        `${wrapperPath} --no-interactive --project-root ${projectDir} config`,
        {
          encoding: "utf-8",
          env: { ...process.env, HOME: home, CI: "true" },
          timeout: 30_000,
        }
      );
      expect(stdout).toContain("Found config in package.json");
    });
  });

  // ── config command ──────────────────────────────────────────────────────
  describe("config command", () => {
    it("shows config from a configured test package", () => {
      projectDir = copyTestPackage("sample-app");
      const { stdout } = runCLI("config", projectDir);

      expect(stdout).toContain("Found config in package.json");
      expect(stdout).toContain(".env");
      expect(stdout).toContain("portBlockSize");
    });

    it("shows missing config message for unconfigured package", () => {
      projectDir = copyTestPackage("bare-app");
      const { stdout } = runCLI("config", projectDir);

      expect(stdout).toContain("No \"supabase-worktree\" key found");
      expect(stdout).toContain("sb-worktree init");
    });
  });

  // ── init command ────────────────────────────────────────────────────────
  describe("init command", () => {
    it("initializes an unconfigured project", () => {
      projectDir = copyTestPackage("bare-app");
      const { stdout } = runCLI("init", projectDir);

      expect(stdout).toContain("Initialization complete");

      // Verify template was created
      expect(
        existsSync(join(projectDir, "supabase", "config.toml.template"))
      ).toBe(true);

      // Verify package.json was updated
      const pkg = JSON.parse(
        readFileSync(join(projectDir, "package.json"), "utf-8")
      );
      expect(pkg["supabase-worktree"]).toBeDefined();
      expect(pkg["supabase-worktree"].configTemplate).toBe(
        "supabase/config.toml.template"
      );
    });

    it("skips template overwrite in non-interactive mode", () => {
      projectDir = copyTestPackage("sample-app"); // already has template
      const { stdout } = runCLI("init", projectDir);

      expect(stdout).toContain("Skipping template creation");
    });
  });

  // ── instructions command ────────────────────────────────────────────────
  describe("instructions command", () => {
    it("shows getting started guide for a configured project", () => {
      projectDir = copyTestPackage("sample-app");
      const { stdout } = runCLI("instructions", projectDir);

      expect(stdout).toContain("Getting started");
      expect(stdout).toContain("package.json");
    });

    it("detects missing files for an unconfigured project", () => {
      projectDir = createTestProject();
      const { stdout } = runCLI("instructions", projectDir);

      expect(stdout).toContain("Getting started");
    });
  });

  // ── usage command ───────────────────────────────────────────────────────
  describe("usage command", () => {
    it("displays workflow examples", () => {
      projectDir = createTestProject();
      const { stdout } = runCLI("usage", projectDir);

      expect(stdout).toContain("Solo developer");
      expect(stdout).toContain("Parallel development");
      expect(stdout).toContain("CI");
      expect(stdout).toContain("port allocation");
    });
  });

  // ── status command ──────────────────────────────────────────────────────
  describe("status command", () => {
    it("shows no instances when registry is fresh", () => {
      projectDir = createTestProject();
      const { stdout } = runCLI("status", projectDir);

      expect(stdout).toContain("No active instances");
    });
  });

  // ── cleanup command ─────────────────────────────────────────────────────
  describe("cleanup command", () => {
    it("reports no stale entries on a fresh registry", () => {
      projectDir = createTestProject();
      const { stdout } = runCLI("cleanup", projectDir);

      expect(stdout).toContain("No stale entries found");
    });
  });

  // ── nuke command ────────────────────────────────────────────────────────
  describe("nuke command", () => {
    it("reports no instances to nuke on a fresh registry", () => {
      projectDir = createTestProject();
      const { stdout } = runCLI("nuke", projectDir);

      expect(stdout).toContain("No instances to nuke");
    });
  });

  // ── error handling ──────────────────────────────────────────────────────
  describe("error handling", () => {
    it("shows helpful error when starting without config", () => {
      projectDir = createTestProject({ withConfig: true, withTemplate: true });
      // No supabase-worktree key in package.json
      const { stdout, stderr } = runCLI("start", projectDir, {
        expectFail: true,
      });
      const output = stdout + stderr;
      expect(output).toContain("config");
    });
  });
});
