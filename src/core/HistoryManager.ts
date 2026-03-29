/**
 * History and branch management for sequential thinking.
 *
 * This module provides the `HistoryManager` class which manages thought history,
 * branching, and optional persistence.
 *
 * @module HistoryManager
 */

import type { ThoughtData } from './thought.js';
import type { Logger } from '../logger/StructuredLogger.js';
import { NullLogger } from '../logger/NullLogger.js';
import type { PersistenceBackend } from '../persistence/PersistenceBackend.js';
import type { IHistoryManager } from './IHistoryManager.js';
import type { IMetrics } from '../contracts/index.js';

/**
 * Interface for emitting persistence error events.
 * Compatible with EventEmitter's emit method signature.
 */
export interface PersistenceEventEmitter {
	emit(event: 'persistenceError', payload: { operation: string; error: Error }): boolean;
}

/**
 * Configuration options for creating a `HistoryManager` instance.
 *
 * @example
 * ```typescript
 * const config: HistoryManagerConfig = {
 *   maxHistorySize: 500,
 *   maxBranches: 25,
 *   maxBranchSize: 50,
 *   logger: new StructuredLogger(),
 *   persistence: filePersistence
 * };
 * ```
 */
export interface HistoryManagerConfig {
	/**
	 * Maximum number of thoughts to keep in main history.
	 * @default 1000
	 */
	maxHistorySize?: number;

	/**
	 * Maximum number of branches to maintain.
	 * @default 50
	 */
	maxBranches?: number;

	/**
	 * Maximum size of each branch.
	 * @default 100
	 */
	maxBranchSize?: number;

	/** Optional logger for diagnostics. */
	logger?: Logger;

	/** Optional persistence backend for saving/loading history. */
	persistence?: PersistenceBackend | null;
	metrics?: IMetrics;

	/**
	 * Maximum number of thoughts to buffer before flushing to persistence.
	 * @default 100
	 */
	persistenceBufferSize?: number;

	/**
	 * Interval in milliseconds between periodic persistence flushes.
	 * @default 1000
	 */
	persistenceFlushInterval?: number;

	/**
	 * Maximum number of retries for failed persistence flushes.
	 * @default 3
	 */
	persistenceMaxRetries?: number;

	/**
	 * Event emitter for persistence error events.
	 * When provided, persistenceError events are emitted on persistent failures.
	 */
	eventEmitter?: PersistenceEventEmitter;
}

/**
 * Manages thought history and branching for sequential thinking.
 *
 * This class is the central component for managing the state of sequential thinking
 * operations. It handles thought storage, branch management, and optional persistence
 * for state recovery.
 *
 * @remarks
 * **History Management:**
 * - Thoughts are stored in a linear history array
 * - Auto-trimming occurs when `maxHistorySize` is exceeded
 * - Oldest thoughts are removed first (FIFO eviction)
 *
 * **Branch Management:**
 * - Branches allow exploring alternative reasoning paths
 * - Each branch has its own thought array
 * - Branches are created when `branch_from_thought` and `branch_id` are set
 * - Branch count and size are limited by `maxBranches` and `maxBranchSize`
 *
 * **Persistence:**
 * - Optional persistence backend for saving/loading state
 * - Persists thoughts and branches asynchronously (fire-and-forget)
 * - Does not block on persistence failures
 *
 * @example
 * ```typescript
 * const manager = new HistoryManager({
 *   maxHistorySize: 500,
 *   maxBranches: 25,
 *   logger: new StructuredLogger({ context: 'History' })
 * });
 *
 * // Add a thought
 * manager.addThought({
 *   thought: 'I need to analyze the problem',
 *   thought_number: 1,
 *   total_thoughts: 5,
 *   next_thought_needed: true
 * });
 *
 * // Get history
 * const history = manager.getHistory();
 * console.log(`Thoughts: ${history.length}`);
 *
 * // Get branches
 * const branches = manager.getBranches();
 * console.log(`Branches: ${Object.keys(branches).length}`);
 *
 * // Clear all state
 * manager.clear();
 * ```
 */
export class HistoryManager implements IHistoryManager {
	/** Linear history of all thoughts. */
	private _thought_history: ThoughtData[] = [];

	/** Branch storage indexed by branch ID. */
	private _branches: Record<string, ThoughtData[]> = {};

	/** Cached available MCP tools from the most recent thought. */
	private _availableMcpTools: string[] | undefined;

