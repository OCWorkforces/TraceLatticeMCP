# CLAUDE.md

This directory contains persistence backends for storing thought history and state.

## Files

- `PersistenceBackend.ts` - Abstract base class for persistence implementations
- `FilePersistence.ts` - File-based persistence backend
- `SqlitePersistence.ts` - SQLite-based persistence backend
- `MemoryPersistence.ts` - In-memory persistence backend
- `index.ts` - Module exports and factory function

## Persistence Architecture

All persistence backends implement the `PersistenceBackend` interface:

```typescript
interface PersistenceBackend {
  // Save a single thought
  saveThought(thought: ThoughtData): Promise<void>;

  // Save branch data
  saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void>;

  // Load all thoughts from history
  loadHistory(): Promise<ThoughtData[]>;

  // Clear all persisted data
  clear(): Promise<void>;

  // Health check
  healthy(): Promise<boolean>;
}
```

## Available Backends

### MemoryPersistence (default)

- In-memory storage (no persistence across restarts)
- Fastest option
- Used as fallback when no backend is configured

### FilePersistence

- JSON file storage
- Data stored in configured `dataDir`
- Human-readable format
- Good for development and debugging

### SqlitePersistence

- SQLite database storage
- Best for production use
- Efficient for large datasets
- Supports concurrent access
- WAL (Write-Ahead Logging) mode for improved performance

## Configuration

### Via Environment Variables

```bash
# Disable persistence
PERSISTENCE_ENABLED=false

# File backend
PERSISTENCE_BACKEND=file
PERSISTENCE_DATA_DIR=./data

# SQLite backend
PERSISTENCE_BACKEND=sqlite
PERSISTENCE_DB_PATH=./data/thoughts.db
PERSISTENCE_ENABLE_WAL=true
```

### Via Config File

```yaml
persistence:
  enabled: true
  backend: file  # or sqlite, memory
  options:
    dataDir: ./data
    dbPath: ./data/thoughts.db  # For sqlite backend
    enableWAL: true  # Enable WAL mode for sqlite
```

## Usage

```typescript
import { createPersistenceBackend } from './persistence/PersistenceBackend.js';

const backend = await createPersistenceBackend({
  enabled: true,
  backend: 'sqlite',
  options: {
    dbPath: './data/thoughts.db'
  }
});

// Save thought
await backend.saveThought(thought);

// Load history
const history = await backend.loadHistory();

// Clear data
await backend.clear();
```

## Async Behavior

All persistence operations are **fire-and-forget** by design:
- Operations are not awaited in the main processing flow
- Failures are logged but don't affect the main operation
- This ensures persistence issues don't block the sequential thinking process

```typescript
// Example from HistoryManager
this.persistence?.saveThought(thought);  // Not awaited
```

## Health Checks

The `healthy()` method checks if the persistence backend is operational:

```typescript
const isHealthy = await backend.healthy();
if (!isHealthy) {
    console.warn('Persistence backend is unhealthy');
}
```

**Health checks are performed:**
- Before loading from persistence on server startup
- Automatically in the HistoryManager when loading from persistence

## Auto-Trimming

When loading data from persistence, thoughts are automatically trimmed to configured limits:

| Limit | Default | Description |
|-------|---------|-------------|
| `maxHistorySize` | 1000 | Maximum thoughts in main history |
| `maxBranches` | 50 | Maximum number of branches |
| `maxBranchSize` | 100 | Maximum thoughts per branch |

**Eviction Strategy:** FIFO (First-In-First-Out) - oldest thoughts/branches are removed first

## Thread Safety

The persistence implementation is **not thread-safe** and assumes single-threaded execution. For concurrent access scenarios, use the SQLite backend which supports concurrent reads.
