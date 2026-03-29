/**
 * Multi-process Architecture for parallel thought processing.
 *
 * This module provides a WorkerManager that uses Node.js worker threads
 * to distribute thought processing across multiple CPU cores, enabling
 * horizontal scaling and improved performance.
 *
 * @example
 * ```typescript
 * const manager = new WorkerManager({
 *   maxWorkers: 4,
 *   workerScript: './dist/worker.js'
 * });
 * await manager.start();
 *
 * const result = await manager.processThought({ thought: 'test', thought_number: 1, total_thoughts: 1 });
 * ```
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import type { ThoughtData } from '../core/thought.js';
import type { IDisposable } from '../types/disposable.js';
import type { Logger } from '../logger/StructuredLogger.js';

export interface WorkerManagerOptions {
	/**
	 * Maximum number of worker processes to spawn
	 * @default Number of CPU cores
	 */
	maxWorkers?: number;

	/**
	 * Path to the worker script
	 * @default './dist/worker.js'
	 */
	workerScript?: string;

	/**
	 * Timeout for worker responses in milliseconds
	 * @default 30000 (30 seconds)
	 */
	workerTimeout?: number;

	/**
	 * Enable worker health monitoring and auto-restart
	 * @default true
	 */
	enableHealthCheck?: boolean;

	/**
	 * Health check interval in milliseconds
	 * @default 60000 (1 minute)
	 */
	healthCheckInterval?: number;

	/**
	 * Maximum number of retries for a failed worker
	 * @default 3
	 */
	maxRetries?: number;

	/**
	 * Logger instance
	 */
	logger?: Logger;
}

export interface WorkerMessage {
	type: 'process-thought' | 'health-check' | 'terminate';
	requestId?: string;
	input?: unknown;
}

export interface WorkerResponse {
	type: 'result' | 'error' | 'health';
	requestId?: string;
	result?: unknown;
	error?: string;
}

/**
 * WorkerManager manages a pool of worker processes for parallel thought processing.
 *
 * Each worker runs in a separate process and can process thoughts independently.
 * The manager distributes incoming requests across available workers.
 */
export class WorkerManager implements IDisposable {
	private _workers: Map<number, Worker> = new Map();
	private _nextWorkerId = 0;
	private _maxWorkers: number;
	private _workerScript: string;
	private _workerTimeout: number;
	private _enableHealthCheck: boolean;
	private _healthCheckInterval: number;
	private _maxRetries: number;
	private _activeRequests: Map<string, (result: unknown) => void> = new Map();
	private _workerRetryCount: Map<number, number> = new Map();
	private _healthCheckTimer: NodeJS.Timeout | null = null;
	private _nextWorkerIndex = 0;

	private _terminated = false;
	private _logger: Logger;

	constructor(options: WorkerManagerOptions = {}) {
		this._maxWorkers = options.maxWorkers ?? cpus().length;
		this._workerScript =
			options.workerScript ?? join(dirname(fileURLToPath(import.meta.url)), 'worker.js');
		this._workerTimeout = options.workerTimeout ?? 30000;
		this._enableHealthCheck = options.enableHealthCheck ?? true;
		this._healthCheckInterval = options.healthCheckInterval ?? 60000;
		this._maxRetries = options.maxRetries ?? 3;
		this._logger = options.logger ?? this._createNoopLogger();
	}

	/**
	 * Create a no-op logger when none is provided.
	 */
	private _createNoopLogger(): Logger {
		return {
			info: () => {},
			warn: () => {},
			error: () => {},
			debug: () => {},
			setLevel: () => {},
			getLevel: () => 'info',
		};
	}

