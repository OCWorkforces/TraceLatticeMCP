import type { PersistenceBackend } from './PersistenceBackend.js';
import type { ThoughtData } from '../types.js';

/**
 * In-memory persistence backend for testing purposes.
 *
 * This backend stores all data in memory and provides no durability.
 * It's useful for testing and development where persistence is not needed.
 *
 * @example
 * ```typescript
 * const backend = new MemoryPersistence();
 * await backend.saveThought(thought);
 * const history = await backend.loadHistory();
 * ```
 */
export class MemoryPersistence implements PersistenceBackend {
	private _history: ThoughtData[] = [];
	private _branches: Map<string, ThoughtData[]> = new Map();

	public async saveThought(thought: ThoughtData): Promise<void> {
		this._history.push(thought);
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

	public async clear(): Promise<void> {
		this._history = [];
		this._branches.clear();
	}

	public async healthy(): Promise<boolean> {
		return true;
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
