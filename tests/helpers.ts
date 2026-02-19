import { mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

export const ROOT_DIR = join(import.meta.dirname, "..");
export const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
export const TEST_PACKAGES_DIR = join(import.meta.dirname, "test-packages");

/** Create a unique temp directory. */
export function createTempDir(prefix = "sb-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Copy a test package to a temp directory and return its path. */
export function copyTestPackage(name: string): string {
  const src = join(TEST_PACKAGES_DIR, name);
  const dest = createTempDir(`sb-test-${name}-`);
  cpSync(src, dest, { recursive: true });
  return dest;
}

/** Remove a directory tree. */
export function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Create a minimal test project from scratch in a temp directory.
 * Returns the project root path.
 */
export function createTestProject(options: {
  withConfig?: boolean;
  withTemplate?: boolean;
  withEnvFiles?: boolean;
  withGitignore?: boolean;
  envContent?: string;
  configToml?: string;
  packageJsonExtra?: Record<string, unknown>;
} = {}): string {
  const dir = createTempDir("sb-test-project-");
  const {
    withConfig = false,
    withTemplate = false,
    withEnvFiles = false,
    withGitignore = false,
    envContent,
    configToml,
    packageJsonExtra = {},
  } = options;

  // package.json
  const pkg: Record<string, unknown> = {
    name: "test-project",
    version: "1.0.0",
    ...packageJsonExtra,
  };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));

  // supabase directory
  mkdirSync(join(dir, "supabase"), { recursive: true });

  // config.toml
  const tomlContent = configToml ?? SAMPLE_CONFIG_TOML;
  if (withConfig || withTemplate) {
    writeFileSync(join(dir, "supabase", "config.toml"), tomlContent);
  }

  // config.toml.template
  if (withTemplate) {
    writeFileSync(join(dir, "supabase", "config.toml.template"), tomlContent);
  }

  // .env files
  if (withEnvFiles) {
    const env = envContent ?? SAMPLE_ENV_CONTENT;
    writeFileSync(join(dir, ".env"), env);
    writeFileSync(join(dir, ".env.local"), env);
  }

  // .gitignore
  if (withGitignore) {
    writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  }

  return dir;
}

/** Spy on console.log and collect output. */
export function captureConsole() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  return {
    get output() {
      return lines.join("\n");
    },
    lines,
    restore: () => spy.mockRestore(),
  };
}

/** A realistic sample Supabase config.toml. */
export const SAMPLE_CONFIG_TOML = `[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
major_version = 15

[db.pooler]
enabled = false
port = 54329
default_pool_size = 20
max_client_conn = 100

[studio]
enabled = true
port = 54323
api_url = "http://localhost"

[inbucket]
enabled = true
port = 54324
smtp_port = 54325
pop3_port = 54326

[analytics]
enabled = true
port = 54327

[auth]
enabled = true
site_url = "http://localhost:3000"

project_id = "my-project"
`;

/** A sample .env file with Supabase URLs. */
export const SAMPLE_ENV_CONTENT = `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321/rest/v1
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres
SUPABASE_STUDIO_URL=http://localhost:54323
SUPABASE_INBUCKET_URL=http://127.0.0.1:54324
SOME_UNRELATED_VALUE=54321
APP_PORT=3000
`;

/** Build a non-interactive CommandContext for testing. */
export function buildTestContext(projectRoot: string, options?: { verbose?: boolean; interactive?: boolean }) {
  return {
    interactive: options?.interactive ?? false,
    verbose: options?.verbose ?? false,
    projectRoot,
  };
}
