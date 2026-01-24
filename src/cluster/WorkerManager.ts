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
import type { ThoughtData } from '../types.js';

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
}

export interface WorkerMessage {
	type: 'process-thought' | 'health-check' | 'terminate';
	requestId?: string;
	input?: any;
}

export interface WorkerResponse {
	type: 'result' | 'error' | 'health';
	requestId?: string;
	result?: any;
	error?: string;
}

/**
 * WorkerManager manages a pool of worker processes for parallel thought processing.
 *
 * Each worker runs in a separate process and can process thoughts independently.
 * The manager distributes incoming requests across available workers.
 */
export class WorkerManager {
	private _workers: Worker[] = [];
	private _maxWorkers: number;
	private _workerScript: string;
	private _workerTimeout: number;
	private _enableHealthCheck: boolean;
	private _healthCheckInterval: number;
	private _maxRetries: number;
	private _activeRequests: Map<string, (result: any) => void> = new Map();
	private _workerRetryCount: Map<number, number> = new Map();
	private _healthCheckTimer: NodeJS.Timeout | null = null;
	private _nextWorkerIndex = 0;

	private _terminated = false;

	constructor(options: WorkerManagerOptions = {}) {
		this._maxWorkers = options.maxWorkers ?? cpus().length;
		this._workerScript = options.workerScript ?? join(dirname(fileURLToPath(import.meta.url)), 'worker.js');
		this._workerTimeout = options.workerTimeout ?? 30000;
		this._enableHealthCheck = options.enableHealthCheck ?? true;
		this._healthCheckInterval = options.healthCheckInterval ?? 60000;
		this._maxRetries = options.maxRetries ?? 3;
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
			await this._spawnWorker(i);
		}

		// Start health check if enabled
		if (this._enableHealthCheck) {
			this._startHealthCheck();
		}

		console.log(`WorkerManager started with ${this._workers.length} workers`);
	}

	/**
	 * Spawn a single worker process.
	 */
	private async _spawnWorker(index: number): Promise<void> {
		const worker = new Worker(this._workerScript, {
			resourceLimits: {
				maxOldGenerationSizeMb: 100, // Limit memory usage
			},
		});

		worker.on('online', () => {
			console.log(`Worker ${index} is online`);
			this._workerRetryCount.delete(index);
		});

		worker.on('message', (message: WorkerResponse) => {
			this._handleWorkerMessage(index, message);
		});

		worker.on('error', () => {
			console.error(`Worker ${index} error`);
			this._handleWorkerError(index);
		});

		worker.on('exit', (code) => {
			console.log(`Worker ${index} exited with code ${code}`);
			this._handleWorkerExit(index, code);
		});

		this._workers.push(worker);
	}

	/**
	 * Handle incoming messages from workers.
	 */
	private _handleWorkerMessage(workerIndex: number, message: WorkerResponse): void {
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
			this._workerRetryCount.delete(workerIndex);
		}
	}

	/**
	 * Handle worker errors.
	 */
	private _handleWorkerError(workerIndex: number): void {
		const retryCount = this._workerRetryCount.get(workerIndex) || 0;

		if (retryCount < this._maxRetries) {
			this._workerRetryCount.set(workerIndex, retryCount + 1);
			console.log(`Restarting worker ${workerIndex} (attempt ${retryCount + 1}/${this._maxRetries})`);

			// Remove failed worker
			const worker = this._workers[workerIndex];
			if (worker) {
				try {
					worker.terminate();
				} catch {
					// Ignore
				}
				this._workers.splice(workerIndex, 1);
			}

			// Spawn new worker after delay
			setTimeout(() => {
				if (!this._terminated) {
					this._spawnWorker(workerIndex).catch((err) => {
						console.error(`Failed to restart worker ${workerIndex}:`, err);
					});
				}
			}, 1000 * (retryCount + 1));
		} else {
			console.error(`Worker ${workerIndex} exceeded max retries, removing from pool`);
			const worker = this._workers[workerIndex];
			if (worker) {
				try {
					worker.terminate();
				} catch {
					// Ignore
				}
				this._workers.splice(workerIndex, 1);
			}
		}
	}

	/**
	 * Handle worker exit.
	 */
	private _handleWorkerExit(workerIndex: number, code: number): void {
		const worker = this._workers[workerIndex];
		if (worker) {
			this._workers.splice(workerIndex, 1);
		}

		// Spawn replacement worker if not terminated
		if (!this._terminated && code !== 0) {
			console.log(`Spawning replacement worker ${workerIndex}`);
			this._spawnWorker(workerIndex).catch((err) => {
				console.error(`Failed to spawn replacement worker:`, err);
			});
		}
	}

	/**
	 * Start periodic health checks for all workers.
	 */
	private _startHealthCheck(): void {
		this._healthCheckTimer = setInterval(() => {
			for (let i = 0; i < this._workers.length; i++) {
				const worker = this._workers[i];
				if (worker) {
					try {
						worker.postMessage({ type: 'health-check' });
					} catch {
						// Worker is dead, will be handled by exit event
					}
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
	async processThought(input: ThoughtData): Promise<any> {
		if (this._terminated) {
			throw new Error('WorkerManager has been terminated');
		}

		if (this._workers.length === 0) {
			throw new Error('No workers available');
		}

		// Get next available worker (round-robin)
		const workerIndex = this._nextWorkerIndex;
		const worker = this._workers[workerIndex];

		if (!worker) {
			throw new Error(`Worker ${workerIndex} not available`);
		}

		// Increment next worker index (round-robin)
		this._nextWorkerIndex = (this._nextWorkerIndex + 1) % this._workers.length;

		// Generate unique request ID
		const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
			activeWorkers: this._workers.length,
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
		const terminatePromises = this._workers.map((worker) => {
			return new Promise<void>((resolve) => {
				worker.terminate().then(() => resolve()).catch(() => resolve());
			});
		});

		await Promise.all(terminatePromises);
		this._workers = [];
		this._activeRequests.clear();

		console.log('WorkerManager terminated');
	}

	/**
	 * Check if the worker manager is running.
	 */
	isRunning(): boolean {
		return !this._terminated && this._workers.length > 0;
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
