# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that provides sequential thinking capabilities with tool and skill recommendations for AI assistants. It features a modular architecture with dependency injection, persistence, multi-transport support, and optional multi-user scaling.

The server supports both stdio (single-user) and SSE (multi-user) transports, uses the `tmcp` framework with Valibot for schema validation, and includes comprehensive test coverage.

## Commands

```bash
# Build the project
npm run build

# Start the server
npm run start

# Development mode with MCP inspector
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Type checking
npm run type-check
```

## Project Structure

```
./
├── package.json         # Dependencies and npm scripts
├── tsconfig.json        # TypeScript config (extends @tsconfig/node24)
├── vitest.config.ts     # Vitest test configuration
├── CLAUDE.md            # This file
├── LICENSE              # MIT License
├── README.md            # Project documentation
└── src/                 # Source code
    ├── index.ts              # Main server entry point
    ├── schema.ts             # Valibot validation schemas
    ├── types.ts              # TypeScript interfaces
    ├── di/                   # Dependency injection
    │   └── Container.ts      # DI container implementation
    ├── config/               # Configuration
    │   └── ConfigLoader.ts   # File-based config loading
    ├── logger/               # Logging
    │   └── StructuredLogger.ts
    ├── persistence/          # State persistence
    │   ├── PersistenceBackend.ts
    │   ├── FilePersistence.ts
    │   ├── SqlitePersistence.ts
    │   └── MemoryPersistence.ts
    ├── transport/            # MCP transports
    │   └── SseTransport.ts    # Server-Sent Events transport
    ├── cluster/              # Multi-process architecture
    │   ├── WorkerManager.ts
    │   └── worker.ts
    ├── pool/                 # Connection pooling
    │   └── ConnectionPool.ts
    ├── registry/             # Tool and skill registries
    │   ├── ToolRegistry.ts
    │   └── SkillRegistry.ts
    ├── processor/            # Thought processing
    │   └── ThoughtProcessor.ts
    ├── formatter/            # Response formatting
    │   └── ThoughtFormatter.ts
    ├── HistoryManager.ts     # History and branch management
    ├── ServerConfig.ts       # Server configuration
    ├── SkillWatcher.ts      # File watcher for skills
    ├── ToolWatcher.ts       # File watcher for tools
    └── __tests__/            # Test files
```

## Architecture

### Core Design Principles

1. **Dependency Injection**: All components are managed through a DI container for testability
2. **Manager Properties**: Direct access via `server.history`, `server.tools`, `server.skills`, `server.config`
3. **Async-First**: Skill discovery and server creation are async operations
4. **Transport Flexibility**: Supports stdio (default) and SSE transports
5. **Persistence**: Optional state persistence with multiple backends

### Recommended API Usage

```typescript
// Create server (recommended way with async initialization)
const server = await ToolAwareSequentialThinkingServer.create({
    autoDiscover: true,
    loadFromPersistence: true
});

// Access managers directly (recommended)
server.history.getHistory();
server.tools.addTool(tool);
server.skills.discoverAsync();
server.config.maxHistorySize;
```

### Core Components

- **`ToolAwareSequentialThinkingServer`** (src/index.ts): Main server class
  - Exposes managers as public properties: `history`, `tools`, `skills`, `config`
  - Factory method `create()` for async initialization
  - Deprecated delegation methods still work but emit warnings

- **`Container`** (src/di/Container.ts): Dependency injection container
  - Supports instance registration (singletons)
  - Supports factory registration (lazy instantiation with caching)
  - Supports transient factory registration (new instance each time)

- **`HistoryManager`** (src/HistoryManager.ts): Manages thought history and branches
  - `getHistory()`, `clear()`, `getBranches()`, tools/skills registries
  - Optional persistence backend integration

- **`ToolRegistry`** / **`SkillRegistry`** (src/registry/): Tool and skill management
  - CRUD operations for tools and skills
  - Async discovery methods
  - Environment variable overrides

