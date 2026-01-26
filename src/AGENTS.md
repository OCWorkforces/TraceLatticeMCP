# SOURCE DIRECTORY

**Generated:** 2026-01-26 09:15

## DIRECTORY MAP

```
src/
├── Core
│   ├── index.ts          # Main entry + ToolAwareSequentialThinkingServer
│   ├── schema.ts         # Valibot validation schemas
│   ├── types.ts          # TypeScript interfaces
│   ├── errors.ts         # SequentialThinkingError hierarchy
│   ├── HistoryManager.ts # Thought history + branch management
│   └── ServerConfig.ts   # Configuration class
├── Infrastructure
│   ├── di/               # Dependency injection container
│   ├── cache/            # Discovery LRU cache
│   ├── config/           # File-based config loading
│   └── logger/           # Structured logger
├── Persistence (see persistence/CLAUDE.md)
│   ├── persistence/      # State persistence backends
├── Transport (see transport/CLAUDE.md)
│   ├── transport/        # MCP transports (SSE, HTTP)
├── Scalability
│   ├── cluster/          # Worker pool manager
│   └── pool/             # Session connection pool
├── Discovery
│   ├── registry/         # Tool + Skill registries
│   └── watchers/         # File watchers
├── Processing
│   ├── processor/        # ThoughtProcessor + InputNormalizer
│   └── formatter/        # ThoughtFormatter
├── Telemetry (NEEDSDOC)
│   └── metrics/          # Metrics + telemetry (UNDOCUMENTED)
└── Testing
    └── __tests__/        # 380+ tests
```

## WHERE TO WORK

| Task         | Location                        | Documentation                 |
| ------------ | ------------------------------- | ----------------------------- |
| Server core  | `index.ts`, `HistoryManager.ts` | Root CLAUDE.md                |
| DI container | `di/`                           | `di/CLAUDE.md`                |
| Persistence  | `persistence/`                  | `persistence/CLAUDE.md`       |
| Transports   | `transport/`                    | `transport/CLAUDE.md`         |
| Worker pool  | `cluster/`                      | `cluster/CLAUDE.md`           |
| Registries   | `registry/`                     | `registry/CLAUDE.md`          |
| Processing   | `processor/`                    | `processor/CLAUDE.md`         |
| **Metrics**  | `metrics/`                      | `metrics/AGENTS.md` ← MISSING |
| Tests        | `__tests__/`                    | `__tests__/CLAUDE.md`         |

## KEY EXPORTS

```typescript
// Main server
import { ToolAwareSequentialThinkingServer } from './index.js';

// History management
import { HistoryManager } from './HistoryManager.js';

// Registries
import { ToolRegistry, SkillRegistry } from './registry/index.js';

// Processor
import { ThoughtProcessor } from './processor/ThoughtProcessor.js';

// Formatter
import { ThoughtFormatter } from './formatter/ThoughtFormatter.js';
```

## PATTERNS

- **index.ts re-exports**: All public APIs available from `./index.js`
- **Module index.ts**: Each subdirectory has `index.ts` with factory functions
- **Named exports**: Prefer named over default for tree-shaking
- **Async factories**: `create*` functions return `Promise<T>`
