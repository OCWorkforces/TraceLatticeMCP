# REGISTRY MODULE

**Generated:** 2026-01-26
**Parent:** ../AGENTS.md

## OVERVIEW

Manages discovery and lifecycle of MCP tools and Claude Code skills.

## STRUCTURE

```
src/registry/
├── ToolRegistry.ts   # MCP tool management
├── SkillRegistry.ts  # Claude Skill management
└── index.ts          # Exports
```

## DISCOVERY LOGIC

- **Tools**: `.claude/tools/` (local) -> `~/.claude/tools/` (global)
- **Skills**: `.claude/skills/` (local) -> `~/.claude/skills/` (global)
- **Caching**: Uses `DiscoveryCache` (LRU) to prevent re-reading files.
- **Watchers**: Optional file watchers trigger re-discovery.

## USAGE

```typescript
const registry = new ToolRegistry(logger, cache);
await registry.discoverAsync();
const tool = registry.getTool('my-tool');
```
