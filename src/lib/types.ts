export interface CommandContext {
  interactive: boolean;
  verbose: boolean;
  projectRoot: string;
}

export interface ExtractedPort {
  key: string;
  section: string;
  value: number;
  offset: number;
}

export interface WorktreeEntry {
  worktreePath: string;
  branch: string;
  portBase: number;
  projectId: string;
  allocatedAt: string;
  portMap: Record<string, string>;
}

export interface ProjectConfig {
  envFiles: string[];
  configTemplate: string;
  portBlockSize: number;
}
