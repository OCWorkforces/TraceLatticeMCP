# CONFIG MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e
**Parent:** ../AGENTS.md

## OVERVIEW

ConfigLoader loads YAML config, merges defaults with file/env overrides.

## WHERE TO LOOK

- `src/config/ConfigLoader.ts` for file discovery, YAML parse, merge order
- `.claude/config.yml` and `.claude/config.yaml` for project-local config
- `~/.claude/config.yml` and `~/.claude/config.yaml` for user-global config
- `.mcp-seq-thinking.yml` and `.mcp-seq-thinking.yaml` for legacy project-local config

## CONVENTIONS

- Merge priority: env vars > project-local > user-global > defaults
- Env vars override any YAML value (see ConfigLoader mapping)
- Missing/invalid YAML logs and falls back to defaults
