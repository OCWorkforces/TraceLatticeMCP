# CLAUDE.md

This directory contains multi-process architecture components for parallel processing and worker management.

## Files

- `WorkerManager.ts` - Worker pool management for parallel processing
- `worker.ts` - Worker process implementation
- `index.ts` - Module exports and factory function

## WorkerManager

The `WorkerManager` class manages a pool of worker processes for parallel processing of sequential thinking requests.

### Configuration

```typescript
interface WorkerManagerOptions {
  maxWorkers?: number;        // Maximum number of workers (default: CPU count)
  restartThreshold?: number;  // Max restarts before giving up (default: 3)
  restartDelay?: number;      // Delay between restarts in ms (default: 1000)
  workerTimeout?: number;     // Worker timeout in ms (default: 30000)
  healthCheckInterval?: number; // Health check interval in ms (default: 60000)
}
```

### Usage

```typescript
import { WorkerManager, createWorkerManager } from './cluster/index.js';

// Direct instantiation
const manager = new WorkerManager({ maxWorkers: 4 });

// Using factory function
const manager2 = createWorkerManager({
    maxWorkers: 4,
    restartThreshold: 3
});

// Process thought in worker pool
const result = await manager.process(thought);

// Shutdown
await manager.shutdown();
```

### WorkerManagerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxWorkers` | number | CPU count | Maximum number of worker processes |
| `restartThreshold` | number | 3 | Max restarts before giving up |
| `restartDelay` | number | 1000 | Delay between restarts (ms) |
| `workerTimeout` | number | 30000 | Worker timeout (ms) |
| `healthCheckInterval` | number | 60000 | Health check interval (ms) |

### Worker Message Types

```typescript
interface WorkerMessage {
    type: 'process';
    thought: ThoughtData;
}

interface WorkerResponse {
    success: boolean;
    result?: unknown;
    error?: string;
}
```

## Architecture

```
┌─────────────────┐
│  WorkerManager  │
│                 │
│  ┌───────────┐  │
│  │  Worker 1 │  │
│  ├───────────┤  │
│  │  Worker 2 │  │
│  ├───────────┤  │
│  │  Worker N │  │
│  └───────────┘  │
└─────────────────┘
```

## Features

- **Worker Pool**: Maintains a pool of worker processes
- **Health Monitoring**: Tracks worker health and auto-restarts failed workers
- **Load Balancing**: Distributes work across available workers
- **Graceful Shutdown**: Properly terminates all workers on shutdown
