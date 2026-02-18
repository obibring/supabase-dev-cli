# supabase-worktree

Manage multiple parallel Supabase instances across git worktrees without port conflicts or accidental config commits.

## The Problem

When using `git worktree` for parallel development, each worktree shares the same `supabase/config.toml`. Running `supabase start` in multiple worktrees causes port collisions, and modifying the config risks committing wrong ports to the wrong branch.

## How It Works

1. **Template-based config** — Your `config.toml` is converted to a `.template` file (committed). The actual `config.toml` is gitignored and generated per-worktree with unique ports.
2. **Automatic port allocation** — Each worktree gets a non-overlapping block of 100 ports, tracked in a global registry at `~/.sb-worktrees.json`.
3. **Env file sync** — All `.env` files in your repo are updated to use the new ports (with backups for clean restoration).
4. **Unique Docker namespacing** — Each instance gets a unique `project_id` derived from your branch name, so Docker containers never collide.

## Installation

```bash
npm install -D supabase-worktree
```

## Quick Start

```bash
# 1. Initialize (one-time setup in your repo)
npx sb-worktree init

# 2. Commit the template and .gitignore changes
git add supabase/config.toml.template .gitignore package.json
git commit -m "chore: set up supabase-worktree"

# 3. Start an isolated instance in any worktree
npx sb-worktree start

# 4. Stop and restore when done
npx sb-worktree stop
```

## Commands

| Command | Description |
|---------|-------------|
| `sb-worktree` | Interactive menu (in TTY) or help (in CI) |
| `sb-worktree init` | Set up the project: detect files, create template, update .gitignore |
| `sb-worktree start` | Allocate ports, generate config, update .env files, run `supabase start` |
| `sb-worktree stop` | Stop Supabase, restore .env files, clean up generated config |
| `sb-worktree status` | Show all active instances across worktrees |
| `sb-worktree cleanup` | Remove stale instances (deleted worktrees) |
| `sb-worktree nuke` | Stop ALL tracked instances everywhere |

### Global Options

```
--no-interactive    Disable interactive prompts (for CI/agents)
--ci                Alias for --no-interactive
-v, --verbose       Show detailed output
--project-root      Override project root detection
-h, --help          Show help
-V, --version       Show version
```

## Configuration

Configuration lives in your `package.json` under the `"supabase-worktree"` key. The `init` command writes this automatically based on your project structure.

```jsonc
{
  "supabase-worktree": {
    // Glob patterns for .env files to update (relative to project root)
    "envFiles": [".env", ".env.local", "apps/web/.env.local"],

    // Path to the config.toml template
    "configTemplate": "supabase/config.toml.template",

    // Base port for the default instance (default: 54321)
    "defaultPortBase": 54321,

    // Ports allocated per worktree (default: 100)
    "portBlockSize": 100
  }
}
```

### Default .env File Discovery

If `envFiles` is not set, these patterns are used:

- `.env*` (project root)
- `apps/*/.env*` (monorepo app dirs)
- `packages/*/.env*` (monorepo package dirs)

### Port Replacement Rules

Only port numbers appearing after a known local host are replaced. This prevents false positives:

```
✓ SUPABASE_URL=http://localhost:54321     →  http://localhost:60000
✓ DB_URL=postgresql://127.0.0.1:54322/db  →  postgresql://127.0.0.1:60001/db
✗ RANDOM_NUMBER=54321                      →  (unchanged — no host prefix)
```

Supported host patterns: `localhost`, `127.0.0.1`, `0.0.0.0`, `host.docker.internal`.

## CI / AI Agent Usage

Use `--no-interactive` (or `--ci`) to disable all prompts:

```bash
# Start without prompts
npx sb-worktree start --no-interactive

# Stop without confirmation
npx sb-worktree stop --no-interactive

# Clean up stale instances in CI
npx sb-worktree cleanup --ci
```

## How Port Allocation Works

Each worktree gets a contiguous block of ports (default: 100). Ports are offset from a base:

| Service | Offset | Default Base (54321) | Second Worktree (54421) |
|---------|--------|---------------------|------------------------|
| API | +0 | 54321 | 54421 |
| DB | +1 | 54322 | 54422 |
| Studio | +2 | 54323 | 54423 |
| ... | ... | ... | ... |

The global registry (`~/.sb-worktrees.json`) tracks all allocations to prevent collisions.

## Cleanup

### Automatic

Every `sb-worktree start` checks for stale registry entries (worktree paths that no longer exist on disk) and cleans them up.

### Manual

```bash
# Remove stale entries
sb-worktree cleanup

# Nuclear option: stop everything
sb-worktree nuke
```

### Git Alias (Recommended)

Add this to your `.gitconfig` so worktree removal triggers cleanup:

```gitconfig
[alias]
  wt-remove = "!f() { sb-worktree stop --no-interactive --project-root \"$1\" 2>/dev/null; git worktree remove \"$@\"; }; f"
```

## License

MIT
