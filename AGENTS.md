# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-26 09:15
**Commit:** 97ab0c34b859c20be5b145ad0315229bc860d051
**Branch:** (see git)

## OVERVIEW

MCP Sequential Thinking Server - TypeScript/Node.js MCP server providing structured thinking with tool/skill recommendations. Supports stdio, SSE, and HTTP transports with DI, persistence, and worker pool patterns.

## STRUCTURE

```
./
├── src/
│   ├── index.ts              # Main server entry
│   ├── schema.ts             # Valibot schemas
│   ├── types.ts              # TypeScript interfaces
│   ├── errors.ts             # Error hierarchy
│   ├── HistoryManager.ts     # Thought history + branches
│   ├── di/                   # DI container
│   ├── cache/                # Discovery LRU cache
│   ├── config/               # Config loading
│   ├── logger/               # Structured logging
│   ├── persistence/          # State persistence (file/sqlite/memory)
│   ├── transport/            # MCP transports (SSE/HTTP)
│   ├── cluster/              # Worker pool
│   ├── pool/                 # Session pooling
│   ├── registry/             # Tool + Skill registries
│   ├── watchers/             # File watchers
│   ├── processor/            # Thought processing
│   ├── formatter/            # Response formatting
│   ├── metrics/              # Telemetry (NEEDSDOC)
│   └── __tests__/            # 380+ tests
├── .claude/                  # Skills + tools directories
└── docs/                     # Documentation assets
```

## WHERE TO LOOK

| Task                 | Location                                | Notes                               |
| -------------------- | --------------------------------------- | ----------------------------------- |
| Core server logic    | `src/index.ts`, `src/HistoryManager.ts` | `ToolAwareSequentialThinkingServer` |
| Add new feature      | See relevant subdirectory CLAUDE.md     | All modules documented              |
| Dependency injection | `src/di/CLAUDE.md`                      | Container patterns                  |
| Persistence          | `src/persistence/CLAUDE.md`             | File/SQLite/Memory backends         |
| Transports           | `src/transport/CLAUDE.md`               | SSE + HTTP patterns                 |
| Registry             | `src/registry/CLAUDE.md`                | Tool/Skill discovery                |
| Testing              | `src/__tests__/CLAUDE.md`               | 380+ tests, Vitest                  |
| **Undocumented**     | `src/metrics/`                          | See `src/metrics/AGENTS.md`         |

## CONVENTIONS

- **Class naming**: PascalCase for exports, camelCase for internals
- **File naming**: `*.ts` (implementation), `*.test.ts` (tests)
- **Factory functions**: `create*` prefix in `index.ts` exports
- **Async-first**: All discovery and initialization is async
- **Manager pattern**: `server.history`, `server.tools`, `server.skills`, `server.config`
- **Error codes**: UPPER_SNAKE format in error hierarchy

## ANTI-PATTERNS (THIS PROJECT)

- **Never suppress type errors**: No `as any`, `@ts-ignore`, `@ts-expect-error`
- **Never leave errors unhandled**: Empty catch blocks forbidden
- **Never commit broken state**: Revert after 3 failed fix attempts
- **Never delete tests to "pass"**: Fix root cause instead

## COMMANDS

```bash
# Build
npm run build

# Start (stdio default)
npm run start

# Dev with inspector
npm run dev

# Tests
npm test
npm run test:watch
npm run test:coverage

# Type check
npm run type-check
```

## DEPENDENCIES

- `tmcp`: MCP server framework
- `@tmcp/adapter-valibot`: Schema validation
- `valibot`: Runtime validation
- `chokidar`: File watching
- `vitest`: Testing

## NOTES

- CLAUDE.md exists in most subdirectories - READ FIRST for module-specific guidance
- `src/metrics/` lacks documentation - see `src/metrics/AGENTS.md`
- Session pooling via `src/pool/` for multi-user isolation
- Worker cluster via `src/cluster/` for parallel processing