- **`SseTransport`** (src/transport/SseTransport.ts): Server-Sent Events transport
  - Multi-user support over HTTP
  - CORS support
  - Health check endpoint

- **`WorkerManager`** (src/cluster/WorkerManager.ts): Multi-process architecture
  - Worker pool for parallel processing
  - Health monitoring and auto-restart

- **`ConnectionPool`** (src/pool/ConnectionPool.ts): Session management
  - Isolated sessions per user
  - Session timeout and cleanup

### Data Flow

1. Server created via `ToolAwareSequentialThinkingServer.create()`
2. DI container initialized with all dependencies
3. History loaded from persistence (if enabled)
4. Skills discovered asynchronously (if enabled)
5. LLM calls `sequentialthinking_tools` with thought data
6. ThoughtProcessor validates and processes the thought
7. Response formatted with tool/skill recommendations
8. Result returned via configured transport (stdio or SSE)

## Configuration

### Environment Variables

All environment variables override file-based configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_HISTORY_SIZE` | Max thoughts in history | 1000 |
| `MAX_BRANCHES` | Max number of branches | 100 |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | info |
| `PRETTY_LOG` | Enable pretty logging | true |
| `SKILL_DIRS` | Colon-separated skill directories | `.claude/skills:~/.claude/skills` |
| `DISCOVERY_CACHE_TTL` | Discovery cache TTL (seconds) | 300 |
| `DISCOVERY_CACHE_MAX_SIZE` | Discovery cache max entries | 100 |
| `TRANSPORT_TYPE` | Transport type (`stdio` or `sse`) | stdio |
| `SSE_PORT` | SSE transport port | 3000 |
| `SSE_HOST` | SSE transport host | localhost |
| `CORS_ORIGIN` | CORS origin for SSE | * |

### Server Configuration

```typescript
const server = await ToolAwareSequentialThinkingServer.create({
    maxHistorySize: 500,
    maxBranches: 50,
    autoDiscover: false,
    lazyDiscovery: true,
    loadFromPersistence: false
});

// Access configuration
console.log(server.config.maxHistorySize);
```

## Persistence

The server supports optional persistence with multiple backends:

```typescript
// Via environment variable or config file
const server = await ToolAwareSequentialThinkingServer.create({
    // Persistence is loaded from config by default
});

// Or configure in code
const server = new ToolAwareSequentialThinkingServer({
    config: {
        persistence: {
            enabled: true,
            backend: 'file',  // or 'sqlite', 'memory'
            options: {
                dataDir: './data',
                maxHistorySize: 10000
            }
        }
    }
});
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Run a specific test file
npm test -- src/__tests__/integration.test.ts

# Run tests matching a pattern
npm test -- --grep "container"
```

Test files are located in `src/__tests__/`:
- `container.test.ts` - DI container tests (48 tests)
- `persistence.test.ts` - Persistence backend tests (42 tests)
- `sse-transport.test.ts` - SSE transport tests (33 tests, 1 skipped)
- `worker-manager.test.ts` - Worker pool tests (33 tests)
- `connection-pool.test.ts` - Connection pool tests (39 tests)
- `sequentialthinking-tools.test.ts` - MCP tool comprehensive tests (35 tests)
- Plus other integration and unit tests

Total: 287+ tests passing

## Transport Options

### Stdio (default, single-user)

```bash
npm start
```

### SSE (multi-user)

```bash
TRANSPORT_TYPE=sse SSE_PORT=3000 npm start
```

## Dependencies

- `tmcp`: MCP server framework
- `@tmcp/adapter-valibot`: Valibot schema adapter
- `@tmcp/transport-stdio`: Stdio transport
- `valibot`: Schema validation
- `chalk`: Terminal styling
- `chokidar`: File watching
- `yaml`: Config file parsing
- `vitest`: Testing framework
