import type { ThoughtData } from '../core/thought.js';
import type { Edge } from '../core/graph/Edge.js';
import type { Summary } from '../core/compression/Summary.js';

/**
 * Persistence backend interface for storing thought history and branches.
 *
 * Implementations can store data in various formats (JSON files, SQLite, etc.)
 * while providing a unified API for HistoryManager.
 */
export interface PersistenceBackend {
	/**
	 * Save a single thought to persistent storage.
	 *
	 * @param thought - The thought data to persist
	 */
	saveThought(thought: ThoughtData): Promise<void>;

	/**
	 * Load all thoughts from persistent storage.
	 * Returns thoughts in chronological order (oldest first).
	 *
	 * @returns Array of all persisted thoughts
	 */
	loadHistory(): Promise<ThoughtData[]>;

	/**
	 * Save all thoughts in a branch to persistent storage.
	 *
	 * @param branchId - The unique identifier for the branch
	 * @param thoughts - Array of thoughts in branch
	 */
	saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void>;

	/**
	 * Load all thoughts for a specific branch.
	 *
	 * @param branchId - The unique identifier for the branch
	 * @returns Array of thoughts in branch, or undefined if branch doesn't exist
	 */
	loadBranch(branchId: string): Promise<ThoughtData[] | undefined>;

	/**
	 * List all branch IDs that are persisted.
	 *
	 * @returns Array of branch identifiers
	 */
	listBranches(): Promise<string[]>;

	/**
	 * Check if backend is healthy.
	 * @returns Promise that resolves to true if healthy, false otherwise
	 */
	healthy(): Promise<boolean>;

	/**
	 * Clear all persisted data (history and branches).
	 * Use with caution - this cannot be undone.
	 */
	clear(): Promise<void>;

	/**
	 * Close the backend and release resources.
	 * Should be called during graceful shutdown to ensure data is flushed.
	 */
	close(): Promise<void>;

	/**
	 * Save edges for a session, replacing any previously saved edges.
	 *
	 * @param sessionId - The session whose edges to persist
	 * @param edges - Array of edges to save
	 */
	saveEdges(sessionId: string, edges: readonly Edge[]): Promise<void>;

	/**
	 * Load edges for a session from persistent storage.
	 * Returns edges in chronological order (by createdAt ascending).
	 * Returns empty array if no edges exist for the session.
	 *
	 * @param sessionId - The session whose edges to load
	 * @returns Array of persisted edges, sorted by createdAt
	 */
	loadEdges(sessionId: string): Promise<Edge[]>;

	/**
	 * List all session IDs that have persisted edge data.
	 *
	 * @returns Array of session identifiers with persisted edges
	 */
	listEdgeSessions(): Promise<string[]>;

	/**
	 * Save summaries for a session, replacing any previously saved summaries.
	 *
	 * @param sessionId - The session whose summaries to persist
	 * @param summaries - Array of summaries to save
	 */
	saveSummaries(sessionId: string, summaries: readonly Summary[]): Promise<void>;

	/**
	 * Load summaries for a session from persistent storage.
	 * Returns summaries in chronological order (by createdAt ascending).
	 * Returns empty array if no summaries exist for the session.
	 *
	 * @param sessionId - The session whose summaries to load
	 * @returns Array of persisted summaries, sorted by createdAt
	 */
	loadSummaries(sessionId: string): Promise<Summary[]>;
}

export interface PersistenceConfig {
	enabled?: boolean;
	backend?: 'file' | 'sqlite' | 'memory';
	options?: {
		dataDir?: string;
		dbPath?: string;
		enableWAL?: boolean;
		maxHistorySize?: number;
		persistBranches?: boolean;
	};
}

