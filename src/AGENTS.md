# SOURCE MODULE

**Generated:** 2026-03-09
**Parent:** ../AGENTS.md
## OVERVIEW

Core application source code organized by domain (Infrastructure, Core, Persistence, Discovery).

## STRUCTURE

```
src/
├── Core
│   ├── index.ts          # Entry point + ToolAwareSequentialThinkingServer
│   ├── HistoryManager.ts # State & Branching logic
│   ├── ServerConfig.ts   # Config validation
│   ├── errors.ts         # Error class hierarchy (13 types)
│   ├── schema.ts         # Valibot validation schemas
│   └── types.ts          # Central type definitions
├── Infrastructure
│   ├── di/               # DI container (see di/AGENTS.md)
│   ├── cache/            # LRU Cache (see cache/AGENTS.md)
│   ├── config/           # Config loading (see config/AGENTS.md)
│   ├── logger/           # Structured logging (see logger/AGENTS.md)
│   ├── context/          # Request context via AsyncLocalStorage
│   └── formatter/        # Output formatting (see formatter/AGENTS.md)
├── Domains
│   ├── persistence/      # State backends (see persistence/AGENTS.md)
│   ├── transport/        # MCP transports (see transport/AGENTS.md)
│   ├── registry/         # Tool/Skill registries (see registry/AGENTS.md)
│   ├── cluster/          # Worker pool (see cluster/AGENTS.md)
│   ├── pool/             # Session pooling (see pool/AGENTS.md)
│   ├── watchers/         # File watchers (see watchers/AGENTS.md)
│   ├── processor/        # Thought processing (see processor/AGENTS.md)
│   ├── metrics/          # Prometheus metrics (see metrics/AGENTS.md)
│   └── telemetry/        # OpenTelemetry tracing (see telemetry/AGENTS.md)
└── Quality
    └── __tests__/        # Test suite (see __tests__/AGENTS.md)

## KEY PATTERNS

- **Re-exports**: Public API exported via `index.ts`.
- **Manager Pattern**: `HistoryManager`, `ToolRegistry`, `SkillRegistry` encapsulate logic.
- **Validation**: `valibot` schemas in `schema.ts`.
- **Dual Documentation**: Every module has `AGENTS.md` + `CLAUDE.md`.
- **Factory Functions**: `createServer()`, `createPersistenceBackend()`, etc.
- **Registry Duplication**: `ToolRegistry` and `SkillRegistry` share ~80% code — consider `BaseRegistry<T>`.