	/** Cached available skills from the most recent thought. */
	private _availableSkills: string[] | undefined;
	/** Maximum history size before auto-trimming. */
	private _maxHistorySize: number;

	/** Maximum number of branches before cleanup. */
	private _maxBranches: number;

	/** Maximum size of each branch. */
	private _maxBranchSize: number;

	/** Logger for diagnostics. */
	private _logger: Logger;

	/** Persistence backend for saving/loading state. */
	private _persistence: PersistenceBackend | null;

	/** Whether persistence is enabled. */
	private _persistenceEnabled: boolean;

	private _metrics?: IMetrics;

	/** Write buffer for batching persistence operations. */
	private _writeBuffer: ThoughtData[] = [];

	/** Timer for periodic buffer flushes. */
	private _flushTimer: ReturnType<typeof setInterval> | null = null;

	/** Guard to prevent concurrent flushes. */
	private _isFlushing: boolean = false;

	/** Tracks consecutive flush failures for backoff. */
	private _flushRetryCount: number = 0;

	/** Maximum buffer size before triggering immediate flush. */
	private _persistenceBufferSize: number;

	/** Interval in milliseconds between periodic flushes. */
	private _persistenceFlushInterval: number;

	/** Maximum number of retries for failed flushes. */
	private _persistenceMaxRetries: number;

	/** Event emitter for persistence error events. */
	private _eventEmitter: PersistenceEventEmitter | null;

	/**
	 * Creates a new HistoryManager instance.
	 *
	 * @param config - Configuration options for the history manager
	 *
	 * @example
	 * ```typescript
	 * const manager = new HistoryManager({
	 *   maxHistorySize: 500,
	 *   maxBranches: 25,
	 *   logger: new StructuredLogger(),
	 *   persistence: filePersistence
	 * });
	 * ```
	 */
	constructor(config: HistoryManagerConfig = {}) {
		this._maxHistorySize = config.maxHistorySize || 1000;
		this._maxBranches = config.maxBranches || 50;
		this._maxBranchSize = config.maxBranchSize || 100;
		this._logger = config.logger ?? new NullLogger();
		this._persistence = config.persistence ?? null;
		this._persistenceEnabled = this._persistence !== null;
		this._metrics = config.metrics;
		this._persistenceBufferSize = config.persistenceBufferSize ?? 100;
		this._persistenceFlushInterval = config.persistenceFlushInterval ?? 1000;
		this._persistenceMaxRetries = config.persistenceMaxRetries ?? 3;
		this._eventEmitter = config.eventEmitter ?? null;

		// Start the periodic flush timer if persistence is enabled
		if (this._persistenceEnabled) {
			this._startFlushTimer();
		}
	}

	/**
	 * Internal logging method.
	 * @param message - The message to log
	 * @param meta - Optional metadata
	 * @private
	 */
	private log(message: string, meta?: Record<string, unknown>): void {
		this._logger.info(message, meta);
	}

	/**
	 * Adds a thought to the history.
	 *
	 * The thought is appended to the history array. If history exceeds
	 * `maxHistorySize`, the oldest thoughts are removed. If the thought
	 * has `branch_from_thought` and `branch_id` set, it's also added to
	 * the appropriate branch. The thought is persisted asynchronously if
	 * persistence is enabled.
	 *
	 * @param thought - The thought data to add
	 *
	 * @example
	 * ```typescript
	 * manager.addThought({
	 *   thought: 'I should read the README file',
	 *   thought_number: 1,
	 *   total_thoughts: 3,
	 *   next_thought_needed: true
	 * });
	 * ```
	 */
	public addThought(thought: ThoughtData): void {
		this._metrics?.counter(
			'thought_requests_total',
			1,
			{},
			'Total thought requests added to history'
		);
	this._thought_history.push(thought);

	// Cache available_mcp_tools/available_skills for cross-call persistence
	if (thought.available_mcp_tools) {
		this._availableMcpTools = thought.available_mcp_tools;
	}
	if (thought.available_skills) {
		this._availableSkills = thought.available_skills;
	}

		if (this._thought_history.length > this._maxHistorySize) {
			this._thought_history = this._thought_history.slice(-this._maxHistorySize);
			this.log(`History trimmed to ${this._maxHistorySize} items`, {
				maxSize: this._maxHistorySize,
			});
		}

		if (thought.branch_from_thought && thought.branch_id) {
			this.addToBranch(thought.branch_id, thought);
		}

		// Buffer thought for persistence instead of fire-and-forget
		if (this._persistenceEnabled && this._persistence) {
			// Backpressure: if buffer is full and flush is failing, log warning
			if (this._writeBuffer.length >= this._persistenceBufferSize && this._isFlushing) {
				this.log('Write buffer full and flush in progress, applying backpressure', {
					bufferSize: this._writeBuffer.length,
					maxSize: this._persistenceBufferSize,
				});
			}

			this._writeBuffer.push(thought);

			// Trigger immediate flush if buffer is at capacity
			if (this._writeBuffer.length >= this._persistenceBufferSize) {
				void this._flushBuffer();
			}
		}
	}

