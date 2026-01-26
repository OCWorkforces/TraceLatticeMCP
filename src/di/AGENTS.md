# DEPENDENCY INJECTION MODULE

**Generated:** 2026-01-26
**Parent:** ../AGENTS.md

## OVERVIEW

Lightweight DI container for managing service dependencies and testability.

## USAGE

```typescript
// Register
container.registerInstance('Logger', logger);
container.register('HistoryManager', () => new HistoryManager({...})); // Factory
container.registerFactory('Formatter', () => new Formatter()); // Transient

// Resolve
const history = container.resolve<HistoryManager>('HistoryManager');
```

## LIFECYCLE

1. **Singleton**: Created once, cached forever (Instance/Register).
2. **Transient**: Created every time (registerFactory).
3. **Lazy**: Factories executed only on first resolve.

## KEY PATTERNS

- **Central Config**: `src/index.ts` creates the container.
- **Testability**: Easy mocking by swapping container registrations.
