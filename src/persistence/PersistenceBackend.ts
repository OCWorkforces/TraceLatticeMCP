import type { ThoughtData } from '../types.js';

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
}

/**
 * Configuration options for persistence backends.
 */
export interface PersistenceConfig {
	/**
	 * Enable or disable persistence.
	 * When disabled, all data is kept in-memory only.
	 * @default false
	 */
	enabled?: boolean;

	/**
	 * The type of persistence backend to use.
	 * - 'file': JSON file storage (simple, no dependencies)
	 * - 'sqlite': SQLite database (requires better-sqlite3)
	 * - 'memory': In-memory only (useful for testing, default)
	 * @default 'memory'
	 */
	backend?: 'file' | 'sqlite' | 'memory';

	/**
	 * Backend-specific configuration options.
	 */
	options?: {
		/**
		 * For 'file' backend: directory to store JSON files
		 * Default: '.claude/data'
		 */
		dataDir?: string;

		/**
		 * For 'sqlite' backend: path to the database file
		 * Default: '.claude/data/history.db'
		 */
		dbPath?: string;

		/**
		 * For 'sqlite' backend: enable WAL mode for better concurrency
		 * Default: true
		 */
		enableWAL?: boolean;

		/**
		 * Maximum number of thoughts to keep in history before pruning.
		 * Default: 10000 (matches maxHistorySize default)
		 */
		maxHistorySize?: number;

		/**
		 * Whether to persist branches.
		 * Default: true
		 */
		persistBranches?: boolean;
	};
}

/**
 * Create a persistence backend based on the provided configuration.
 *
 * @param config - Persistence configuration
 * @returns A configured persistence backend, or null if disabled
 *
 * @example
 * ```typescript
 * const backend = createPersistenceBackend({
 *   enabled: true,
 *   backend: 'file',
 *   options: { dataDir: './data' }
 * });
 * ```
 */
export async function createPersistenceBackend(
	config: PersistenceConfig
): Promise<PersistenceBackend | null> {
	if (!config.enabled) {
		return null;
	}

	switch (config.backend) {
		case 'file': {
			const { FilePersistence } = await import('./FilePersistence.js');
			return new FilePersistence(config.options);
		}

		case 'sqlite': {
			const { SqlitePersistence } = await import('./SqlitePersistence.js');
			return await SqlitePersistence.create(config.options);
		}

		case 'memory': {
			const { MemoryPersistence } = await import('./MemoryPersistence.js');
			return new MemoryPersistence();
		}

		default:
			throw new Error(`Unknown persistence backend: ${config.backend}`);
	}
}
