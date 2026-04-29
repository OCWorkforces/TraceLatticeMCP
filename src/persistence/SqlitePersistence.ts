import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ThoughtData } from '../core/thought.js';
import type { Edge, EdgeKind } from '../core/graph/Edge.js';
import type { Summary } from '../core/compression/Summary.js';
import type { PersistenceBackend, PersistenceConfig } from '../contracts/PersistenceBackend.js';
import { asBranchId, type BranchId } from '../contracts/ids.js';

/**
 * Type definition for the better-sqlite3 Database interface.
 * This allows us to use the library without importing it directly.
 */
interface Database {
	exec(sql: string): void;
	prepare(sql: string): Statement;
	close(): void;
	pragma(pragma: string): unknown;
}

interface Statement {
	run(...params: unknown[]): RunResult;
	get(...params: unknown[]): unknown;
	all(...params: unknown[]): unknown[];
}

interface RunResult {
	changes: number;
	lastInsertRowid: number;
}

/**
 * SQLite-based persistence backend.
 *
 * Provides efficient, transactional persistence using SQLite.
 * Requires the 'better-sqlite3' package to be installed.
 *
 * @example
 * ```typescript
 * const backend = await SqlitePersistence.create({
 *   dbPath: './data/history.db',
 *   enableWAL: true
 * });
 * ```
 */
export class SqlitePersistence implements PersistenceBackend {
	private _db: Database;
	private _maxHistorySize: number;
	private _persistBranches: boolean;

	private constructor(db: Database, options: PersistenceConfig['options']) {
		this._db = db;
		this._maxHistorySize = options?.maxHistorySize ?? 10000;
		this._persistBranches = options?.persistBranches ?? true;
		this._initializeSchema();
	}

	/**
	 * Creates a new SqlitePersistence instance with dynamic import of better-sqlite3.
	 *
	 * @param options - Configuration options
	 * @returns A Promise that resolves to a SqlitePersistence instance
	 * @throws Error if better-sqlite3 is not installed
	 *
	 * @example
	 * ```typescript
	 * const backend = await SqlitePersistence.create({
	 *   dbPath: './data/history.db',
	 *   enableWAL: true
	 * });
	 * ```
	 */
	static async create(options?: PersistenceConfig['options']): Promise<SqlitePersistence> {
		// Default to .claude/data in current directory or home directory
		const defaultDataDir = existsSync('.claude/data')
			? '.claude/data'
			: join(homedir(), '.claude/data');
		const dbPath = options?.dbPath ?? join(defaultDataDir, 'history.db');

		// Load better-sqlite3 dynamically (optional dependency)
		let Database: new (path: string) => Database;
		try {
			const module = await import('better-sqlite3');
			Database = module.default;
		} catch {
			throw new Error(
				`SQLite persistence requires 'better-sqlite3' package. Install it with: npm install better-sqlite3`
			);
		}

		const db = new Database(dbPath);

		// Enable WAL mode for better concurrency if specified
		if (options?.enableWAL !== false) {
			db.pragma('journal_mode = WAL');
		}

		// Performance and safety PRAGMAs
		db.pragma('synchronous = NORMAL');
		db.pragma('foreign_keys = ON');
		db.pragma('busy_timeout = 5000');
		db.pragma('cache_size = -64000'); // 64MB
		db.pragma('temp_store = MEMORY');

		return new SqlitePersistence(db, options);
	}