	/**
	 * Start the worker manager and spawn all worker processes.
	 */
	async start(): Promise<void> {
		if (this._terminated) {
			throw new Error('WorkerManager has been terminated');
		}

		// Verify worker script exists
		if (!existsSync(this._workerScript)) {
			throw new Error(`Worker script not found: ${this._workerScript}`);
		}

		// Spawn workers
		for (let i = 0; i < this._maxWorkers; i++) {
			await this._spawnWorker();
		}

		// Start health check if enabled
		if (this._enableHealthCheck) {
			this._startHealthCheck();
		}

		this._logger.info(`WorkerManager started with ${this._workers.size} workers`);
	}

	/**
	 * Spawn a single worker process.
	 */
	private async _spawnWorker(reuseId?: number): Promise<void> {
		const workerId = reuseId !== undefined ? reuseId : this._nextWorkerId++;
		const worker = new Worker(this._workerScript, {
			resourceLimits: {
				maxOldGenerationSizeMb: 100, // Limit memory usage
			},
		});

		worker.on('online', () => {
			this._logger.info(`Worker ${workerId} is online`);
			this._workerRetryCount.delete(workerId);
		});

		worker.on('message', (message: WorkerResponse) => {
			this._handleWorkerMessage(workerId, message);
		});

		worker.on('error', () => {
			this._logger.error(`Worker ${workerId} error`);
			this._handleWorkerError(workerId);
		});

		worker.on('exit', (code) => {
			this._logger.info(`Worker ${workerId} exited with code ${code}`);
			this._handleWorkerExit(workerId, code);
		});

		this._workers.set(workerId, worker);
	}

	/**
	 * Handle incoming messages from workers.
	 */
	private _handleWorkerMessage(workerId: number, message: WorkerResponse): void {
		if (message.type === 'result' && message.requestId) {
			const callback = this._activeRequests.get(message.requestId);
			if (callback) {
				callback(message.result);
				this._activeRequests.delete(message.requestId);
			}
		} else if (message.type === 'error' && message.requestId) {
			const callback = this._activeRequests.get(message.requestId);
			if (callback) {
				callback(new Error(message.error || 'Unknown error'));
				this._activeRequests.delete(message.requestId);
			}
		} else if (message.type === 'health') {
			// Health check response - worker is alive
			this._workerRetryCount.delete(workerId);
		}
	}

	/**
	 * Handle worker errors.
	 */
	private _handleWorkerError(workerId: number): void {
		const retryCount = this._workerRetryCount.get(workerId) || 0;

		if (retryCount < this._maxRetries) {
			this._workerRetryCount.set(workerId, retryCount + 1);
			this._logger.info(
				`Restarting worker ${workerId} (attempt ${retryCount + 1}/${this._maxRetries})`
			);

			// Remove failed worker
			const worker = this._workers.get(workerId);
			if (worker) {
				try {
					worker.terminate();
				} catch {
					// Ignore
				}
				this._workers.delete(workerId);
			}

			// Spawn new worker after delay
			setTimeout(
				() => {
					if (!this._terminated) {
						this._spawnWorker(workerId).catch((spawnErr) => {
							this._logger.error(`Failed to restart worker ${workerId}`, { error: spawnErr });
						});
					}
				},
				1000 * (retryCount + 1)
			);
		} else {
			this._logger.error(`Worker ${workerId} exceeded max retries, removing from pool`);
			const worker = this._workers.get(workerId);
			if (worker) {
				try {
					worker.terminate();
				} catch {
					// Ignore
				}
				this._workers.delete(workerId);
			}
		}
	}

	/**
	 * Handle worker exit.
	 */
	private _handleWorkerExit(workerId: number, code: number): void {
		this._workers.delete(workerId);

		// Spawn replacement worker if not terminated
		if (!this._terminated && code !== 0) {
			this._logger.info(`Spawning replacement worker ${workerId}`);
			this._spawnWorker(workerId).catch((err) => {
				this._logger.error(`Failed to spawn replacement worker`, err);
			});
		}
	}