	/**
	 * Adds a thought to a specific branch.
	 *
	 * Creates the branch if it doesn't exist. Trims the branch if it exceeds
	 * `maxBranchSize`. Cleans up old branches if `maxBranches` is exceeded.
	 * The branch is persisted asynchronously if persistence is enabled.
	 *
	 * @param branchId - The branch identifier
	 * @param thought - The thought data to add to the branch
	 * @private
	 */
	private addToBranch(branchId: string, thought: ThoughtData): void {
		if (!this._branches[branchId]) {
			this._branches[branchId] = [];
		}

		this.trimBranchSize(branchId);
		this._branches[branchId].push(thought);

		if (Object.keys(this._branches).length > this._maxBranches) {
			this.cleanupBranches();
		}

		// Persist branch to backend if enabled
		if (this._persistenceEnabled && this._persistence) {
			// Fire and forget - don't await to avoid blocking
			this._persistence.saveBranch(branchId, this._branches[branchId]).catch((err) => {
				this.log('Failed to persist branch', {
					branchId,
					error: err instanceof Error ? err.message : String(err),
				});
			});
		}
	}

	/**
	 * Removes old branches when the branch count exceeds `maxBranches`.
	 * Oldest branches are removed first.
	 * @private
	 */
	private cleanupBranches(): void {
		const branchCount = Object.keys(this._branches).length;
		if (branchCount > this._maxBranches) {
			const branchesToRemove = Object.keys(this._branches).slice(
				0,
				branchCount - this._maxBranches
			);
			for (const branchId of branchesToRemove) {
				delete this._branches[branchId];
				this.log(`Removed old branch: ${branchId}`, { branchId });
			}
		}
	}

	/**
	 * Trims a branch to `maxBranchSize` if it exceeds that limit.
	 * Oldest thoughts in the branch are removed first.
	 * @param branchId - The branch identifier to trim
	 * @private
	 */
	private trimBranchSize(branchId: string): void {
		if ((this._branches[branchId] ?? []).length > this._maxBranchSize) {
			const removed = this._branches[branchId]!.length - this._maxBranchSize;
			this._branches[branchId] = this._branches[branchId]!.slice(-this._maxBranchSize);
			this.log(`Trimmed branch '${branchId}': removed ${removed} old thoughts`, {
				branchId,
				removed,
			});
		}
	}

	/**
	 * Gets the complete thought history.
	 *
	 * @returns An array of all thoughts in chronological order
	 *
	 * @example
	 * ```typescript
	 * const history = manager.getHistory();
	 * history.forEach(thought => {
	 *   console.log(`${thought.thought_number}: ${thought.thought}`);
	 * });
	 * ```
	 */
	public getHistory(): ThoughtData[] {
		return this._thought_history;
	}

	/**
	 * Gets the current length of the thought history.
	 *
	 * @returns The number of thoughts in history
	 *
	 * @example
	 * ```typescript
	 * console.log(`Total thoughts: ${manager.getHistoryLength()}`);
	 * ```
	 */
	public getHistoryLength(): number {
		return this._thought_history.length;
	}

	/**
	 * Gets all branches.
	 *
	 * @returns A record mapping branch IDs to their thought arrays
	 *
	 * @example
	 * ```typescript
	 * const branches = manager.getBranches();
	 * for (const [branchId, thoughts] of Object.entries(branches)) {
	 *   console.log(`Branch ${branchId}: ${thoughts.length} thoughts`);
	 * }
	 * ```
	 */
	public getBranches(): Record<string, ThoughtData[]> {
		return this._branches;
	}

