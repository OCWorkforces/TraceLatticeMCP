# SRC

**Updated:** 2026-04-29 | **Parent:** ../AGENTS.md

## OVERVIEW

TypeScript source root. Domain logic, transports, DI, infrastructure. Entry: `cli.ts` → `lib.ts:initializeServer()` → `createServer()` wires 18 DI services.

## STRUCTURE

```
src/
├── lib.ts            # ToolAwareSequentialThinkingServer, DI wiring, factories (659L) + public API entry
├── cli.ts            # CLI bin entry (tracelattice)
├── schema.ts         # Valibot schemas + TOOL_DESCRIPTION (724L)
├── ServerConfig.ts   # Config validation, 10 fields + 7 feature flags (517L)
├── errors.ts         # 20 error subclasses + ERROR_CODES const (22 codes) + getErrorMessage helper (829L)
├── utils.ts          # `assertNever(x: never): never` exhaustiveness helper
├── core/             # Domain (13 files, 5 subsystems) — has AGENTS.md
│   ├── graph/        # DAG edges: Edge, EdgeStore, GraphView
│   ├── compression/  # Branch rollup + sliding-window dehydration
│   ├── evaluator/    # SignalComputer, Aggregator, PatternDetector, Calibrator — has AGENTS.md
│   ├── tools/        # Tool interleave suspend/resume
│   └── reasoning/    # Sequential, TreeOfThought, StrategyFactory
├── transport/        # SSE/HTTP/StreamableHTTP — has AGENTS.md
├── persistence/      # File/SQLite/Memory backends — has AGENTS.md
├── contracts/        # Cross-module interfaces hub — has AGENTS.md
├── __tests__/        # Vitest suite — has AGENTS.md
├── di/               # DIContainer + ServiceRegistry (18 typed keys)
├── registry/         # BaseRegistry<T>, ToolRegistry, SkillRegistry
├── cache/            # LRU+TTL DiscoveryCache (300s, 100 max)
├── logger/           # Structured logging (JSON/pretty)
├── pool/             # ConnectionPool: per-user session isolation
├── config/           # ConfigLoader: env > project > user > defaults
├── watchers/         # FS watchers for tool/skill discovery
├── metrics/          # Prometheus counters/gauges/histograms
├── health/           # Aggregate health checking
├── context/          # AsyncLocalStorage (getRequestId only)
└── types/            # Tool, Skill, ServerConfig type defs
```

## WHERE TO LOOK

| Need                       | File                                                                            |
| -------------------------- | ------------------------------------------------------------------------------- |
| Entry flow                 | `cli.ts` → `lib.ts:initializeServer` → `createServer` (DI wires 18 services)    |
| Add a service              | `di/ServiceRegistry.ts` (typed key) + `lib.ts` (registration)                   |
| Add a feature flag         | `contracts/features.ts` (type) + `ServerConfig.ts` (wiring) + env var `TRACELATTICE_FEATURES_*` |
| Add an error type          | `errors.ts` (extend `SequentialThinkingError`, unique `code` in `ERROR_CODES`) |
| Add MCP tool input schema  | `schema.ts` (valibot) + `TOOL_DESCRIPTION` |
| Wire a new transport       | `transport/` factory + `contracts/transport.ts` (implements ITransport) |
| Public API surface         | `lib.ts` (`ToolAwareSequentialThinkingServer`, `createServer`, `initializeServer`)              |
| Add a branded ID type      | `contracts/ids.ts` (SessionId, ThoughtId, EdgeId, SuspensionToken, BranchId + `GLOBAL_SESSION_ID`) |
| Exhaustiveness check       | `utils.ts:assertNever(x)` in default branch of discriminated unions |

## NOTES

- **Entry split**: `lib.ts` = library entry (also public API). `cli.ts` = bin entry. Don't mix.
- **`lib.ts` is the orchestration hub**: All 18 DI services registered here. New subsystems touch `lib.ts` + `di/ServiceRegistry.ts`.
- **No barrels**: Submodules import direct file paths with `.js` ESM extensions.
- **Feature flags gate write paths only**: e.g. `EdgeStore` always registered in DI even when `dagEdges` flag off. Read paths stay safe.
- **Subdirs with own AGENTS.md** (read first before navigating): `core/`, `core/evaluator/`, `transport/`, `persistence/`, `contracts/`, `__tests__/`.
- **Coupling rule**: Cross-module type imports go through `contracts/`. Exceptions: `IHistoryManager` and `ThoughtData` live in `core/` (domain primitives).
- **Layered**: 9 layers in `.sentrux/rules.toml` (types → crosscutting → config → core → domain → infrastructure → di → app → cli). 6 forbidden boundaries.
- **Large files**: `errors.ts` (829L), `schema.ts` (724L), `lib.ts` (659L), `ServerConfig.ts` (517L). Split cautiously; risk public API churn.
- **DI escape hatch**: `Container.resolveDynamic(name: string): unknown` for runtime-keyed lookups. The deprecated `resolve<T>(string)` string overload was removed — use typed `resolve(key)` against `ServiceRegistry` (e.g. `ToolRegistry: ToolRegistry` is the concrete type, not an interface).
- **SkillRegistry**: `removeSkillByName()` was removed; remove via id only.
- **Branded IDs**: `SessionId`/`ThoughtId`/`EdgeId`/`SuspensionToken`/`BranchId` from `contracts/ids.ts` prevent wrong-ID-passing. Use `GLOBAL_SESSION_ID` constant for stdio/global path instead of literal `'__global__'`.
