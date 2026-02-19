import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import {
  DEFAULT_ENV_PATTERNS,
  DEFAULT_CONFIG_TEMPLATE,
  DEFAULT_PORT_BASE,
  DEFAULT_PORT_BLOCK_SIZE,
} from "../lib/constants.js";
import { CommandError } from "../lib/errors.js";
import type { CommandContext } from "../lib/types.js";

export async function configCommand(ctx: CommandContext): Promise<void> {
  const { projectRoot } = ctx;

  console.log(chalk.bold("\n⚙️  supabase-worktree config\n"));

  // 1. Check for package.json
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) {
    throw new CommandError(
      "No package.json found in " + projectRoot,
      `Run ${chalk.cyan("npm init")} or ${chalk.cyan("pnpm init")} first.`
    );
  }

  // 2. Parse package.json
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  } catch {
    throw new CommandError(
      "Could not parse package.json",
      "Ensure package.json contains valid JSON."
    );
  }

  // 3. Look for the config key
  const config = pkg["supabase-worktree"] as Record<string, unknown> | undefined;

  if (!config) {
    console.log(chalk.yellow("  No \"supabase-worktree\" key found in package.json.\n"));

    console.log(chalk.dim("  The easiest way to add it is to run:\n"));
    console.log(chalk.cyan("    sb-worktree init\n"));
    console.log(chalk.dim("  This will detect your project structure and write the"));
    console.log(chalk.dim("  config automatically.\n"));

    console.log(chalk.dim("  Alternatively, add it manually to your package.json:\n"));
    console.log(chalk.white(formatExampleConfig()));
    console.log();
    printFieldReference();
    return;
  }

  // 4. Print the current config
  console.log(chalk.green("  Found config in package.json:\n"));
  console.log(chalk.white(formatJsonBlock(config)));
  console.log();

  printFieldReference();
}

function formatExampleConfig(): string {
  const example = {
    "supabase-worktree": {
      envFiles: [".env", ".env.local", "apps/web/.env.local"],
      configTemplate: DEFAULT_CONFIG_TEMPLATE,
      defaultPortBase: DEFAULT_PORT_BASE,
      portBlockSize: DEFAULT_PORT_BLOCK_SIZE,
    },
  };
  return indent(JSON.stringify(example, null, 2), 4);
}

function formatJsonBlock(obj: Record<string, unknown>): string {
  return indent(JSON.stringify(obj, null, 2), 4);
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function printFieldReference(): void {
  console.log(chalk.bold("  Fields:\n"));
  console.log(
    chalk.cyan("    envFiles") +
      chalk.dim("          Glob patterns for .env files to update with new ports.")
  );
  console.log(
    chalk.dim("                      Default: ") +
      chalk.white(JSON.stringify(DEFAULT_ENV_PATTERNS))
  );
  console.log();
  console.log(
    chalk.cyan("    configTemplate") +
      chalk.dim("    Path to the config.toml template (committed to git).")
  );
  console.log(
    chalk.dim("                      Default: ") +
      chalk.white(`"${DEFAULT_CONFIG_TEMPLATE}"`)
  );
  console.log();
  console.log(
    chalk.cyan("    defaultPortBase") +
      chalk.dim("   Base port for the first instance.")
  );
  console.log(
    chalk.dim("                      Default: ") +
      chalk.white(String(DEFAULT_PORT_BASE))
  );
  console.log();
  console.log(
    chalk.cyan("    portBlockSize") +
      chalk.dim("     Number of ports allocated per worktree.")
  );
  console.log(
    chalk.dim("                      Default: ") +
      chalk.white(String(DEFAULT_PORT_BLOCK_SIZE))
  );
  console.log();
}
