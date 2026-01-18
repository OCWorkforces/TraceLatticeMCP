# CLAUDE.md

This directory contains multi-process architecture components for parallel processing and worker management.

## Files

- `WorkerManager.ts` - Worker pool management for parallel processing
- `worker.ts` - Worker process implementation

## WorkerManager

The `WorkerManager` class manages a pool of worker processes for parallel processing of sequential thinking requests.

### Configuration

```typescript
interface WorkerManagerOptions {
  maxWorkers?: number;     // Maximum number of workers (default: CPU count)
  restartThreshold?: number; // Max restarts before giving up (default: 3)
  restartDelay?: number;   // Delay between restarts in ms (default: 1000)
}
```

### Usage

```typescript
import { WorkerManager } from './cluster/WorkerManager.js';

const manager = new WorkerManager({ maxWorkers: 4 });

// Process thought in worker pool
const result = await manager.process(thought);

// Shutdown
await manager.shutdown();
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
