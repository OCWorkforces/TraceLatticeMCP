# CLUSTER MODULE

**Generated:** 2026-01-26
**Parent:** ../AGENTS.md

## OVERVIEW

Multi-process architecture for parallel thought processing using a worker pool.

## STRUCTURE

```
src/cluster/
├── WorkerManager.ts  # Pool manager (health checks, restarts)
├── worker.ts         # Worker process entry point
└── index.ts          # Exports
```

## USAGE

```typescript
const manager = new WorkerManager({
	maxWorkers: 4,
	restartThreshold: 3,
});
const result = await manager.process(thought);
```

## ARCHITECTURE

Master -> WorkerManager -> [Worker 1, Worker 2...]

- **Health Check**: Auto-restarts failed workers.
- **Protocol**: Message passing via `WorkerMessage` / `WorkerResponse`.
