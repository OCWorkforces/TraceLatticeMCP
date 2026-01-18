/**
 * Worker management exports for parallel processing.
 *
 * This module re-exports the `WorkerManager` class and related types
 * for convenient importing.
 *
 * @example
 * ```typescript
 * import { WorkerManager, createWorkerManager } from './cluster/index.js';
 * import type { WorkerManagerOptions, WorkerMessage, WorkerResponse } from './cluster/index.js';
 *
 * const manager = createWorkerManager({ maxWorkers: 4 });
 * const result = await manager.process(thought);
 * await manager.shutdown();
 * ```
 * @module cluster
 */

export { WorkerManager, createWorkerManager } from './WorkerManager.js';
export type { WorkerManagerOptions, WorkerMessage, WorkerResponse } from './WorkerManager.js';
