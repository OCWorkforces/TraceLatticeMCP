# REGISTRY MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e

## OVERVIEW

Manages discovery and lifecycle of MCP tools and Claude Code skills via `BaseRegistry<T>` generic base class.

## STRUCTURE

```
src/registry/
├── BaseRegistry.ts    # Generic CRUD + discovery + LRU cache + frontmatter parsing (396L)
├── ToolRegistry.ts    # MCP tool management (extends BaseRegistry) (165L)
└── SkillRegistry.ts   # Claude Skill management (extends BaseRegistry) (158L)
```

## BASE REGISTRY

Generic class handling: add/get/remove/update/clear (CRUD), `discoverAsync()` with file scanning, frontmatter parsing (`---yaml---` blocks), LRU cache via `IDiscoveryCache`, deduplication by name.

## DISCOVERY

- **Tools**: `.claude/tools/` (local) → `~/.claude/tools/` (global)
- **Skills**: `.claude/skills/` (local) → `~/.claude/skills/` (global)
- **Caching**: Uses `DiscoveryCache` (LRU+TTL) to prevent re-reading files.
- **Watchers**: Optional file watchers trigger re-discovery.
