// Public API
export { createProgram } from "./cli.js";
export { extractPorts, allocatePortBase, buildPortMap, validatePortRange } from "./lib/ports.js";
export { replacePortsInEnvContent, discoverEnvFiles } from "./lib/env.js";
export { deriveProjectId } from "./lib/template.js";
export { findProjectRoot, loadConfig } from "./lib/config.js";
export { CommandError } from "./lib/errors.js";
export type { CommandContext, ExtractedPort, WorktreeEntry, ProjectConfig } from "./lib/types.js";
