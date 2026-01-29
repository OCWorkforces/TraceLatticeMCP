# CONFIG MODULE

**Generated:** 2026-01-29
**Parent:** ../AGENTS.md

## OVERVIEW

ConfigLoader loads YAML config, merges defaults with file/env overrides.

## WHERE TO LOOK

- `src/config/ConfigLoader.ts` for file discovery, YAML parse, merge order
- `src/config/index.ts` for public exports and factory access
- `.claude/config.yml` and `.claude/config.yaml` for project-local config
- `~/.claude/config.yml` and `~/.claude/config.yaml` for user-global config
- `.mcp-seq-thinking.yml` and `.mcp-seq-thinking.yaml` for legacy project-local config
- `~/.config/mcp-seq-thinking/config.yml` for legacy user-global config

## CONVENTIONS

- Merge priority: env vars > project-local > user-global > defaults
- Env vars override any YAML value (see ConfigLoader mapping)
- Missing/invalid YAML logs and falls back to defaults
