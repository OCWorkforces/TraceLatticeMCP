# DEPENDENCY INJECTION MODULE

**Updated:** 2026-03-27
**Parent:** ../AGENTS.md

## OVERVIEW

Lightweight DI container for managing service dependencies and testability.

## STRUCTURE

```
src/di/
├── Container.ts        # DIContainer class (singleton/transient/lazy)
└── ServiceRegistry.ts # Typed service key interface
```

## USAGE

```typescript
container.registerInstance('Logger', logger);
container.register('HistoryManager', () => new HistoryManager({...})); // Singleton
container.registerFactory('ThoughtFormatter', () => new Formatter()); // Transient

const history = container.resolve<HistoryManager>('HistoryManager');
```

## LIFECYCLE

1. **Singleton**: Created once, cached forever (registerInstance/register).
2. **Transient**: Created every time (registerFactory).
3. **Lazy**: Factories executed only on first resolve.

## ServiceRegistry

`ServiceRegistry` interface defines typed keys: `Logger`, `Config`, `FileConfig`, `HistoryManager`, `ThoughtProcessor`, `ThoughtFormatter`, `Metrics`, `ToolRegistry`, `SkillRegistry`, `Persistence`.
