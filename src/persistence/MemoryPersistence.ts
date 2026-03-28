import type { PersistenceBackend } from './PersistenceBackend.js';
import type { ThoughtData } from '../types/thought.js';

/**
 * Configuration options for MemoryPersistence.
 */
export interface MemoryPersistenceOptions {
	/**
	 * Maximum number of thoughts to keep in memory.
	 * Older thoughts are trimmed when limit is exceeded.
	 * Set to 0 or undefined for unlimited.
	 * @default undefined (unlimited)
	 */
	maxSize?: number;
}

/**
 * In-memory persistence backend for testing purposes.
 *
 * This backend stores all data in memory and provides no durability.
 * It's useful for testing and development where persistence is not needed.
 *
 * @example
 * ```typescript
 * // Unlimited history
 * const backend = new MemoryPersistence();
 *
 * // Limited to 1000 thoughts
 * const backend = new MemoryPersistence({ maxSize: 1000 });
 *
 * await backend.saveThought(thought);
 * const history = await backend.loadHistory();
 * ```
 */
export class MemoryPersistence implements PersistenceBackend {
	private _history: ThoughtData[] = [];
	private _branches: Map<string, ThoughtData[]> = new Map();
	private _maxSize?: number;

	constructor(options: MemoryPersistenceOptions = {}) {
		this._maxSize = options.maxSize && options.maxSize > 0 ? options.maxSize : undefined;
	}

	public async saveThought(thought: ThoughtData): Promise<void> {
		this._history.push(thought);

		// Trim if maxSize is set and exceeded
		if (this._maxSize !== undefined && this._history.length > this._maxSize) {
			this._history = this._history.slice(-this._maxSize);
		}
	}

	public async loadHistory(): Promise<ThoughtData[]> {
		return [...this._history];
	}

	public async saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void> {
		this._branches.set(branchId, [...thoughts]);
	}

	public async loadBranch(branchId: string): Promise<ThoughtData[] | undefined> {
		const branch = this._branches.get(branchId);
		return branch ? [...branch] : undefined;
	}

	public async listBranches(): Promise<string[]> {
		return this.getBranchIds();
	}

	/**
	 * In-memory backend is always healthy.
	 */
	public async healthy(): Promise<boolean> {
		return true;
	}

	/**
	 * Clear all data from memory.
	 */
	public async clear(): Promise<void> {
		this._history = [];
		this._branches.clear();
	}

	/**
	 * No resources to release for in-memory backend.
	 */
	public async close(): Promise<void> {
		// No-op for in-memory backend
	}

	/**
	 * Get the current number of thoughts in memory.
	 */
	public getHistorySize(): number {
		return this._history.length;
	}

	/**
	 * Get the current number of branches in memory.
	 */
	public getBranchCount(): number {
		return this._branches.size;
	}

	/**
	 * Get all branch IDs.
	 */
	public getBranchIds(): string[] {
		return Array.from(this._branches.keys());
	}
}
