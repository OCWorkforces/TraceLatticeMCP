# CONTRACTS MODULE

**Updated:** 2026-03-29
**Parent:** ../AGENTS.md

## OVERVIEW

Shared interface contracts centralizing cross-module type dependencies. Modules depend on these interfaces (not concrete implementations) to reduce lateral coupling.

## STRUCTURE

```
src/contracts/
├── interfaces.ts  # Interface definitions (IMetrics, IDiscoveryCache, etc.)
└── index.ts       # Module barrel (intentional — single coupling point)
```

## INTERFACES

| Interface               | Purpose                                         | Key Methods                                                         |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `IMetrics`              | Metrics abstraction (counter, gauge, histogram) | `counter()`, `gauge()`, `histogram()`, `inc()`, `dec()`, `export()` |
| `IDiscoveryCache`       | Discovery result caching                        | `get()`, `set()`, `has()`, `invalidate()`, `clear()`                |
| `DiscoveryCacheOptions` | Cache configuration                             | `ttl`, `maxSize`, `cleanupInterval`                                 |
| `IThoughtProcessor`     | Thought processing contract                     | `process()`                                                         |
| `IServerConfig`         | Server configuration shape                      | `maxHistorySize`, `maxBranches`, `persistence`, `skillDirs`         |
| `IToolRegistry`         | Tool registry contract                          | `addTool()`, `getTool()`, `discover()`, `listTools()`               |
| `ISkillRegistry`        | Skill registry contract                         | `addSkill()`, `getSkill()`, `discover()`, `listSkills()`            |


## CONVENTIONS

- This is the **single coupling point** — cross-module type imports come through here.
- `IHistoryManager` moved to `src/core/IHistoryManager.ts` (the real interface with 8+ methods).
- Interfaces are defined here; implementations live in their respective modules.
- `IMetrics` and `IDiscoveryCache` are the most widely used (10+ consumer files each).
