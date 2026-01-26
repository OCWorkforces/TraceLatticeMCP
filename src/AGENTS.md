# SOURCE MODULE

**Generated:** 2026-01-26
**Parent:** ../AGENTS.md

## OVERVIEW

Core application source code organized by domain (Infrastructure, Core, Persistence, Discovery).

## STRUCTURE

```
src/
├── Core
│   ├── index.ts          # Entry point
│   ├── HistoryManager.ts # State & Branching logic
│   └── ServerConfig.ts   # Config validation
├── Infrastructure
│   ├── di/               # (see di/AGENTS.md)
│   ├── cache/            # LRU Cache
│   ├── config/           # Config loading
│   └── logger/           # Structured logging
├── Domains
│   ├── persistence/      # (see persistence/AGENTS.md)
│   ├── transport/        # (see transport/AGENTS.md)
│   ├── registry/         # (see registry/AGENTS.md)
│   ├── cluster/          # (see cluster/AGENTS.md)
│   └── pool/             # Session pooling
└── Quality
    ├── metrics/          # (see metrics/AGENTS.md)
    └── __tests__/        # (see __tests__/AGENTS.md)
```

## KEY PATTERNS

- **Re-exports**: Public API exported via `index.ts`.
- **Manager Pattern**: `HistoryManager`, `ToolRegistry`, etc. encapsulate logic.
- **Validation**: `valibot` schemas in `schema.ts`.
