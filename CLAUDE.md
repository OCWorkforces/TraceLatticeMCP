# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that provides sequential thinking capabilities with tool and skill recommendations for AI assistants. It features a modular architecture with dependency injection, persistence, multi-transport support, and optional multi-user scaling.

The server supports stdio (single-user), SSE (multi-user), and HTTP transports, uses the `tmcp` framework with Valibot for schema validation, and includes comprehensive test coverage.

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
    ├── errors.ts             # Custom error classes
    ├── ServerConfig.ts       # Server configuration
    ├── IHistoryManager.ts    # History manager interface
    ├── HistoryManager.ts     # History and branch management
    ├── di/                   # Dependency injection
    │   └── Container.ts      # DI container implementation
    ├── cache/                # Discovery cache
    │   └── DiscoveryCache.ts # LRU cache with TTL
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
    │   ├── SseTransport.ts   # Server-Sent Events transport
    │   └── HttpTransport.ts  # HTTP request-response transport
    ├── cluster/              # Multi-process architecture
    │   ├── WorkerManager.ts
    │   └── worker.ts
    ├── pool/                 # Connection pooling
    │   └── ConnectionPool.ts
    ├── registry/             # Tool and skill registries
    │   ├── ToolRegistry.ts
    │   └── SkillRegistry.ts
    ├── watchers/             # File system watchers
    │   ├── SkillWatcher.ts   # Skill file watcher
    │   └── ToolWatcher.ts    # Tool file watcher
    ├── processor/            # Thought processing
    │   ├── ThoughtProcessor.ts
    │   └── InputNormalizer.ts # Input normalization
    ├── formatter/            # Response formatting
    │   └── ThoughtFormatter.ts
    ├── metrics/              # Metrics and observability
    │   └── Metrics.impl.ts   # Prometheus-compatible metrics
    ├── telemetry/            # OpenTelemetry integration
    │   └── INTEGRATION.md    # Telemetry integration guide
    └── __tests__/            # Test files
