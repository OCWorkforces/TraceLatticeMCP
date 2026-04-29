import type { ThoughtData } from '../core/thought.js';
import type { Edge } from '../core/graph/Edge.js';
import type { Summary } from '../core/compression/Summary.js';
import type { PersistenceBackend } from '../contracts/PersistenceBackend.js';
import { asBranchId, type BranchId } from '../contracts/ids.js';

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
	private _edges: Map<string, Edge[]> = new Map();
	private _summaries: Map<string, Summary[]> = new Map();

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

	public async saveBranch(branchId: BranchId, thoughts: ThoughtData[]): Promise<void> {
		this._branches.set(branchId, [...thoughts]);
	}

	public async loadBranch(branchId: BranchId): Promise<ThoughtData[] | undefined> {
		const branch = this._branches.get(branchId);
		return branch ? [...branch] : undefined;
	}

	public async listBranches(): Promise<BranchId[]> {
		return this.getBranchIds().map((id) => asBranchId(id));
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
		this._edges.clear();
		this._summaries.clear();
	}

	/**
	 * No resources to release for in-memory backend.
	 */
	public async close(): Promise<void> {
		// No-op for in-memory backend
	}

	/**
	 * Save edges for a session, replacing any previously saved edges.
	 *
	 * @param sessionId - The session whose edges to persist
	 * @param edges - Array of edges to save
	 */
	public async saveEdges(sessionId: string, edges: readonly Edge[]): Promise<void> {
		if (edges.length === 0) {
			this._edges.delete(sessionId);
		} else {
			this._edges.set(sessionId, [...edges]);
		}
	}

	/**
	 * Load edges for a session from memory.
	 * Returns edges sorted by createdAt ascending.
	 *
	 * @param sessionId - The session whose edges to load
	 * @returns Array of persisted edges, sorted by createdAt
	 */
	public async loadEdges(sessionId: string): Promise<Edge[]> {
		const edges = this._edges.get(sessionId);
		if (!edges) return [];
		return [...edges].sort((a, b) => a.createdAt - b.createdAt);
	}

	/**
	 * List all session IDs that have persisted edges in memory.
	 *
	 * @returns Array of session identifiers with persisted edges
	 */
	public async listEdgeSessions(): Promise<string[]> {
		return Array.from(this._edges.keys());
	}

	/**
	 * Save summaries for a session, replacing any previously saved summaries.
	 *
	 * @param sessionId - The session whose summaries to persist
	 * @param summaries - Array of summaries to save
	 */
	public async saveSummaries(sessionId: string, summaries: readonly Summary[]): Promise<void> {
		if (summaries.length === 0) {
			this._summaries.delete(sessionId);
		} else {
			this._summaries.set(sessionId, [...summaries]);
		}
	}

	/**
	 * Load summaries for a session from memory.
	 * Returns summaries sorted by createdAt ascending.
	 *
	 * @param sessionId - The session whose summaries to load
	 * @returns Array of persisted summaries, sorted by createdAt
	 */
	public async loadSummaries(sessionId: string): Promise<Summary[]> {
		const summaries = this._summaries.get(sessionId);
		if (!summaries) return [];
		return [...summaries].sort((a, b) => a.createdAt - b.createdAt);
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
