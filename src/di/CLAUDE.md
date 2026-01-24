# CLAUDE.md

This directory contains the dependency injection (DI) container implementation.

## Files

- `Container.ts` - DI container for managing dependencies
- `index.ts` - Module exports

## Container

The `Container` class provides a lightweight dependency injection system for managing service dependencies and enabling testability.

### Registration Types

1. **Instance Registration** - Singletons (same instance always returned)
2. **Factory Registration** - Lazy instantiation with caching
3. **Transient Factory** - New instance each time

### Usage

```typescript
import { Container, createDefaultContainer } from './di/index.js';
import type { CreateContainerOptions } from './di/index.js';

// Direct instantiation
const container = new Container();

// Register a singleton instance
container.registerInstance('Logger', logger);

// Register a factory (lazy, cached)
container.register('HistoryManager', () => {
  const logger = container.resolve('Logger');
  return new HistoryManager({ logger });
});

// Register a transient factory (new instance each time)
container.registerFactory('ThoughtFormatter', () => new ThoughtFormatter());

// Resolve dependencies
const history = container.resolve<HistoryManager>('HistoryManager');
```

### Factory Function

The `createDefaultContainer()` function creates a container with optional custom services:

```typescript
import { createDefaultContainer } from './di/index.js';
import type { CreateContainerOptions } from './di/index.js';

const options: CreateContainerOptions = {
    logger: customLogger,
    config: customConfig,
    fileConfig: { /* ... */ }
};

const container = createDefaultContainer(options);
// Pre-configured with custom logger and config if provided
```

## Registered Services

The following services are registered in the DI container:

| Service Key | Type | Description |
|-------------|------|-------------|
| `Logger` | Instance | Structured logger |
| `Config` | Instance | Server configuration |
| `FileConfig` | Instance | File-based config |
| `Persistence` | Instance | Persistence backend (may be null) |
| `HistoryManager` | Factory | History and branch management |
| `ThoughtFormatter` | Factory | Response formatting |
| `ThoughtProcessor` | Factory | Thought processing logic |
| `ToolRegistry` | Factory | Tool registry |
| `SkillRegistry` | Factory | Skill registry |
| `DiscoveryCache` | Instance | Discovery cache |

## Benefits

- **Testability**: Easy to mock dependencies in tests
- **Decoupling**: Components don't need to know how to create their dependencies
- **Lazy Loading**: Factories only create instances when needed
- **Single Source of Truth**: All dependency wiring in one place
