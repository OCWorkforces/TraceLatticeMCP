# CLUSTER MODULE

**Updated:** 2026-03-31
**Commit:** 509ece3

## OVERVIEW

Multi-process architecture for parallel thought processing using a worker pool.

## STRUCTURE

```
src/cluster/
├── WorkerManager.ts  # Pool manager (health checks, restarts) (439L)
└── worker.ts         # Worker process entry point
```

## USAGE

```typescript
const manager = new WorkerManager({ maxWorkers: 4, restartThreshold: 3 });
const result = await manager.process(thought);
```

## ARCHITECTURE

Master → WorkerManager → [Worker 1, Worker 2...]
- **Health Check**: Auto-restarts failed workers.
- **Protocol**: Message passing via `WorkerMessage` / `WorkerResponse`.
