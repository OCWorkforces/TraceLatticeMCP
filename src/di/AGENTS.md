# DEPENDENCY INJECTION MODULE

**Updated:** 2026-04-18
**Commit:** 906f363

## OVERVIEW

Lightweight DI container for managing service dependencies and testability.

## STRUCTURE

```
src/di/
├── Container.ts        # DIContainer class (singleton/transient/lazy) (363L)
└── ServiceRegistry.ts # Typed service key interface (18 keys)
```

## USAGE

```typescript
container.registerInstance('Logger', logger);
container.register('HistoryManager', () => new HistoryManager({...})); // Singleton
container.registerFactory('ThoughtEvaluator', () => new ThoughtEvaluator()); // Transient

const history = container.resolve<HistoryManager>('HistoryManager');
```

## LIFECYCLE

1. **Singleton**: Created once, cached forever (registerInstance/register).
2. **Transient**: Created every time (registerFactory).
3. **Lazy**: Factories executed only on first resolve.

## ServiceRegistry

`ServiceRegistry` interface defines typed keys (18 total): `Logger`, `Config`, `FileConfig`, `HistoryManager`, `ThoughtProcessor`, `ThoughtFormatter`, `ThoughtEvaluator`, `Metrics`, `ToolRegistry`, `SkillRegistry`, `Persistence`, `EdgeStore`, `reasoningStrategy`, `outcomeRecorder`, `Calibrator`, `summaryStore`, `compressionService`, `suspensionStore`.