	private _initializeSchema(): void {
		// Create thoughts table
		this._db.exec(`
      CREATE TABLE IF NOT EXISTS thoughts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

		// Create branches table
		if (this._persistBranches) {
			this._db.exec(`
        CREATE TABLE IF NOT EXISTS branches (
          branch_id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
		}

		// Create indexes for better performance
		this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_thoughts_created_at ON thoughts(created_at)
    `);

		// Create edges table for DAG edge storage
		this._db.exec(`
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT
      )
    `);

		// Indexes for edge queries
		this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_session ON edges(session_id)
    `);
		this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(session_id, from_id)
    `);
		this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(session_id, to_id)
    `);

		// Create summaries table for compression subsystem
		this._db.exec(`
      CREATE TABLE IF NOT EXISTS summaries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        branch_id TEXT,
        root_thought_id TEXT NOT NULL,
        covered_ids TEXT NOT NULL,
        covered_range_start INTEGER NOT NULL,
        covered_range_end INTEGER NOT NULL,
        topics TEXT NOT NULL,
        aggregate_confidence REAL NOT NULL,
        created_at INTEGER NOT NULL,
        meta TEXT
      )
    `);

		this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)
    `);
	}

	public async saveThought(thought: ThoughtData): Promise<void> {
		const stmt = this._db.prepare('INSERT INTO thoughts (data) VALUES (?)');
		stmt.run(JSON.stringify(thought));

		// Trim old thoughts if over limit
		const countStmt = this._db.prepare('SELECT COUNT(*) as count FROM thoughts');
		const { count } = countStmt.get() as { count: number };

		if (count > this._maxHistorySize) {
			const deleteStmt = this._db.prepare(
				`DELETE FROM thoughts WHERE id IN (
          SELECT id FROM thoughts ORDER BY id ASC LIMIT ?
        )`
			);
			deleteStmt.run(count - this._maxHistorySize);
		}
	}

	public async loadHistory(): Promise<ThoughtData[]> {
		const stmt = this._db.prepare('SELECT data FROM thoughts ORDER BY id ASC');
		const rows = stmt.all() as { data: string }[];

		return rows
			.map((row) => {
				try {
					return JSON.parse(row.data) as unknown as ThoughtData;
				} catch {
					return null;
				}
			})
			.filter((t): t is ThoughtData => t !== null);
	}

	public async saveBranch(branchId: BranchId, thoughts: ThoughtData[]): Promise<void> {
		if (!this._persistBranches) {
			return;
		}

		const stmt = this._db.prepare(
			'INSERT OR REPLACE INTO branches (branch_id, data, updated_at) VALUES (?, ?, strftime("%s", "now"))'
		);
		stmt.run(branchId, JSON.stringify(thoughts));
	}

	public async loadBranch(branchId: BranchId): Promise<ThoughtData[] | undefined> {
		if (!this._persistBranches) {
			return undefined;
		}

		const stmt = this._db.prepare('SELECT data FROM branches WHERE branch_id = ?');
		const row = stmt.get(branchId) as { data: string } | undefined;

		if (!row) {
			return undefined;
		}

		try {
			const data = JSON.parse(row.data) as unknown as ThoughtData[];
			return Array.isArray(data) ? data : undefined;
		} catch {
			return undefined;
		}
	}

	public async listBranches(): Promise<BranchId[]> {
		if (!this._persistBranches) {
			return [];
		}

		const stmt = this._db.prepare('SELECT branch_id FROM branches ORDER BY branch_id ASC');
		const rows = stmt.all() as { branch_id: string }[];
		return rows.map((row) => asBranchId(row.branch_id));
	}

	public async clear(): Promise<void> {
		this._db.exec('DELETE FROM thoughts');
		if (this._persistBranches) {
			this._db.exec('DELETE FROM branches');
		}
		this._db.exec('DELETE FROM edges');
		this._db.exec('DELETE FROM summaries');
	}

	public async healthy(): Promise<boolean> {
		try {
			// Simple health check - try to execute a query
			this._db.prepare('SELECT 1').get();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Close the database connection with proper cleanup.
	 * Runs WAL checkpoint before closing to ensure all data is persisted.
	 */
	public async close(): Promise<void> {
		if (this._db) {
			try {
				// Run WAL checkpoint to ensure all data is persisted
				this._db.pragma('wal_checkpoint(TRUNCATE)');
			} catch {
				// Ignore checkpoint errors - still try to close
			}
			this._db.close();
		}
	}

	/**
	 * Persist edges for a session using replace semantics: deletes any existing
	 * edges for the session, then inserts the provided edges within a transaction.
	 *
	 * @param sessionId - Session identifier whose edges are being replaced
	 * @param edges - The edges to persist for the session
	 * @returns A Promise that resolves when the edges are persisted
	 */
	public async saveEdges(sessionId: string, edges: readonly Edge[]): Promise<void> {
		const deleteStmt = this._db.prepare('DELETE FROM edges WHERE session_id = ?');
		const insertStmt = this._db.prepare(
			'INSERT INTO edges (id, session_id, from_id, to_id, kind, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
		);

		const dbWithTx = this._db as Database & {
			transaction: (fn: () => void) => () => void;
		};
		const transaction = dbWithTx.transaction(() => {
			deleteStmt.run(sessionId);
			for (const edge of edges) {
				insertStmt.run(
					edge.id,
					edge.sessionId,
					edge.from,
					edge.to,
					edge.kind,
					edge.createdAt,
					edge.metadata ? JSON.stringify(edge.metadata) : null
				);
			}
		});

		transaction();
	}

	/**
	 * Load all edges for a session, ordered by `created_at` ascending.
	 *
	 * @param sessionId - Session identifier to load edges for
	 * @returns A Promise that resolves to the session's edges in chronological order
	 */
	public async loadEdges(sessionId: string): Promise<Edge[]> {
		const stmt = this._db.prepare(
			'SELECT id, session_id, from_id, to_id, kind, created_at, metadata FROM edges WHERE session_id = ? ORDER BY created_at ASC'
		);
		const rows = stmt.all(sessionId) as Array<{
			id: string;
			session_id: string;
			from_id: string;
			to_id: string;
			kind: string;
			created_at: number;
			metadata: string | null;
		}>;

		return rows.map((row) => ({
			id: row.id as Edge['id'],
			sessionId: row.session_id as Edge['sessionId'],
			from: row.from_id as Edge['from'],
			to: row.to_id as Edge['to'],
			kind: row.kind as EdgeKind,
			createdAt: row.created_at,
			...(row.metadata ? { metadata: JSON.parse(row.metadata) as unknown as Record<string, unknown> } : {}),
		}));
	}

	/**
	 * List all session IDs that have persisted edges in the database.
	 *
	 * @returns Array of distinct session identifiers from the edges table
	 */
	public async listEdgeSessions(): Promise<string[]> {
		const rows = this._db
			.prepare('SELECT DISTINCT session_id FROM edges')
			.all() as { session_id: string }[];
		return rows.map((r) => r.session_id);
	}

	/**
	 * Persist summaries for a session using replace semantics: deletes any
	 * existing summaries for the session, then inserts the provided summaries
	 * within a transaction.
	 *
	 * @param sessionId - Session identifier whose summaries are being replaced
	 * @param summaries - The summaries to persist for the session
	 * @returns A Promise that resolves when the summaries are persisted
	 */
	public async saveSummaries(sessionId: string, summaries: readonly Summary[]): Promise<void> {
		const deleteStmt = this._db.prepare('DELETE FROM summaries WHERE session_id = ?');
		const insertStmt = this._db.prepare(
			'INSERT OR REPLACE INTO summaries (id, session_id, branch_id, root_thought_id, covered_ids, covered_range_start, covered_range_end, topics, aggregate_confidence, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		);

		const dbWithTx = this._db as Database & {
			transaction: (fn: () => void) => () => void;
		};
		const transaction = dbWithTx.transaction(() => {
			deleteStmt.run(sessionId);
			for (const summary of summaries) {
				insertStmt.run(
					summary.id,
					summary.sessionId,
					summary.branchId ?? null,
					summary.rootThoughtId,
					JSON.stringify(summary.coveredIds),
					summary.coveredRange[0],
					summary.coveredRange[1],
					JSON.stringify(summary.topics),
					summary.aggregateConfidence,
					summary.createdAt,
					summary.meta ? JSON.stringify(summary.meta) : null
				);
			}
		});

		transaction();
	}

	/**
	 * Load all summaries for a session, ordered by `created_at` ascending.
	 *
	 * @param sessionId - Session identifier to load summaries for
	 * @returns A Promise that resolves to the session's summaries in chronological order
	 */
	public async loadSummaries(sessionId: string): Promise<Summary[]> {
		const stmt = this._db.prepare(
			'SELECT id, session_id, branch_id, root_thought_id, covered_ids, covered_range_start, covered_range_end, topics, aggregate_confidence, created_at, meta FROM summaries WHERE session_id = ? ORDER BY created_at ASC'
		);
		const rows = stmt.all(sessionId) as Array<{
			id: string;
			session_id: string;
			branch_id: string | null;
			root_thought_id: string;
			covered_ids: string;
			covered_range_start: number;
			covered_range_end: number;
			topics: string;
			aggregate_confidence: number;
			created_at: number;
			meta: string | null;
		}>;

		return rows.map((row) => ({
			id: row.id,
			sessionId: row.session_id as Summary['sessionId'],
			...(row.branch_id !== null ? { branchId: asBranchId(row.branch_id) } : {}),
			rootThoughtId: row.root_thought_id as Summary['rootThoughtId'],
			coveredIds: JSON.parse(row.covered_ids) as unknown as Summary['coveredIds'],
			coveredRange: [row.covered_range_start, row.covered_range_end] as [number, number],
			topics: JSON.parse(row.topics) as unknown as string[],
			aggregateConfidence: row.aggregate_confidence,
			createdAt: row.created_at,
			...(row.meta ? { meta: JSON.parse(row.meta) as unknown as Record<string, unknown> } : {}),
		}));
	}

	/**
	 * Get statistics about the persisted data.
	 */
	public getStats(): {
		thoughtCount: number;
		branchCount: number;
		dbSize: number;
	} {
		const thoughtStmt = this._db.prepare('SELECT COUNT(*) as count FROM thoughts');
		const { count: thoughtCount } = thoughtStmt.get() as { count: number };

		let branchCount = 0;
		if (this._persistBranches) {
			const branchStmt = this._db.prepare('SELECT COUNT(*) as count FROM branches');
			const result = branchStmt.get() as { count: number } | undefined;
			branchCount = result?.count ?? 0;
		}

		return {
			thoughtCount,
			branchCount,
			dbSize: 0, // Would need to check file size
		};
	}
}
