# CLAUDE.md

This directory contains persistence backends for storing thought history and state.

## Files

- `PersistenceBackend.ts` - Abstract base class for persistence implementations
- `FilePersistence.ts` - File-based persistence backend
- `SqlitePersistence.ts` - SQLite-based persistence backend
- `MemoryPersistence.ts` - In-memory persistence backend

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
```

### Via Config File

```yaml
persistence:
  enabled: true
  backend: file  # or sqlite, memory
  options:
    dataDir: ./data
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
