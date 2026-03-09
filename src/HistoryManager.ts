/**
 * History and branch management for sequential thinking.
 *
 * This module provides the `HistoryManager` class which manages thought history,
 * branching, tool/skill registries, and optional persistence.
 *
 * @module HistoryManager
 */

import type { ThoughtData } from './types.js';
import type { Logger } from './logger/StructuredLogger.js';
import { NullLogger } from './logger/NullLogger.js';
import type { DiscoveryCacheOptions } from './cache/DiscoveryCache.js';
import type { PersistenceBackend } from './persistence/PersistenceBackend.js';
import type { IHistoryManager } from './IHistoryManager.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { SkillRegistry } from './registry/SkillRegistry.js';
import { DiscoveryCache } from './cache/DiscoveryCache.js';

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
 *   skillDirs: ['./custom-skills'],
 *   discoveryCache: { ttl: 300000, maxSize: 100 },
 *   lazyDiscovery: true,
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

	/** Directory paths to search for skills. */
	skillDirs?: string[];

	/** Discovery cache configuration. */
	discoveryCache?: DiscoveryCacheOptions;

	/**
	 * Enable lazy skill discovery (discover on first access).
	 * @default false
	 */
	lazyDiscovery?: boolean;

	/** Optional persistence backend for saving/loading history. */
	persistence?: PersistenceBackend | null;
	tools?: ToolRegistry;
	skills?: SkillRegistry;
}

/**
 * Manages thought history and branching for sequential thinking.
 *
 * This class is the central component for managing the state of sequential thinking
 * operations. It handles thought storage, branch management, tool/skill registries,
 * and optional persistence for state recovery.
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

	/** Tool registry for managing available tools. */
	public tools: ToolRegistry;

	/** Skill registry for managing available skills. */
	public skills: SkillRegistry;

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
		this.tools =
			config.tools ??
			new ToolRegistry({
				logger: config.logger,
				cache: config.discoveryCache ? new DiscoveryCache(config.discoveryCache) : undefined,
			});
		this.skills =
			config.skills ??
			new SkillRegistry({
				logger: config.logger,
				cache: config.discoveryCache ? new DiscoveryCache(config.discoveryCache) : undefined,
				skillDirs: config.skillDirs,
				lazyDiscovery: config.lazyDiscovery,
			});
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
		this._thought_history.push(thought);

		if (this._thought_history.length > this._maxHistorySize) {
			this._thought_history = this._thought_history.slice(-this._maxHistorySize);
			this.log(`History trimmed to ${this._maxHistorySize} items`, {
				maxSize: this._maxHistorySize,
			});
		}

		if (thought.branch_from_thought && thought.branch_id) {
			this.addToBranch(thought.branch_id, thought);
		}

		// Persist to backend if enabled
		if (this._persistenceEnabled && this._persistence) {
			// Fire and forget - don't await to avoid blocking
			this._persistence.saveThought(thought).catch((err) => {
				this.log('Failed to persist thought', {
					error: err instanceof Error ? err.message : String(err),
				});
			});
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
		if (this._branches[branchId].length > this._maxBranchSize) {
			const removed = this._branches[branchId].length - this._maxBranchSize;
			this._branches[branchId] = this._branches[branchId].slice(-this._maxBranchSize);
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
}
