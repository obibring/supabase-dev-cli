import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

/**
 * Generate a config.toml from the template, replacing port values
 * and setting the project_id.
 */
export async function generateConfig(options: {
  templatePath: string;
  outputPath: string;
  portMap: Record<string, string>;
  projectId: string;
}): Promise<void> {
  const { templatePath, outputPath, portMap, projectId } = options;

  let content = await readFile(templatePath, "utf-8");

  // Replace port values in the template
  for (const [oldPort, newPort] of Object.entries(portMap)) {
    if (oldPort === newPort) continue;
    // Replace port values in TOML assignments: `port = 54321` → `port = 60000`
    content = content.replaceAll(
      new RegExp(`(=\\s*)${oldPort}(\\s*(?:#|$|\\n))`, "g"),
      `$1${newPort}$2`
    );
  }

  // Replace or insert project_id
  if (content.match(/^project_id\s*=/m)) {
    content = content.replace(
      /^(project_id\s*=\s*).*$/m,
      `$1"${projectId}"`
    );
  }

  await writeFile(outputPath, content, "utf-8");
}

/**
 * Derive a unique project_id from the repo name and branch.
 * Must be a valid Supabase project ID (lowercase alphanumeric + hyphens, max 40 chars).
 */
export function deriveProjectId(repoName: string, branch: string): string {
  const slug = `${repoName}-${branch}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length <= 40) {
    return slug;
  }

  // If too long, use a hash suffix for uniqueness
  const hash = createHash("sha256")
    .update(`${repoName}/${branch}`)
    .digest("hex")
    .slice(0, 8);
  return `${slug.slice(0, 31)}-${hash}`;
}