	/**
	 * Start periodic health checks for all workers.
	 */
	private _startHealthCheck(): void {
		this._healthCheckTimer = setInterval(() => {
			for (const [, worker] of this._workers.entries()) {
				try {
					worker.postMessage({ type: 'health-check' });
				} catch {
					// Worker is dead, will be handled by exit event
				}
			}
		}, this._healthCheckInterval);
	}

	/**
	 * Process a thought using an available worker.
	 *
	 * @param input - The thought data to process
	 * @returns Promise with the processing result
	 */
	async processThought(input: ThoughtData): Promise<unknown> {
		if (this._terminated) {
			throw new Error('WorkerManager has been terminated');
		}

		if (this._workers.size === 0) {
			throw new Error('No workers available');
		}

		// Get next available worker (round-robin over Map keys)
		const workerIds = Array.from(this._workers.keys());
		const index = this._nextWorkerIndex % workerIds.length;
		const workerId = workerIds[index]!;
		const worker = this._workers.get(workerId);

		if (!worker) {
			throw new Error(`Worker ${workerId} not available`);
		}

		// Increment next worker index (round-robin)
		this._nextWorkerIndex = (this._nextWorkerIndex + 1) % workerIds.length;

		// Generate unique request ID
		const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

		return new Promise((resolve, reject) => {
			// Set timeout
			const timeout = setTimeout(() => {
				this._activeRequests.delete(requestId);
				reject(new Error(`Worker timeout after ${this._workerTimeout}ms`));
			}, this._workerTimeout);

			// Store callback
			this._activeRequests.set(requestId, (result) => {
				clearTimeout(timeout);
				if (result instanceof Error) {
					reject(result);
				} else {
					resolve(result);
				}
			});

			// Send message to worker
			try {
				worker.postMessage({
					type: 'process-thought',
					requestId,
					input,
				});
			} catch (error) {
				clearTimeout(timeout);
				this._activeRequests.delete(requestId);
				reject(error);
			}
		});
	}

	/**
	 * Get statistics about the worker pool.
	 */
	getStats(): {
		activeWorkers: number;
		activeRequests: number;
		maxWorkers: number;
		healthCheckEnabled: boolean;
	} {
		return {
			activeWorkers: this._workers.size,
			activeRequests: this._activeRequests.size,
			maxWorkers: this._maxWorkers,
			healthCheckEnabled: this._enableHealthCheck,
		};
	}

	/**
	 * Terminate all workers and stop the health check.
	 */
	async terminate(): Promise<void> {
		if (this._terminated) {
			return;
		}

		this._terminated = true;

		// Stop health check
		if (this._healthCheckTimer) {
			clearInterval(this._healthCheckTimer);
			this._healthCheckTimer = null;
		}

		// Terminate all workers
		const terminatePromises = Array.from(this._workers.values()).map((worker) => {
			return new Promise<void>((resolve) => {
				worker
					.terminate()
					.then(() => resolve())
					.catch(() => resolve());
			});
		});

		await Promise.all(terminatePromises);
		this._workers.clear();
		this._activeRequests.clear();

		this._logger.info('WorkerManager terminated');
	}

	/**
	 * Dispose of the worker manager, releasing all resources.
	 * Implements the IDisposable interface.
	 * Delegates to terminate() for backward compatibility.
	 */
	async dispose(): Promise<void> {
		await this.terminate();
	}

	/**
	 * Check if worker manager is running.
	 */
	isRunning(): boolean {
		return !this._terminated && this._workers.size > 0;
	}
}

/**
 * Create a WorkerManager with the given options.
 *
 * @param options - Worker manager configuration
 * @returns A configured WorkerManager
 *
 * @example
 * ```typescript
 * const manager = createWorkerManager({
 *   maxWorkers: 4,
 *   workerScript: './dist/worker.js'
 * });
 * await manager.start();
 * ```
 */
export function createWorkerManager(options?: WorkerManagerOptions): WorkerManager {
	return new WorkerManager(options);
}
