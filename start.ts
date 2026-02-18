import { readFile } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../lib/config.js";
import {
  getWorktreeEntry,
  getAllocatedPortBases,
  registerWorktree,
} from "../lib/registry.js";
import { extractPorts, allocatePortBase, buildPortMap } from "../lib/ports.js";
import {
  generateConfig,
  deriveProjectId,
} from "../lib/template.js";
import { updateEnvFiles } from "../lib/env.js";
import { getGitBranch, getGitRepoName, supabaseStart } from "../lib/exec.js";
import { formatPortTable } from "../lib/utils.js";
import type { CommandContext } from "../lib/types.js";

export async function startCommand(ctx: CommandContext): Promise<void> {
  const { interactive, projectRoot, verbose } = ctx;

  console.log(chalk.bold("\n🚀 Starting Supabase worktree instance\n"));

  // 1. Load config
  const config = await loadConfig(projectRoot);

  // 2. Check if already running
  const existing = await getWorktreeEntry(projectRoot);
  if (existing) {
    console.log(
      chalk.yellow(
        `⚠ This worktree already has an active instance (port base: ${existing.portBase})`
      )
    );

    if (interactive) {
      const proceed = await confirm({
        message: "Stop the existing instance and start a new one?",
        default: false,
      });
      if (!proceed) {
        console.log(chalk.dim("  Aborted."));
        return;
      }
    } else {
      console.log(
        chalk.yellow("  Use --force to replace, or run 'sb-worktree stop' first.")
      );
      process.exitCode = 1;
      return;
    }
  }

  // 3. Read the template and extract ports
  const templatePath = join(projectRoot, config.configTemplate);
  const templateContent = await readFile(templatePath, "utf-8");
  const extractedPorts = extractPorts(templateContent);

  if (extractedPorts.length === 0) {
    console.log(
      chalk.red("✗ No port definitions found in " + config.configTemplate)
    );
    process.exitCode = 1;
    return;
  }

  if (verbose) {
    console.log(
      chalk.dim(
        `  Found ${extractedPorts.length} port(s) in template: ` +
          extractedPorts.map((p) => `${p.section}.${p.key}=${p.value}`).join(", ")
      )
    );
  }

  // 4. Allocate a port range
  const allocatedBases = await getAllocatedPortBases();
  const newBase = allocatePortBase(
    allocatedBases,
    config.defaultPortBase,
    config.portBlockSize
  );
  const portMap = buildPortMap(extractedPorts, newBase);

  console.log(chalk.dim("  Port allocation:"));
  console.log(
    chalk.dim(
      formatPortTable(portMap, extractedPorts)
        .split("\n")
        .map((l) => "    " + l)
        .join("\n")
    )
  );

  // 5. Derive project_id
  const branch = await getGitBranch(projectRoot);
  const repoName = await getGitRepoName(projectRoot);
  const projectId = deriveProjectId(repoName, branch);

  console.log(chalk.dim(`  Project ID: ${projectId}`));
  console.log(chalk.dim(`  Branch: ${branch}`));

  // 6. Generate config.toml
  const configOutputPath = join(
    projectRoot,
    config.configTemplate.replace(".template", "")
  );
  await generateConfig({
    templatePath: templatePath,
    outputPath: configOutputPath,
    portMap,
    projectId,
  });
  console.log(chalk.green("  ✓ Generated config.toml"));

  // 7. Update .env files
  const modifiedEnvs = await updateEnvFiles({
    patterns: config.envFiles,
    projectRoot,
    portMap,
  });

  if (modifiedEnvs.length > 0) {
    console.log(
      chalk.green(`  ✓ Updated ${modifiedEnvs.length} .env file(s):`)
    );
    for (const f of modifiedEnvs) {
      console.log(chalk.dim(`    - ${f}`));
    }
  } else {
    console.log(chalk.dim("  No .env files needed updating"));
  }

  // 8. Register in the global registry
  const entry = {
    worktreePath: projectRoot,
    branch,
    portBase: newBase,
    projectId,
    allocatedAt: new Date().toISOString(),
    portMap,
  };
  await registerWorktree(entry);

  // 9. Run supabase start
  console.log(chalk.dim("\n  Starting Supabase (this may take a minute)...\n"));

  try {
    const output = await supabaseStart(projectRoot);
    if (verbose && output) {
      console.log(chalk.dim(output));
    }
    console.log(chalk.bold.green("\n✅ Supabase is running!\n"));
    console.log(`  API URL:    ${chalk.cyan(`http://localhost:${portMap[String(config.defaultPortBase)] ?? newBase}`)}`);
    console.log(`  Studio URL: ${chalk.cyan(`http://localhost:${newBase + 2}`)}`);
    console.log(`  DB port:    ${chalk.cyan(String(newBase + 1))}`);
    console.log();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`\n✗ Supabase failed to start:\n  ${msg}\n`));
    console.log(
      chalk.dim(
        "  The config and .env files have been updated. " +
          "Fix the issue and run 'supabase start' manually, " +
          "or run 'sb-worktree stop' to revert."
      )
    );
    process.exitCode = 1;
  }
}
