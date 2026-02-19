import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../lib/config.js";
import {
  getWorktreeEntry,
  getAllocatedPortBases,
  getAllocatedProjectIds,
  registerWorktree,
} from "../lib/registry.js";
import { extractPorts, getPortBase, allocatePortBase, buildPortMap } from "../lib/ports.js";
import {
  generateConfig,
  deriveProjectId,
} from "../lib/template.js";
import { updateEnvFiles } from "../lib/env.js";
import { getGitBranch, getGitRepoName, isGitWorktree, supabaseStart } from "../lib/exec.js";
import { formatPortTable } from "../lib/utils.js";
import { CommandError } from "../lib/errors.js";
import type { CommandContext } from "../lib/types.js";

export async function startCommand(ctx: CommandContext): Promise<void> {
  const { interactive, projectRoot, verbose } = ctx;

  console.log(chalk.bold("\n🚀 Starting Supabase worktree instance\n"));

  // 1. Load config
  const config = await loadConfig(projectRoot);
  if (!config) {
    throw new CommandError(
      "No \"supabase-worktree\" config found in package.json",
      `Run ${chalk.cyan("sb-worktree init")} to set up your project first.`
    );
  }

  // 2. Verify the template file exists
  const templatePath = join(projectRoot, config.configTemplate);
  if (!existsSync(templatePath)) {
    const configToml = join(projectRoot, config.configTemplate.replace(".template", ""));
    const hasConfigToml = existsSync(configToml);

    if (hasConfigToml) {
      throw new CommandError(
        `Template not found: ${config.configTemplate}`,
        `A config.toml exists but hasn't been templated yet.\n  Run ${chalk.cyan("sb-worktree init")} to create the template.`
      );
    } else {
      throw new CommandError(
        `Template not found: ${config.configTemplate}`,
        `No Supabase config found in this project.\n  Run ${chalk.cyan("supabase init")} first, then ${chalk.cyan("sb-worktree init")}.`
      );
    }
  }

  // 3. Check if already running
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

  // 4. Read the template and extract ports
  const templateContent = await readFile(templatePath, "utf-8");
  const extractedPorts = extractPorts(templateContent);

  if (extractedPorts.length === 0) {
    throw new CommandError(
      `No port definitions found in ${config.configTemplate}`,
      "The template file exists but contains no port = <number> lines.\n  Check that the template is a valid Supabase config.toml."
    );
  }

  if (verbose) {
    console.log(
      chalk.dim(
        `  Found ${extractedPorts.length} port(s) in template: ` +
          extractedPorts.map((p) => `${p.section}.${p.key}=${p.value}`).join(", ")
      )
    );
  }

  // 5. Allocate a port range
  const templatePortBase = getPortBase(extractedPorts);
  const allocatedBases = await getAllocatedPortBases();
  const newBase = allocatePortBase(
    allocatedBases,
    templatePortBase,
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

  // 6. Derive project_id
  let branch: string;
  let repoName: string;
  try {
    branch = await getGitBranch(projectRoot);
    repoName = await getGitRepoName(projectRoot);
  } catch {
    throw new CommandError(
      "Could not determine git branch or repository name",
      `Make sure you're inside a git repository.\n  Run ${chalk.cyan("git init")} if this is a new project.`
    );
  }

  // Detect worktree and gather existing IDs for uniqueness
  const worktreeInfo = await isGitWorktree(projectRoot);
  const existingIds = await getAllocatedProjectIds();

  const projectId = deriveProjectId({
    branch,
    worktreeName: worktreeInfo.linked ? worktreeInfo.name : null,
    existingIds,
  });

  console.log(chalk.dim(`  Project ID: ${projectId}`));
  console.log(chalk.dim(`  Branch: ${branch}`));

  // 7. Generate config.toml
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

  // 8. Update .env files
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

  // 9. Register in the global registry
  const entry = {
    worktreePath: projectRoot,
    branch,
    portBase: newBase,
    projectId,
    allocatedAt: new Date().toISOString(),
    portMap,
  };
  await registerWorktree(entry);

  // 10. Run supabase start
  console.log(chalk.dim("\n  Starting Supabase (this may take a minute)...\n"));

  try {
    const output = await supabaseStart(projectRoot);
    if (verbose && output) {
      console.log(chalk.dim(output));
    }
    console.log(chalk.bold.green("\n✅ Supabase is running!\n"));
    console.log(`  API URL:    ${chalk.cyan(`http://localhost:${newBase}`)}`);
    console.log(`  Studio URL: ${chalk.cyan(`http://localhost:${newBase + 2}`)}`);
    console.log(`  DB port:    ${chalk.cyan(String(newBase + 1))}`);
    console.log();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new CommandError(
      `Supabase failed to start: ${msg}`,
      "The config and .env files have been updated.\n" +
        `  Fix the issue and run ${chalk.cyan("supabase start")} manually,\n` +
        `  or run ${chalk.cyan("sb-worktree stop")} to revert.`
    );
  }
}
