# PROJECT KNOWLEDGE BASE

**Updated:** 2026-03-29
**Commit:** 0c0f4c3
**Branch:** develop

## OVERVIEW

MCP Sequential Thinking Server - TypeScript/Node.js server providing structured thinking with tool/skill recommendations. Supports stdio, SSE, Streamable HTTP, and HTTP transports with DI, persistence, worker pool, and OpenTelemetry.

## STRUCTURE

```
./
├── src/                  # Source code (see src/AGENTS.md)
│   ├── core/            # Core domain: HistoryManager, ThoughtProcessor, types
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
│   ├── watchers/         # File system watchers for tool/skill discovery
│   ├── metrics/          # Prometheus metrics collection
│   ├── telemetry/        # OpenTelemetry distributed tracing
│   ├── health/           # Aggregate health checking
│   ├── context/          # Request context via AsyncLocalStorage
│   └── __tests__/        # Test suite (Vitest, 872 tests, 31 files)
├── .agents/             # Agent skills (vercel-react-*)
├── .sentrux/            # sentrux architectural rules
└── docs/                # Documentation assets
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| **Core Logic** | `src/lib.ts`, `src/index.ts` | Entry point, wiring, ToolAwareSequentialThinkingServer |
| **State Management** | `src/core/HistoryManager.ts` | Thought history, branching, persistence buffering |
| **Shared Interfaces** | `src/contracts/interfaces.ts` | IMetrics, IDiscoveryCache, etc. (`IHistoryManager` in `src/core/`) |
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
| `ToolAwareSequentialThinkingServer` | class | src/lib.ts | Main server: DI wiring, MCP tool registration, lifecycle |
| `createServer` | function | src/lib.ts | Async factory with persistence + discovery |
| `initializeServer` | function | src/lib.ts | Convenience factory with config + logger + watchers |
| `HistoryManager` | class | src/core/HistoryManager.ts | Thought history, branching, buffered persistence (755L) |
| `IHistoryManager` | interface | src/core/IHistoryManager.ts | History manager contract (8 methods) |
| `ThoughtProcessor` | class | src/core/ThoughtProcessor.ts | Validate → normalize → persist → format pipeline |
| `InputNormalizer` | function | src/core/InputNormalizer.ts | Fixes LLM field mistakes, fills defaults |
| `ThoughtFormatter` | class | src/core/ThoughtFormatter.ts | Display formatting with chalk (💭/🔄/🌿) |
| `SequentialThinkingError` | class | src/errors.ts | Base error (13 subclasses, each with unique `code`) |
| `BaseRegistry<T>` | class | src/registry/BaseRegistry.ts | Generic CRUD + discovery + cache + frontmatter (Template Method) |
| `ToolRegistry` | class | src/registry/ToolRegistry.ts | MCP tool discovery (extends BaseRegistry<Tool>) |
| `SkillRegistry` | class | src/registry/SkillRegistry.ts | Claude skill discovery (extends BaseRegistry<Skill>) |
| `StreamableHttpTransport` | class | src/transport/StreamableHttpTransport.ts | MCP Streamable HTTP transport (724L, stateful/stateless) |
| `SseTransport` | class | src/transport/SseTransport.ts | SSE transport for multi-user streaming |
| `HttpTransport` | class | src/transport/HttpTransport.ts | HTTP JSON-RPC transport (stateless) |
| `BaseTransport` | abstract class | src/transport/BaseTransport.ts | Security, rate limiting, CORS, health endpoints |
| `DIContainer` | class | src/di/Container.ts | IoC container (singleton/transient/lazy, circular detection) |
| `ServiceRegistry` | interface | src/di/ServiceRegistry.ts | Typed service key map (10 services) |
| `DiscoveryCache` | class | src/cache/DiscoveryCache.ts | LRU+TTL cache (TTL 300s, max 100 entries) |
| `Metrics` | class | src/metrics/Metrics.impl.ts | Prometheus counters, gauges, histograms |
| `Telemetry` | class | src/telemetry/Telemetry.ts | OpenTelemetry span management (opt-in) |
| `ConfigLoader` | class | src/config/ConfigLoader.ts | YAML + env var config (env > project > user > defaults) |
| `ConnectionPool` | class | src/pool/ConnectionPool.ts | Multi-user session isolation with timeouts |
| `WorkerManager` | class | src/cluster/WorkerManager.ts | Worker thread pool with auto-restart |

## CONVENTIONS

- **Async-First**: All I/O and discovery is async.
- **Factory Pattern**: `createServer()`, `createPersistenceBackend()`, `createStreamableHttpTransport()` etc.
- **DI**: Inject via `src/di` container; typed via `ServiceRegistry` (10 keys); no global state.
- **Error Handling**: `SequentialThinkingError` hierarchy (13 types + `ValidationError` with `field`); never swallow.
- **Contracts Module**: Cross-module type imports go through `src/contracts/` — single coupling point. `IHistoryManager` + `ThoughtData` live in `src/core/`.
- **No Barrels**: Submodules import directly from source files. Only `src/index.ts` (public API) and `src/contracts/index.ts` (coupling point) are barrels.
- **ESM-only**: `"type": "module"`, imports use `.js` extensions.
- **Valibot**: Validation uses `valibot` (not zod/joi). Schemas in `src/schema.ts`.
- **Tabs**: Prettier configured for tabs (tabWidth 2), single quotes, printWidth 100.
- **`override` keyword**: Required by `noImplicitOverride`.
- **Private `_` prefix**: `_container`, `_logger`, `_historyManager` etc.
- **Unused params `_`**: ESLint `argsIgnorePattern: '^_'`.
- **JSDoc**: All public APIs have full TSDoc with `@example`, `@param`, `@returns`.

## ANTI-PATTERNS (THIS PROJECT)

- **No `as any`**: Strict type safety. ESLint `no-explicit-any` = warn.
- **No `@ts-ignore` / `@ts-expect-error`**: Fix type issues properly.
- **No Global State**: Use the DI container. `AsyncLocalStorage` for request context.
- **No Sync I/O**: Use async equivalents (except strictly sync startup).
- **No Empty Catch**: Never swallow errors. All catch blocks log, rethrow, or collect.
- **No Barrel Re-exports**: Only `src/index.ts` and `src/contracts/index.ts` are allowed.
- **Entry Points**: `src/index.ts` is 1-line re-export to `src/lib.ts`; `src/cli.ts` is CLI entry. Don't mix.
- **Max CC 25**: Cyclomatic complexity per function (enforced by sentrux).
- **Max function 100 lines**: Function length limit (enforced by sentrux).

## SETUP NOTES

- **CI**: `.github/workflows/ci.yml` — Node 22.x + 24.x matrix. Hard gates: type-check, test+coverage, build. Soft gates (continue-on-error): lint, audit.
- **Coverage**: 81.95% statements (872 tests, 31 files). Thresholds: branches 55%, functions 60%, lines 65%, statements 65%.
- **Test Helpers**: `src/__tests__/helpers/index.ts` — `createTestThought()`, `MockHistoryManager`, timer helpers.
- **Large Files**: `HistoryManager.ts` (755L), `StreamableHttpTransport.ts` (724L), `errors.ts` (561L), `schema.ts` (541L), `lib.ts` (479L).
- **Architectural Layers**: `.sentrux/rules.toml` — 9 layers (types→crosscutting→config→core→domain→infrastructure→di→app→cli), 6 forbidden boundaries.
- **Duplicate env files**: Both `.env.example` (minimal) and `.example.env` (full) exist — non-standard.

## COMMANDS

```bash
npm run build       # tsc && chmod +x dist/cli.js
npm run start       # node dist/cli.js
npm run dev         # MCP inspector mode
npm test            # vitest run (872 tests)
npm run test:coverage # vitest run --coverage
npm run type-check  # tsc --noEmit
npm run lint        # eslint src/
```
