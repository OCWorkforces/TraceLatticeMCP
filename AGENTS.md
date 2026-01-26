# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-26
**Commit:** (see git)
**Branch:** (see git)

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
│   └── __tests__/        # Tests (see src/__tests__/AGENTS.md)
├── .claude/              # Skills + tools directories
└── docs/                 # Documentation assets
```

## WHERE TO LOOK

| Task                     | Location                                | Notes                          |
| ------------------------ | --------------------------------------- | ------------------------------ |
| **Core Logic**           | `src/index.ts`, `src/HistoryManager.ts` | Entry point & state management |
| **Persistence**          | `src/persistence/`                      | File/SQLite/Memory backends    |
| **Dependency Injection** | `src/di/`                               | IoC container implementation   |
| **Transports**           | `src/transport/`                        | SSE & Stdio implementations    |
| **Metrics**              | `src/metrics/`                          | Prometheus telemetry           |

## CONVENTIONS

- **Async-First**: All I/O and discovery is async.
- **Factory Pattern**: Use `create*` functions in `index.ts` files.
- **DI**: Inject dependencies via `src/di` container; avoid global state.
- **Error Handling**: Use `SequentialThinkingError` hierarchy; never swallow errors.

## ANTI-PATTERNS (THIS PROJECT)

- **No `as any`**: Strict type safety required.
- **No Global State**: Use the DI container.
- **No Sync I/O**: Use async equivalents (except in strictly sync startup context).
- **Gitignore**: The project currently uses a Python .gitignore template. Be aware of node_modules/ inclusion.
- **Entry Points**: Avoid mixing CLI logic with library exports in `index.ts`.

## SETUP NOTES

- **Missing CI**: No GitHub workflows present.
- **Missing Helpers**: Test suite lacks shared helpers/fixtures.
- **Empty Modules**: `telemetry` directory is currently empty.

## COMMANDS

```bash
npm run build       # Build project
npm run start       # Start server
npm run dev         # Dev mode with inspector
npm test            # Run all tests
npm run type-check  # Validate types
```