	/**
	 * Gets all branch IDs.
	 *
	 * @returns An array of branch identifiers
	 *
	 * @example
	 * ```typescript
	 * const branchIds = manager.getBranchIds();
	 * console.log(`Active branches: ${branchIds.join(', ')}`);
	 * ```
	 */
	public getBranchIds(): string[] {
		return Object.keys(this._branches);
	}

	/**
	 * Gets the most recently available MCP tools from the session.
	 *
	 * @returns The last-seen array of MCP tool names, or undefined if never set
	 *
	 * @example
	 * ```typescript
	 * const tools = manager.getAvailableMcpTools();
	 * // ['Read', 'Grep', 'Glob'] or undefined
	 * ```
	 */
	public getAvailableMcpTools(): string[] | undefined {
		return this._availableMcpTools;
	}

	/**
	 * Gets the most recently available skills from the session.
	 *
	 * @returns The last-seen array of skill names, or undefined if never set
	 *
	 * @example
	 * ```typescript
	 * const skills = manager.getAvailableSkills();
	 * // ['commit', 'review-pr'] or undefined
	 * ```
	 */
	public getAvailableSkills(): string[] | undefined {
		return this._availableSkills;
	}


	/**
	 * Gets a specific branch by ID.
	 *
	 * @param branchId - The branch identifier
	 * @returns The branch's thought array, or undefined if not found
	 *
	 * @example
	 * ```typescript
	 * const branch = manager.getBranch('alternative-approach');
	 * if (branch) {
	 *   console.log(`Branch has ${branch.length} thoughts`);
	 * } else {
	 *   console.log('Branch not found');
	 * }
	 * ```
	 */
	public getBranch(branchId: string): ThoughtData[] | undefined {
		return this._branches[branchId];
	}

	/**
	 * Clears all history and branches.
	 *
	 * This resets the manager to an empty state. Persisted data is also
	 * cleared if persistence is enabled.
	 *
	 * @example
	 * ```typescript
	 * manager.clear();
	 * console.log('All history and branches cleared');
	 * ```
	 */
	public clear(): void {
	this._thought_history = [];
	this._branches = {};
	this._writeBuffer = [];
	this._availableMcpTools = undefined;
	this._availableSkills = undefined;
	this.log('History cleared');

		// Clear persisted data if enabled
		if (this._persistenceEnabled && this._persistence) {
			// Fire and forget - don't await to avoid blocking
			this._persistence.clear().catch((err) => {
				this.log('Failed to clear persisted data', {
					error: err instanceof Error ? err.message : String(err),
				});
			});
		}
	}

