import type { PersistenceBackend, PersistenceConfig } from './PersistenceBackend.js';
import type { ThoughtData } from '../types.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

/**
 * SQLite-based persistence backend.
 *
 * Provides efficient, transactional persistence using SQLite.
 * Requires the 'better-sqlite3' package to be installed.
 *
 * @example
 * ```typescript
 * const backend = new SqlitePersistence({
 *   dbPath: './data/history.db',
 *   enableWAL: true
 * });
 * ```
 */
export class SqlitePersistence implements PersistenceBackend {
	private _db: any; // Database instance (loaded dynamically)
	private _dbPath: string;
	private _maxHistorySize: number;
	private _persistBranches: boolean;

	constructor(options?: PersistenceConfig['options']) {
		// Default to .claude/data in current directory or home directory
		const defaultDataDir = existsSync('.claude/data') ? '.claude/data' : join(homedir(), '.claude/data');
		this._dbPath = options?.dbPath ?? join(defaultDataDir, 'history.db');
		this._maxHistorySize = options?.maxHistorySize ?? 10000;
		this._persistBranches = options?.persistBranches ?? true;

		// Load better-sqlite3 dynamically
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const Database = require('better-sqlite3');
			this._db = new Database(this._dbPath);

			// Enable WAL mode for better concurrency if specified
			if (options?.enableWAL !== false) {
				this._db.pragma('journal_mode = WAL');
			}

			this._initializeSchema();
		} catch (error) {
			throw new Error(
				`SQLite persistence requires 'better-sqlite3' package. Install it with: npm install better-sqlite3`
			);
		}
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

		return rows.map((row) => {
			try {
				return JSON.parse(row.data) as ThoughtData;
			} catch {
				return null;
			}
		}).filter((t): t is ThoughtData => t !== null);
	}

	public async saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void> {
		if (!this._persistBranches) {
			return;
		}

		const stmt = this._db.prepare(
			'INSERT OR REPLACE INTO branches (branch_id, data, updated_at) VALUES (?, ?, strftime("%s", "now"))'
		);
		stmt.run(branchId, JSON.stringify(thoughts));
	}

	public async loadBranch(branchId: string): Promise<ThoughtData[] | undefined> {
		if (!this._persistBranches) {
			return undefined;
		}

		const stmt = this._db.prepare('SELECT data FROM branches WHERE branch_id = ?');
		const row = stmt.get(branchId) as { data: string } | undefined;

		if (!row) {
			return undefined;
		}

		try {
			const data = JSON.parse(row.data) as ThoughtData[];
			return Array.isArray(data) ? data : undefined;
		} catch {
			return undefined;
		}
	}

	public async clear(): Promise<void> {
		this._db.exec('DELETE FROM thoughts');
		if (this._persistBranches) {
			this._db.exec('DELETE FROM branches');
		}
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
	 * Close the database connection.
	 * Call this when shutting down the application.
	 */
	public close(): void {
		if (this._db) {
			this._db.close();
			this._db = null;
		}
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
