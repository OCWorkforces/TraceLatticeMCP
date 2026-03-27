# CONTRACTS MODULE

**Created:** 2026-03-27
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
| `IHistoryManager`       | Thought history operations                      | `getHistory()`, `clear()`, `loadFromPersistence()`, `shutdown()`    |
| `IThoughtProcessor`     | Thought processing contract                     | `process()`                                                         |
| `IServerConfig`         | Server configuration shape                      | `maxHistorySize`, `maxBranches`, `persistence`, `skillDirs`         |
| `IToolRegistry`         | Tool registry contract                          | `addTool()`, `getTool()`, `discover()`, `listTools()`               |
| `ISkillRegistry`        | Skill registry contract                         | `addSkill()`, `getSkill()`, `discover()`, `listSkills()`            |

## RE-EXPORTS

`index.ts` also re-exports from other modules for convenience:

- `Logger`, `LogLevel` from `logger/`
- `IDisposable` from `types.ts`
- `PersistenceBackend`, `PersistenceConfig` from `persistence/`

## CONVENTIONS

- This is the **single coupling point** — all cross-module type imports should come through here.
- Interfaces are defined here; implementations live in their respective modules.
- `IMetrics` and `IDiscoveryCache` are the most widely used (10+ consumer files each).