	/**
	 * Loads history from the persistence backend.
	 *
	 * This should be called during initialization to restore previous state.
	 * Only loads if persistence is enabled and the backend is healthy.
	 *
	 * @returns Promise that resolves when loading is complete
	 *
	 * @example
	 * ```typescript
	 * await manager.loadFromPersistence();
	 * console.log(`Loaded ${manager.getHistoryLength()} thoughts`);
	 * ```
	 */
	public async loadFromPersistence(): Promise<void> {
		if (!this._persistenceEnabled || !this._persistence) {
			return;
		}

		try {
			// Check backend health
			const isHealthy = await this._persistence.healthy();
			if (!isHealthy) {
				this.log('Persistence backend not healthy, skipping load');
				return;
			}

			// Load history
			const history = await this._persistence.loadHistory();
			if (history.length > 0) {
				this._thought_history = history.slice(-this._maxHistorySize);
				this.log(`Loaded ${this._thought_history.length} thoughts from persistence`);
			}

			// Load branches
			const branchIds = await this._persistence.listBranches();
			for (const branchId of branchIds) {
				const branchData = await this._persistence.loadBranch(branchId);
				if (branchData) {
					this._branches[branchId] = branchData.slice(-this._maxBranchSize);
				}
			}
			this.log(`Loaded ${Object.keys(this._branches).length} branches from persistence`);
		} catch (error) {
			this.log('Failed to load from persistence', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Checks if persistence is enabled.
	 *
	 * @returns true if persistence is enabled, false otherwise
	 *
	 * @example
	 * ```typescript
	 * if (manager.isPersistenceEnabled()) {
	 *   console.log('Persistence is active');
	 * }
	 * ```
	 */
	public isPersistenceEnabled(): boolean {
		return this._persistenceEnabled;
	}

	/**
	 * Gets the persistence backend instance.
	 *
	 * @returns The persistence backend, or null if not configured
	 *
	 * @example
	 * ```typescript
	 * const backend = manager.getPersistenceBackend();
	 * if (backend) {
	 *   await backend.healthy();
	 * }
	 * ```
	 */
	public getPersistenceBackend(): PersistenceBackend | null {
		return this._persistence;
	}

	/**
	 * Sets the event emitter for persistence error events.
	 * This allows wiring up the event emitter after construction
	 * (e.g., when the server instance is the emitter).
	 *
	 * @param emitter - The event emitter to use for persistence error events
	 */
	public setEventEmitter(emitter: PersistenceEventEmitter): void {
		this._eventEmitter = emitter;
	}

	/**
	 * Gracefully shuts down the write buffer.
	 * Stops the periodic flush timer and flushes any remaining buffered writes.
	 * Should be called during server shutdown before closing the persistence backend.
	 */
	public async shutdown(): Promise<void> {
		this._stopFlushTimer();
		await this._flushBuffer();
	}

	/**
	 * Starts the periodic flush timer for the write buffer.
	 * @private
	 */
	private _startFlushTimer(): void {
		if (this._flushTimer !== null) {
			return;
		}
		this._flushTimer = setInterval(() => {
			void this._flushBuffer();
		}, this._persistenceFlushInterval);
		// Allow the process to exit even if the timer is still running
		if (this._flushTimer && typeof this._flushTimer === 'object' && 'unref' in this._flushTimer) {
			this._flushTimer.unref();
		}
	}

	/**
	 * Stops the periodic flush timer.
	 * @private
	 */
	private _stopFlushTimer(): void {
		if (this._flushTimer !== null) {
			clearInterval(this._flushTimer);
			this._flushTimer = null;
		}
	}

	/**
	 * Flushes the write buffer to the persistence backend.
	 *
	 * Takes all buffered thoughts and saves them individually with retry logic.
	 * On persistent failure (all retries exhausted), emits a `persistenceError` event
	 * and re-queues failed items at the front of the buffer.
	 *
	 * This method is safe to call concurrently — duplicate calls are skipped.
	 * @internal
	 */
	public async _flushBuffer(): Promise<void> {
		if (this._isFlushing || this._writeBuffer.length === 0 || !this._persistence) {
			return;
		}

		this._isFlushing = true;

		// Take all items from the buffer
		const batch = this._writeBuffer.splice(0, this._writeBuffer.length);
		const failedItems: ThoughtData[] = [];

		try {
			for (const thought of batch) {
				let saved = false;
				const backoffDelays = [100, 500, 2000];

				for (let attempt = 0; attempt <= this._persistenceMaxRetries; attempt++) {
					try {
						await this._persistence.saveThought(thought);
						saved = true;
						break;
					} catch (err) {
						if (attempt < this._persistenceMaxRetries) {
							const delay = backoffDelays[attempt] ?? backoffDelays[backoffDelays.length - 1]!;
							this.log(`Persistence retry ${attempt + 1}/${this._persistenceMaxRetries}`, {
								thoughtNumber: thought.thought_number,
								delay,
								error: err instanceof Error ? err.message : String(err),
							});
							await this._delay(delay);
						} else {
							this.log('All persistence retries exhausted for thought', {
								thoughtNumber: thought.thought_number,
								error: err instanceof Error ? err.message : String(err),
							});
						}
					}
				}

				if (!saved) {
					failedItems.push(thought);
				}
			}

			if (failedItems.length > 0) {
				// Re-queue failed items at the front of the buffer
				this._writeBuffer.unshift(...failedItems);
				this._flushRetryCount++;

				const error = new Error(
					`Failed to persist ${failedItems.length} thoughts after ${this._persistenceMaxRetries} retries`
				);
				this._eventEmitter?.emit('persistenceError', {
					operation: 'flushBuffer',
					error,
				});

				this.log('Flush completed with failures', {
					failed: failedItems.length,
					total: batch.length,
					consecutiveFailures: this._flushRetryCount,
				});
			} else {
				// Reset retry count on full success
				this._flushRetryCount = 0;
			}
		} finally {
			this._isFlushing = false;
		}
	}

	/**
	 * Returns a promise that resolves after the specified delay.
	 * @param ms - Delay in milliseconds
	 * @private
	 */
	private _delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Gets the current write buffer length.
	 * Useful for monitoring and testing.
	 */
	public getWriteBufferLength(): number {
		return this._writeBuffer.length;
	}
}