```

## Architecture

### Core Design Principles

1. **Dependency Injection**: All components are managed through a DI container for testability
2. **Manager Properties**: Direct access via `server.history`, `server.tools`, `server.skills`, `server.config`
3. **Async-First**: Skill discovery and server creation are async operations
4. **Transport Flexibility**: Supports stdio (default), SSE, and HTTP transports
5. **Persistence**: Optional state persistence with multiple backends

### Recommended API Usage

```typescript
// Create server (recommended way with async initialization)
const server = await ToolAwareSequentialThinkingServer.create({
	autoDiscover: true,
	loadFromPersistence: true,
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

- **`HttpTransport`** (src/transport/HttpTransport.ts): HTTP request-response transport
  - Stateless REST-like API
  - Configurable endpoint path
  - Rate limiting and body size limits

- **`WorkerManager`** (src/cluster/WorkerManager.ts): Multi-process architecture
  - Worker pool for parallel processing
  - Health monitoring and auto-restart

- **`ConnectionPool`** (src/pool/ConnectionPool.ts): Session management
  - Isolated sessions per user
  - Session timeout and cleanup

- **`Metrics`** (src/metrics/Metrics.impl.ts): Prometheus-compatible metrics collection
  - Supports counters, gauges, and histograms
  - Exports in Prometheus text format
  - Thread-safe with label support

### Telemetry

The server supports optional OpenTelemetry integration for distributed tracing:

```typescript
const server = await ToolAwareSequentialThinkingServer.create({
	enableTelemetry: true,
	telemetryOptions: {
		serviceName: 'trace-lattice',
		exporterType: 'jaeger', // 'otlp', 'zipkin', 'stdout', or 'none'
		samplingRatio: 0.1,
	},
});
```

**Key Features:**

- Trace span creation for request processing
- Automatic span attributes (thought number, tool usage, etc.)
- Multiple exporter support (Jaeger, OTLP, Zipkin, stdout)
- Performance-aware with configurable sampling

### Data Flow

1. Server created via `ToolAwareSequentialThinkingServer.create()`
2. DI container initialized with all dependencies
3. History loaded from persistence (if enabled)
4. Skills discovered asynchronously (if enabled)
5. LLM calls `sequentialthinking_tools` with thought data
6. ThoughtProcessor validates and processes the thought
7. Response formatted with tool/skill recommendations
8. Result returned via configured transport (stdio, SSE, or HTTP)

## Error Handling

The server uses a hierarchical error system for programmatic error handling.

### Error Class Hierarchy

```
SequentialThinkingError (base)
├── ToolNotFoundError
├── SkillNotFoundError
├── InvalidThoughtError
├── SkillDiscoveryError
└── HistoryLimitExceededError
```

### Error Types

| Error Class                 | Code                     | When Thrown                   | Properties     |
| --------------------------- | ------------------------ | ----------------------------- | -------------- |
| `SequentialThinkingError`   | (varies)                 | Base class for all errors     | `code: string` |
| `ToolNotFoundError`         | `TOOL_NOT_FOUND`         | Requested tool doesn't exist  | -              |
| `SkillNotFoundError`        | `SKILL_NOT_FOUND`        | Requested skill doesn't exist | -              |
| `InvalidThoughtError`       | `INVALID_THOUGHT`        | Thought validation fails      | -              |
| `SkillDiscoveryError`       | `SKILL_DISCOVERY_FAILED` | Skill discovery fails         | `cause: Error` |
| `HistoryLimitExceededError` | `HISTORY_LIMIT_EXCEEDED` | History size exceeds limit    | -              |

### Error Handling Example

```typescript
import { SequentialThinkingError, ToolNotFoundError, SkillDiscoveryError } from './errors.js';

try {
	await server.processThought(thought);
} catch (error) {
	if (error instanceof SequentialThinkingError) {
		console.error(`Error [${error.code}]: ${error.message}`);

		// Handle specific error types
		if (error instanceof ToolNotFoundError) {
			// Tool not found - register it or use alternative
		} else if (error instanceof SkillDiscoveryError) {
			// Discovery failed - check directory or permissions
			console.error('Caused by:', error.cause);
		}
	}
}
```

## Factory Functions

The server provides several factory functions for convenient component creation.

### DI Container Factory

```typescript
import { createDefaultContainer } from './di/index.js';

const container = createDefaultContainer({
	logger: myLogger,
	config: myConfig,
});
// Pre-configured with Logger, Config, HistoryManager, etc.
```

### Persistence Backend Factory

```typescript
import { createPersistenceBackend } from './persistence/index.js';

const backend = await createPersistenceBackend({
	enabled: true,
	backend: 'sqlite', // 'file', 'sqlite', or 'memory'
	options: {
		dbPath: './data/thoughts.db',
	},
});
```

### Worker Manager Factory

```typescript
import { createWorkerManager } from './cluster/index.js';

const manager = createWorkerManager({
	maxWorkers: 4,
	restartThreshold: 3,
});
```

### Connection Pool Factory

```typescript
import { createConnectionPool } from './pool/index.js';

const pool = createConnectionPool({
	maxSessions: 100,
	sessionTimeout: 1800000, // 30 minutes
});
```

### SSE Transport Factory

```typescript
import { createSseTransport } from './transport/index.js';

const transport = createSseTransport({
	port: 9108,
	host: 'localhost',
	corsOrigin: '*',
});
```

### HTTP Transport Factory

```typescript
import { createHttpTransport } from './transport/index.js';

const transport = createHttpTransport({
	port: 9108,
	host: 'localhost',
	path: '/mcp',
});
```

## File Watchers

The server includes file system watchers for dynamic tool and skill discovery.

### SkillWatcher

Monitors skill directories for changes and automatically updates the registry.

**Watched Directories:**

- `.claude/skills/` (project-local)
- `~/.claude/skills/` (user-global)

**Watched Events:**
| Event | Behavior |
|-------|----------|
| `add` | Triggers full skill re-discovery |
| `change` | Triggers full skill re-discovery |
| `unlink` | Removes specific skill from registry |

**File Types:** `.md`, `.yml`, `.yaml`

### ToolWatcher

Monitors tool directories for changes and automatically updates the registry.

**Watched Directories:**

- `.claude/tools/` (project-local)
- `~/.claude/tools/` (user-global)

**Watched Events:**
| Event | Behavior |
|-------|----------|
| `add` | Triggers tool rediscovery (`.tool.md` files only) |
| `unlink` | Removes tool from registry |

**File Types:** `.tool.md` only

### Enabling Watchers

```typescript
const server = await ToolAwareSequentialThinkingServer.create({
	enableWatcher: true, // Enable both SkillWatcher and ToolWatcher (default: true)
});
```

Watchers are most useful during development. Consider disabling in production for better performance.

## Input Normalization

The server includes automatic input normalization to handle common LLM field name mistakes.

### Normalization Rules

| Singular (Wrong)    | Plural (Correct)     | Applied To                       |
| ------------------- | -------------------- | -------------------------------- |
| `recommended_tool`  | `recommended_tools`  | `current_step`, `previous_steps` |
| `recommended_skill` | `recommended_skills` | `current_step`, `previous_steps` |

### How It Works

1. Normalization happens **before** Valibot schema validation
2. Allows strict schema validation while being tolerant of LLM mistakes
3. Only transforms if plural field doesn't already exist
4. Handles both `current_step` and all items in `previous_steps`

### Example

```typescript
// LLM might generate this (with singular field names)
const input = {
	thought: 'I need to search the codebase',
	thought_number: 1,
	total_thoughts: 3,
	next_thought_needed: true,
	current_step: {
		step_description: 'Search for files',
		recommended_tool: [
			{
				// Singular (wrong)
				tool_name: 'Grep',
				confidence: 0.9,
				rationale: 'Best for code search',
				priority: 1,
			},
		],
		expected_outcome: 'List of matching files',
	},
};

// InputNormalizer automatically transforms to:
// current_step.recommended_tools (plural form)
```

## Configuration

### Environment Variables

All environment variables override file-based configuration:

| Variable                   | Description                                | Default                           |
| -------------------------- | ------------------------------------------ | --------------------------------- |
| `MAX_HISTORY_SIZE`         | Max thoughts in history                    | 1000                              |
| `MAX_BRANCHES`             | Max number of branches                     | 50                                |
| `MAX_BRANCH_SIZE`          | Max size of each branch                    | 100                               |
| `LOG_LEVEL`                | Logging level (debug/info/warn/error)      | info                              |
| `PRETTY_LOG`               | Enable pretty logging                      | true                              |
| `SKILL_DIRS`               | Colon-separated skill directories          | `.claude/skills:~/.claude/skills` |
| `DISCOVERY_CACHE_TTL`      | Discovery cache TTL (milliseconds)         | 300000                            |
| `DISCOVERY_CACHE_MAX_SIZE` | Discovery cache max entries                | 100                               |
| `TRANSPORT_TYPE`           | Transport type (`stdio`, `sse`, or `http`) | stdio                             |
| `SSE_PORT` / `HTTP_PORT`   | Transport port                             | 9108                              |
| `SSE_HOST` / `HTTP_HOST`   | Transport host                             | 127.0.0.1                         |
| `HTTP_PATH`                | HTTP endpoint path                         | /mcp                              |
| `CORS_ORIGIN`              | CORS origin                                | \*                                |
| `ENABLE_CORS`              | Enable CORS                                | true                              |
| `ENABLE_RATE_LIMIT`        | Enable rate limiting                       | true                              |
| `MAX_REQUESTS_PER_MINUTE`  | Rate limit threshold                       | 100                               |

### Server Configuration Options

```typescript
const server = await ToolAwareSequentialThinkingServer.create({
	// History limits
	maxHistorySize: 500, // Max thoughts in history (default: 1000)
	maxBranches: 50, // Max number of branches (default: 50)
	maxBranchSize: 100, // Max size of each branch (default: 100)

	// Skill discovery
	autoDiscover: true, // Auto-discover skills on startup (default: true)
	lazyDiscovery: false, // Defer discovery until first access (default: false)
	enableWatcher: true, // Enable file watchers for skills/tools (default: true)

	// Persistence
	loadFromPersistence: true, // Load history from persistence (default: true)

	// Transport
	transport: 'stdio', // 'stdio', 'sse', or 'http' (default: 'stdio')

	// Logger
	logger: customLogger, // Optional custom logger instance
});

// Access configuration
console.log(server.config.maxHistorySize);
console.log(server.config.discoveryCache.ttl);
```

### Discovery Cache Configuration

Controls caching of skill/tool discovery results to reduce filesystem operations:

```typescript
const server = await ToolAwareSequentialThinkingServer.create({
	config: {
		discoveryCache: {
			ttl: 300000, // Cache TTL in milliseconds (default: 5 minutes)
			maxSize: 100, // Max cache entries (default: 100)
		},
	},
});
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
			backend: 'file', // or 'sqlite', 'memory'
			options: {
				dataDir: './data',
				maxHistorySize: 10000,
			},
		},
	},
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
- `http-transport.test.ts` - HTTP transport tests (27 tests)
- `worker-manager.test.ts` - Worker pool tests (33 tests)
- `connection-pool.test.ts` - Connection pool tests (39 tests)
- `sequentialthinking-tools.test.ts` - MCP tool comprehensive tests (35 tests)
- Plus other integration and unit tests

Total: 380+ tests passing

## Transport Options

### Stdio (default, single-user)

```bash
npm start
```

### SSE (multi-user)

```bash
TRANSPORT_TYPE=sse SSE_PORT=9108 npm start
```

### HTTP (multi-user, request-response)

```bash
TRANSPORT_TYPE=http HTTP_PORT=9108 npm start
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
