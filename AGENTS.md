# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-09
**Commit:** 060d98b
**Branch:** develop
## OVERVIEW

MCP Sequential Thinking Server - TypeScript/Node.js server providing structured thinking with tool/skill recommendations. Supports stdio, SSE, and HTTP transports with DI, persistence, and worker pool patterns.

## STRUCTURE

```
./
├── src/                  # Source code (see src/AGENTS.md)
│   ├── persistence/      # State persistence (see src/persistence/AGENTS.md)
│   ├── transport/        # MCP transports (see src/transport/AGENTS.md)
│   ├── di/               # DI container (see src/di/AGENTS.md)
│   ├── registry/         # Tool/Skill registries (see src/registry/AGENTS.md)
│   ├── cluster/          # Worker pool (see src/cluster/AGENTS.md)
│   ├── cache/            # LRU cache (see src/cache/AGENTS.md)
│   ├── logger/           # Structured logging (see src/logger/AGENTS.md)
│   ├── pool/             # Session pooling (see src/pool/AGENTS.md)
│   ├── config/           # Config loading (see src/config/AGENTS.md)
│   ├── formatter/        # Output formatting (see src/formatter/AGENTS.md)
│   ├── watchers/         # File system watchers (see src/watchers/AGENTS.md)
│   ├── processor/        # Thought processing (see src/processor/AGENTS.md)
│   ├── metrics/          # Prometheus metrics (see src/metrics/AGENTS.md)
│   ├── telemetry/        # OpenTelemetry tracing (see src/telemetry/AGENTS.md)
│   ├── context/          # Request context via AsyncLocalStorage
│   └── __tests__/        # Tests (see src/__tests__/AGENTS.md)
├── .claude/              # Skills + tools directories
└── docs/                 # Documentation assets

## WHERE TO LOOK

| Task                     | Location                                | Notes                          |
| ------------------------ | --------------------------------------- | ------------------------------ |
| **Core Logic**           | `src/index.ts`, `src/HistoryManager.ts` | Entry point & state management |
| **Persistence**          | `src/persistence/`                      | File/SQLite/Memory backends    |
| **Dependency Injection** | `src/di/`                               | IoC container implementation   |
| **Transports**           | `src/transport/`                        | SSE & Stdio implementations    |
| **Metrics**              | `src/metrics/`                          | Prometheus telemetry           |
| **Config**               | `src/config/`                           | YAML + env var loading         |
| **Caching**              | `src/cache/`                            | Discovery LRU + TTL            |
| **Pool**                 | `src/pool/`                             | Multi-user session isolation   |

## CODE MAP

| Symbol                              | Type  | Location                          | Refs                            | Role |
| ----------------------------------- | ----- | --------------------------------- | ------------------------------- | ---- |
| `ToolAwareSequentialThinkingServer` | class | src/index.ts                      | Main server entry point         |
| `HistoryManager`                    | class | src/HistoryManager.ts             | State & branch management       |
| `ThoughtProcessor`                  | class | src/processor/ThoughtProcessor.ts | Request validation & processing |
| `SseTransport`                      | class | src/transport/SseTransport.ts     | SSE transport implementation    |
| `HttpTransport`                     | class | src/transport/HttpTransport.ts    | HTTP transport implementation   |
| `WorkerManager`                     | class | src/cluster/WorkerManager.ts      | Worker pool management          |
| `ToolRegistry`                      | class | src/registry/ToolRegistry.ts      | MCP tool lifecycle              |
| `SkillRegistry`                     | class | src/registry/SkillRegistry.ts     | Claude skill lifecycle          |
| `DIContainer`                       | class | src/di/DIContainer.ts             | Dependency injection            |
| `DiscoveryCache`                    | class | src/cache/DiscoveryCache.ts       | LRU cache for discovery         |
| `ConnectionPool`                    | class | src/pool/ConnectionPool.ts        | Multi-user session pool         |
| `ConfigLoader`                      | class | src/config/ConfigLoader.ts        | YAML + env config               |

## CONVENTIONS

- **Async-First**: All I/O and discovery is async.
- **Factory Pattern**: Use `create*` functions in `index.ts` files.
- **DI**: Inject dependencies via `src/di` container; avoid global state.
- **Error Handling**: Use `SequentialThinkingError` hierarchy; never swallow errors.
- **Dual Documentation**: Each module has `AGENTS.md` (auto-generated) + `CLAUDE.md` (human-written).

## ANTI-PATTERNS (THIS PROJECT)

- **No `as any`**: Strict type safety required.
- **No `@ts-ignore` / `@ts-expect-error`**: Fix type issues properly.
- **No Global State**: Use the DI container.
- **No Sync I/O**: Use async equivalents (except in strictly sync startup context).
- **No Empty Catch**: Never swallow errors.
- **Gitignore**: Uses Python .gitignore template — verify node_modules/ exclusion.
- **Entry Points**: Avoid mixing CLI logic with library exports in `index.ts`.

## SETUP NOTES

- **CI**: GitHub workflow at `.github/workflows/ci.yml` (type-check, lint, test, build)
- **Lint/Security**: CI has `continue-on-error: true` for lint + audit — failures won't block merges.
- **Coverage Thresholds**: Branches 55%, Functions 60%, Lines 65%, Statements 65%.
- **Test Helpers**: `src/__tests__/helpers/` exists but is currently empty — helpers are inline.
- **Large Files**: `index.ts` (602L), `ToolRegistry.ts` (579L), `SkillRegistry.ts` (578L) — consider decomposition.
## COMMANDS

```bash
npm run build       # Build project
npm run start       # Start server
npm run dev         # Dev mode with inspector
npm test            # Run all tests
npm run type-check  # Validate types
```
