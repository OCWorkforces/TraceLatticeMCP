# SOURCE MODULE

**Updated:** 2026-03-27
**Parent:** ../AGENTS.md

## OVERVIEW

Core application source code organized by domain (Infrastructure, Core, Persistence, Discovery).

## STRUCTURE

```
src/
src/
├── Core
│   ├── lib.ts            # Server class + DI wiring + factory
│   ├── index.ts          # 1-line re-export to lib.js (public API)
│   ├── core/             # Core domain logic (see below)
│   ├── ServerConfig.ts   # Config validation
│   ├── errors.ts         # Error class hierarchy (13 types)
│   ├── schema.ts         # Valibot validation schemas
│   └── cli.ts            # CLI entry point
├── Infrastructure
│   ├── di/               # DI container (see di/AGENTS.md)
│   ├── contracts/        # Shared interface contracts (see contracts/AGENTS.md)
│   ├── cache/            # LRU Cache (see cache/AGENTS.md)
│   ├── config/           # Config loading (see config/AGENTS.md)
│   ├── logger/           # Structured logging (see logger/AGENTS.md)
│   ├── context/          # Request context via AsyncLocalStorage
│   ├── persistence/      # State backends (see persistence/AGENTS.md)
│   ├── transport/        # MCP transports (see transport/AGENTS.md)
│   ├── registry/         # Tool/Skill registries (see registry/AGENTS.md)
│   ├── cluster/          # Worker pool (see cluster/AGENTS.md)
│   ├── pool/             # Session pooling (see pool/AGENTS.md)
│   ├── health/           # Aggregate health checking
│   ├── watchers/         # File watchers (see watchers/AGENTS.md)
│   ├── metrics/          # Prometheus metrics (see metrics/AGENTS.md)
│   └── telemetry/        # OpenTelemetry tracing (see telemetry/AGENTS.md)
└── Quality
    └── __tests__/        # Test suite (see __tests__/AGENTS.md)

## KEY PATTERNS

- **Public API**: `src/index.ts` is a 1-line re-export to `src/lib.js`.
- **Manager Pattern**: `HistoryManager`, `ToolRegistry`, `SkillRegistry` encapsulate logic.
- **Validation**: `valibot` schemas in `schema.ts`.
- **Factory Functions**: `createServer()`, `createPersistenceBackend()`, `createTransport()`.
- **BaseRegistry<T>**: Generic base with CRUD, frontmatter parsing, LRU cache; `ToolRegistry` and `SkillRegistry` extend it.
- **Contracts Module**: `src/contracts/` centralizes shared interfaces (IMetrics, IDiscoveryCache, etc.) — single coupling point for cross-module types. `IHistoryManager` lives in `src/core/`.
- **No Barrels**: Submodule barrel files deleted; direct imports only. Only `src/index.ts` (public API) and `src/contracts/index.ts` (module aggregation) remain.