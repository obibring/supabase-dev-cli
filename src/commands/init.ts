import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { glob } from "glob";
import {
  DEFAULT_ENV_PATTERNS,
  DEFAULT_CONFIG_TEMPLATE,
  DEFAULT_PORT_BASE,
  DEFAULT_PORT_BLOCK_SIZE,
} from "../lib/constants.js";
import { CommandError } from "../lib/errors.js";
import type { CommandContext } from "../lib/types.js";

export async function initCommand(ctx: CommandContext): Promise<void> {
  const { interactive, projectRoot, verbose } = ctx;

  console.log(chalk.bold("\n🔧 Initializing supabase-worktree\n"));

  // 1. Check for package.json
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) {
    throw new CommandError(
      "No package.json found in " + projectRoot,
      `Run ${chalk.cyan("npm init")} or ${chalk.cyan("pnpm init")} first.`
    );
  }

  // 2. Find config.toml
  const configPath = join(projectRoot, "supabase", "config.toml");
  if (!existsSync(configPath)) {
    throw new CommandError(
      "No supabase/config.toml found in " + projectRoot,
      `Run ${chalk.cyan("supabase init")} to create the Supabase project first.`
    );
  }

  // 3. Create the template
  const templatePath = join(projectRoot, DEFAULT_CONFIG_TEMPLATE);
  if (existsSync(templatePath)) {
    console.log(chalk.yellow("  ⚠ Template already exists: " + DEFAULT_CONFIG_TEMPLATE));
    if (interactive) {
      const overwrite = await confirm({
        message: "Overwrite the existing template?",
        default: false,
      });
      if (!overwrite) {
        console.log(chalk.dim("  Skipping template creation."));
      } else {
        await copyFile(configPath, templatePath);
        console.log(chalk.green("  ✓ Updated template: " + DEFAULT_CONFIG_TEMPLATE));
      }
    } else {
      console.log(chalk.dim("  Skipping template creation (already exists). Use interactive mode to overwrite."));
    }
  } else {
    await copyFile(configPath, templatePath);
    console.log(chalk.green("  ✓ Created template: " + DEFAULT_CONFIG_TEMPLATE));
  }

  // 4. Discover .env files
  const envFiles: string[] = [];
  for (const pattern of DEFAULT_ENV_PATTERNS) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      dot: true,
      nodir: true,
      ignore: ["**/node_modules/**"],
    });
    envFiles.push(...matches);
  }

  const uniqueEnvFiles = [...new Set(envFiles)].sort();

  if (verbose) {
    console.log(chalk.dim(`  Found ${uniqueEnvFiles.length} .env file(s)`));
    for (const f of uniqueEnvFiles) {
      console.log(chalk.dim(`    - ${f}`));
    }
  }

  // 5. Write config to package.json
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  } catch {
    throw new CommandError(
      "Could not parse package.json",
      "Ensure package.json contains valid JSON."
    );
  }

  pkg["supabase-worktree"] = {
    envFiles: uniqueEnvFiles.length > 0 ? uniqueEnvFiles : DEFAULT_ENV_PATTERNS,
    configTemplate: DEFAULT_CONFIG_TEMPLATE,
    defaultPortBase: DEFAULT_PORT_BASE,
    portBlockSize: DEFAULT_PORT_BLOCK_SIZE,
  };

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(chalk.green('  ✓ Wrote config to package.json["supabase-worktree"]'));

  // 6. Update .gitignore
  const gitignorePath = join(projectRoot, ".gitignore");
  const gitignoreEntries = ["supabase/config.toml"];

  if (existsSync(gitignorePath)) {
    const content = await readFile(gitignorePath, "utf-8");
    const missing = gitignoreEntries.filter((e) => !content.includes(e));

    if (missing.length > 0) {
      const updated = content.trimEnd() + "\n\n# supabase-worktree (generated config)\n" +
        missing.join("\n") + "\n";
      await writeFile(gitignorePath, updated, "utf-8");
      console.log(chalk.green("  ✓ Updated .gitignore"));
    } else {
      console.log(chalk.dim("  .gitignore already configured"));
    }
  } else {
    console.log(chalk.dim("  No .gitignore found — skipping"));
  }

  console.log(chalk.bold.green("\n✅ Initialization complete!\n"));
  console.log(chalk.dim("  Next steps:"));
  console.log(chalk.dim("  1. git add supabase/config.toml.template .gitignore package.json"));
  console.log(chalk.dim('  2. git commit -m "chore: set up supabase-worktree"'));
  console.log(chalk.dim("  3. npx sb-worktree start\n"));
}
