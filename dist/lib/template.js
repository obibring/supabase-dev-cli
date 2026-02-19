import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
/**
 * Generate a config.toml from the template, replacing port values
 * and setting the project_id.
 */
export async function generateConfig(options) {
    const { templatePath, outputPath, portMap, projectId } = options;
    let content = await readFile(templatePath, "utf-8");
    // Replace port values in the template
    for (const [oldPort, newPort] of Object.entries(portMap)) {
        if (oldPort === newPort)
            continue;
        // Replace port values in TOML assignments: `port = 54321` → `port = 60000`
        content = content.replaceAll(new RegExp(`(=\\s*)${oldPort}(\\s*(?:#|$|\\n))`, "g"), `$1${newPort}$2`);
    }
    // Replace or insert project_id
    if (content.match(/^project_id\s*=/m)) {
        content = content.replace(/^(project_id\s*=\s*).*$/m, `$1"${projectId}"`);
    }
    await writeFile(outputPath, content, "utf-8");
}
const PROJECT_ID_PREFIX = "sbwt-";
const MAX_PROJECT_ID_LENGTH = 40;
/**
 * Derive a unique, grepable project_id prefixed with `sbwt-`.
 *
 * Uses the worktree directory name when inside a linked worktree,
 * otherwise falls back to the branch name. Appends `-2`, `-3`, etc.
 * if the derived name collides with an existing ID.
 */
export function deriveProjectId(options) {
    const { branch, worktreeName, existingIds = [] } = options;
    // 1. Choose body: worktree name takes priority
    const body = worktreeName ?? branch;
    // 2. Sanitize
    const sanitized = body
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    // 3. Build candidate with prefix, respecting max length
    const candidate = enforceMaxLength(`${PROJECT_ID_PREFIX}${sanitized}`, sanitized);
    // 4. Uniqueness: try candidate, then candidate-2, -3, ...
    if (!existingIds.includes(candidate)) {
        return candidate;
    }
    let n = 2;
    while (true) {
        const suffix = `-${n}`;
        const numbered = enforceMaxLength(`${candidate}${suffix}`, sanitized, suffix);
        if (!existingIds.includes(numbered)) {
            return numbered;
        }
        n++;
    }
}
/**
 * Ensure the ID fits within MAX_PROJECT_ID_LENGTH.
 * If it's too long, truncate the body and append an 8-char hash for uniqueness.
 */
function enforceMaxLength(fullId, rawBody, extraSuffix = "") {
    if (fullId.length <= MAX_PROJECT_ID_LENGTH) {
        return fullId;
    }
    // Hash the raw body for deterministic truncation
    const hash = createHash("sha256").update(rawBody).digest("hex").slice(0, 8);
    // prefix + truncated-body + - + hash + extraSuffix must fit in 40
    const availableForBody = MAX_PROJECT_ID_LENGTH -
        PROJECT_ID_PREFIX.length -
        1 - // hyphen before hash
        hash.length -
        extraSuffix.length;
    const truncatedBody = rawBody
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, availableForBody)
        .replace(/-$/g, ""); // no trailing hyphen after truncation
    return `${PROJECT_ID_PREFIX}${truncatedBody}-${hash}${extraSuffix}`;
}
//# sourceMappingURL=template.js.map