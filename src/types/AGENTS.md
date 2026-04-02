# TYPES MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e

## OVERVIEW

Shared type definitions for tools, skills, server config, and resource lifecycle. Pure type-only module — no runtime code.

## STRUCTURE

```
src/types/
├── tool.ts            # Tool & ToolRecommendation interfaces (76L)
├── skill.ts           # Skill & SkillRecommendation interfaces (79L)
├── server-config.ts   # ServerConfig interface — runtime tool/skill registry (34L)
└── disposable.ts      # IDisposable — async resource cleanup contract (21L)
```

## KEY SYMBOLS

| Symbol                | Type      | Location           | Role                                                                    |
| --------------------- | --------- | ------------------ | ----------------------------------------------------------------------- |
| `ToolRecommendation`  | interface | `tool.ts`          | Recommended MCP tool with confidence, rationale, priority, alternatives |
| `Tool`                | interface | `tool.ts`          | MCP tool definition with name, description, inputSchema                 |
| `SkillRecommendation` | interface | `skill.ts`         | Recommended skill with confidence, allowed_tools, user_invocable        |
| `Skill`               | interface | `skill.ts`         | Skill definition with name, description, user_invocable flag            |
| `ServerConfig`        | interface | `server-config.ts` | Runtime config: available_tools Map + available_skills Map              |
| `IDisposable`         | interface | `disposable.ts`    | Single `dispose(): Promise<void>` for service cleanup                   |

## WHERE TO LOOK

| Task                      | Location           | Notes                                  |
| ------------------------- | ------------------ | -------------------------------------- |
| **Tool types**            | `tool.ts`          | ToolRecommendation + Tool interfaces   |
| **Skill types**           | `skill.ts`         | SkillRecommendation + Skill interfaces |
| **Server runtime config** | `server-config.ts` | Available tools/skills maps            |
| **Resource cleanup**      | `disposable.ts`    | IDisposable contract                   |

## CONVENTIONS

- Pure type-only module — no runtime exports.
- All interfaces have full JSDoc with `@example`.
- Imports use `.js` extensions (ESM).
