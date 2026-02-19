export const DEFAULT_PORT_BLOCK_SIZE = 100;

export const REPLACEABLE_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "host.docker.internal",
];

export const ENV_BACKUP_SUFFIX = ".sb-backup";

export const REGISTRY_PATH = "~/.sb-worktrees.json";

export const DEFAULT_ENV_PATTERNS = [
  ".env*",
  "apps/*/.env*",
  "packages/*/.env*",
];

export const DEFAULT_CONFIG_TEMPLATE = "supabase/config.toml.template";
