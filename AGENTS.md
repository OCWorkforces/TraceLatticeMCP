# PROJECT KNOWLEDGE BASE

**Updated:** 2026-03-27
**Commit:** d5cab9d
**Branch:** develop

## OVERVIEW

MCP Sequential Thinking Server - TypeScript/Node.js server providing structured thinking with tool/skill recommendations. Supports stdio, SSE, Streamable HTTP, and HTTP transports with DI, persistence, worker pool, and OpenTelemetry.

## STRUCTURE

```
./
├── src/                  # Source code (see src/AGENTS.md)
│   ├── persistence/      # State persistence backends (File/SQLite/Memory)
│   ├── transport/        # MCP transports (SSE/HTTP/StreamableHTTP)
│   ├── di/               # DI container + service registry
│   ├── registry/         # Tool/Skill registries (BaseRegistry<T> + subclasses)
│   ├── contracts/        # Shared interfaces (IMetrics, IDiscoveryCache, etc.)
│   ├── cluster/          # Worker pool for parallel thought processing
│   ├── cache/            # LRU+TTL discovery cache
│   ├── logger/           # Structured logging (JSON/pretty)
│   ├── pool/             # Multi-user session pool
│   ├── config/           # YAML + env var config loading
│   ├── formatter/        # Thought output formatting
│   ├── watchers/         # File system watchers for tool/skill discovery
│   ├── processor/        # Thought validation + processing pipeline
│   ├── metrics/          # Prometheus metrics collection
│   ├── telemetry/        # OpenTelemetry distributed tracing
│   ├── health/           # Aggregate health checking
│   ├── context/          # Request context via AsyncLocalStorage
│   └── __tests__/        # Test suite (Vitest, 870+ tests)
├── .agents/             # Agent skills (vercel-react-*)
├── .sentrux/            # sentrux architectural rules
└── docs/                # Documentation assets
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| **Core Logic** | `src/lib.ts`, `src/index.ts` | Entry point, wiring, ToolAwareSequentialThinkingServer |
| **State Management** | `src/HistoryManager.ts` | Thought history, branching, persistence buffering |
| **Shared Interfaces** | `src/contracts/interfaces.ts` | IMetrics, IDiscoveryCache, IHistoryManager, etc. |
| **Persistence** | `src/persistence/` | File/SQLite/Memory backends |
| **DI Container** | `src/di/Container.ts` | IoC container + ServiceRegistry type |
| **Transports** | `src/transport/` | SSE, HTTP, StreamableHTTP implementations |
| **Tool/Skill Discovery** | `src/registry/BaseRegistry.ts` | Base class with frontmatter parsing, LRU cache |
| **Worker Pool** | `src/cluster/WorkerManager.ts` | Multi-process parallel processing |
| **Metrics** | `src/metrics/Metrics.impl.ts` | Prometheus counters, gauges, histograms |
| **Config** | `src/config/ConfigLoader.ts` | YAML + env var loading |
| **Telemetry** | `src/telemetry/Telemetry.ts` | OpenTelemetry span management |

## CODE MAP

| Symbol | Type | Location | Role |
|---|---|---|---|
| `ToolAwareSequentialThinkingServer` | class | src/lib.ts | Main server: DI wiring, MCP tool registration |
| `createServer` | function | src/lib.ts | Factory for server instantiation |
| `HistoryManager` | class | src/HistoryManager.ts | Thought history, branching, buffered persistence |
| `BaseRegistry` | class | src/registry/BaseRegistry.ts | Generic CRUD + discovery + cache + frontmatter |
| `ToolRegistry` | class | src/registry/ToolRegistry.ts | MCP tool discovery (extends BaseRegistry) |
| `SkillRegistry` | class | src/registry/SkillRegistry.ts | Claude skill discovery (extends BaseRegistry) |
| `ThoughtProcessor` | class | src/processor/ThoughtProcessor.ts | Validate → normalize → persist → format |
| `StreamableHttpTransport` | class | src/transport/StreamableHttpTransport.ts | MCP Streamable HTTP transport (826L) |
| `SseTransport` | class | src/transport/SseTransport.ts | SSE transport for multi-user streaming |
| `HttpTransport` | class | src/transport/HttpTransport.ts | HTTP JSON-RPC transport |
| `DIContainer` | class | src/di/Container.ts | IoC container (singleton/transient/lazy) |
| `ServiceRegistry` | interface | src/di/ServiceRegistry.ts | Typed service key interface |
| `DiscoveryCache` | class | src/cache/DiscoveryCache.ts | LRU+TTL cache for tool/skill discovery |
| `Metrics` | class | src/metrics/Metrics.impl.ts | Prometheus-compatible metrics |
| `Telemetry` | class | src/telemetry/Telemetry.ts | OpenTelemetry span management |
| `ConfigLoader` | class | src/config/ConfigLoader.ts | YAML + env var config |
| `ConnectionPool` | class | src/pool/ConnectionPool.ts | Multi-user session isolation |
| `WorkerManager` | class | src/cluster/WorkerManager.ts | Worker pool management |

## CONVENTIONS

- **Async-First**: All I/O and discovery is async.
- **Factory Pattern**: `createServer()`, `createPersistenceBackend()`, `createTransport()` functions.
- **DI**: Inject via `src/di` container; typed via `ServiceRegistry` interface; no global state.
- **Error Handling**: `SequentialThinkingError` hierarchy (13 types); never swallow errors.
- **Contracts Module**: Cross-module type imports go through `src/contracts/` — single coupling point.
- **No Barrel Files**: Submodules import directly from source files (barrels deleted, only `src/index.ts` public API remains).

## ANTI-PATTERNS (THIS PROJECT)

- **No `as any`**: Strict type safety required.
- **No `@ts-ignore` / `@ts-expect-error`**: Fix type issues properly.
- **No Global State**: Use the DI container.
- **No Sync I/O**: Use async equivalents (except strictly sync startup).
- **No Empty Catch**: Never swallow errors.
- **No Barrel Re-exports**: No `index.ts` re-export files in submodules.
- **Entry Points**: `src/index.ts` is a 1-line re-export to `src/lib.ts`; avoid mixing CLI and library code.

## SETUP NOTES

- **CI**: `.github/workflows/ci.yml` (type-check, lint, test, build).
- **Lint/Security**: CI `continue-on-error: true` for lint + audit.
- **Coverage**: 81.95% statements (870+ tests, 31 test files).
- **Test Helpers**: `src/__tests__/helpers/index.ts` (test convenience barrel).
- **Large Files**: `StreamableHttpTransport.ts` (826L), `HistoryManager.ts` (755L), `sequentialthinking-tools.test.ts` (1076L).
- **Architectural Rules**: `.sentrux/rules.toml` — 9 layers, 6 boundaries, enforced by sentrux.

## COMMANDS

```bash
npm run build       # Build project
npm run start       # Start server
npm run dev         # Dev mode with inspector
npm test            # Run all tests (870+ tests)
npm run type-check  # Validate types
npm run lint        # ESLint (CI has continue-on-error)
```
