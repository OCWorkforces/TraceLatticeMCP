import type { ThoughtData } from './types.js';
import type { StructuredLogger } from './logger/StructuredLogger.js';
import type { DiscoveryCacheOptions } from './cache/DiscoveryCache.js';
import type { PersistenceBackend } from './persistence/PersistenceBackend.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { SkillRegistry } from './registry/SkillRegistry.js';
import { DiscoveryCache } from './cache/DiscoveryCache.js';

export interface HistoryManagerConfig {
	maxHistorySize?: number;
	maxBranches?: number;
	maxBranchSize?: number;
	logger?: StructuredLogger;
	skillDirs?: string[];
	discoveryCache?: DiscoveryCacheOptions;
	lazyDiscovery?: boolean;
	persistence?: PersistenceBackend | null;
}

export class HistoryManager {
	private _thought_history: ThoughtData[] = [];
	private _branches: Record<string, ThoughtData[]> = {};
	private _maxHistorySize: number;
	private _maxBranches: number;
	private _maxBranchSize: number;
	private _logger: StructuredLogger | null;
	private _persistence: PersistenceBackend | null;
	private _persistenceEnabled: boolean;
	public tools: ToolRegistry;
	public skills: SkillRegistry;

	constructor(config: HistoryManagerConfig = {}) {
		this._maxHistorySize = config.maxHistorySize || 1000;
		this._maxBranches = config.maxBranches || 50;
		this._maxBranchSize = config.maxBranchSize || 100;
		this._logger = config.logger || null;
		this._persistence = config.persistence ?? null;
		this._persistenceEnabled = this._persistence !== null;
		this.tools = new ToolRegistry(
			config.logger,
			config.discoveryCache ? new DiscoveryCache(config.discoveryCache) : undefined
		);
		this.skills = new SkillRegistry({
			logger: config.logger,
			cache: config.discoveryCache ? new DiscoveryCache(config.discoveryCache) : undefined,
			skillDirs: config.skillDirs,
			lazyDiscovery: config.lazyDiscovery,
		});
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		if (this._logger) {
			this._logger.info(message, meta);
		} else {
			console.error(message);
		}
	}

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

	public getHistory(): ThoughtData[] {
		return this._thought_history;
	}

	public getHistoryLength(): number {
		return this._thought_history.length;
	}

	public getBranches(): Record<string, ThoughtData[]> {
		return this._branches;
	}

	public getBranchIds(): string[] {
		return Object.keys(this._branches);
	}

	public getBranch(branchId: string): ThoughtData[] | undefined {
		return this._branches[branchId];
	}

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
	 * Load history from persistence backend.
	 * This should be called during initialization to restore previous state.
	 *
	 * @returns Promise that resolves when loading is complete
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

			// TODO: Load branches if needed
			// This would require tracking branch IDs separately or listing them
		} catch (error) {
			this.log('Failed to load from persistence', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Check if persistence is enabled.
	 */
	public isPersistenceEnabled(): boolean {
		return this._persistenceEnabled;
	}

	/**
	 * Get the persistence backend instance.
	 */
	public getPersistenceBackend(): PersistenceBackend | null {
		return this._persistence;
	}
}
