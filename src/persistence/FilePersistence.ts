import type { PersistenceBackend, PersistenceConfig } from './PersistenceBackend.js';
import type { ThoughtData } from '../types.js';
import type { IMetrics } from '../contracts/index.js';
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

/**
 * File-based persistence backend using JSON files.
 *
 * Stores thoughts and branches as JSON files in a configured directory.
 * Simple and reliable, with no external dependencies.
 *
 * File structure:
 * ```
 * dataDir/
 *   history.json          # Main thought history
 *   branches/
 *     <branch-id>.json    # Individual branch files
 * ```
 */
export class FilePersistence implements PersistenceBackend {
	private _dataDir: string;
	private _historyPath: string;
	private _branchesDir: string;
	private _maxHistorySize: number;
	private _persistBranches: boolean;
	private _metrics?: IMetrics;

	constructor(options?: PersistenceConfig['options'] & { metrics?: IMetrics }) {
		// Default to .claude/data in current directory or home directory
		const defaultDataDir = existsSync('.claude/data')
			? '.claude/data'
			: join(homedir(), '.claude/data');
		this._dataDir = options?.dataDir ?? defaultDataDir;
		this._historyPath = join(this._dataDir, 'history.json');
		this._branchesDir = join(this._dataDir, 'branches');
		this._maxHistorySize = options?.maxHistorySize ?? 10000;
		this._persistBranches = options?.persistBranches ?? true;
		this._metrics = options?.metrics;
	}

	private _recordOperationDuration(operation: string, startTime: number): void {
		const durationSeconds = (Date.now() - startTime) / 1000;
		this._metrics?.histogram('persistence_op_duration_seconds', durationSeconds, { operation });
	}

	/**
	 * Initialize the persistence directory structure.
	 */
	private async _ensureDirectories(): Promise<void> {
		if (!existsSync(this._dataDir)) {
			await mkdir(this._dataDir, { recursive: true });
		}
		if (this._persistBranches && !existsSync(this._branchesDir)) {
			await mkdir(this._branchesDir, { recursive: true });
		}
	}

	/**
	 * Validates branch ID format and resolves the path safely.
	 *
	 * This method provides defense-in-depth security by:
	 * 1. Validating the branch ID format (alphanumeric, hyphens, underscores only)
	 * 2. Preventing path traversal attacks
	 *
	 * @param branchId - The branch ID to validate and resolve
	 * @returns The safe, resolved branch file path
	 * @throws Error if branch ID is invalid or path traversal is detected
	 */
	private _safeBranchPath(branchId: string): string {
		// Validate format first (must be alphanumeric with hyphens/underscores, 1-64 chars)
		const validBranchIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;
		if (!validBranchIdPattern.test(branchId)) {
			throw new Error(
				`Invalid branch ID: must be 1-64 alphanumeric characters, hyphens, or underscores only`
			);
		}

		const resolved = resolve(this._branchesDir, `${branchId}.json`);
		const normalizedBranchesDir = resolve(this._branchesDir);

		// Ensure the resolved path is still within branches directory
		if (!resolved.startsWith(normalizedBranchesDir + sep)) {
			throw new Error(`Invalid branch ID: path traversal detected`);
		}

		return resolved;
	}

	public async saveThought(thought: ThoughtData): Promise<void> {
		const startTime = Date.now();
		try {
			await this._ensureDirectories();

			const history = await this.loadHistory();
			history.push(thought);

			if (history.length > this._maxHistorySize) {
				history.splice(0, history.length - this._maxHistorySize);
			}

			await writeFile(this._historyPath, JSON.stringify(history, null, 2), 'utf-8');
		} finally {
			this._recordOperationDuration('save_thought', startTime);
		}
	}

	public async loadHistory(): Promise<ThoughtData[]> {
		const startTime = Date.now();
		try {
			if (!existsSync(this._historyPath)) {
				return [];
			}

			const content = await readFile(this._historyPath, 'utf-8');
			const data = JSON.parse(content) as ThoughtData[];

			// Validate and filter
			return Array.isArray(data) ? data : [];
		} catch {
			// If file is corrupted, start fresh
			return [];
		} finally {
			this._recordOperationDuration('load_history', startTime);
		}
	}

	public async saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void> {
		const startTime = Date.now();
		try {
			if (!this._persistBranches) {
				return;
			}

			await this._ensureDirectories();

			const branchPath = this._safeBranchPath(branchId);
			await writeFile(branchPath, JSON.stringify(thoughts, null, 2), 'utf-8');
		} finally {
			this._recordOperationDuration('save_branch', startTime);
		}
	}

	public async loadBranch(branchId: string): Promise<ThoughtData[] | undefined> {
		const startTime = Date.now();
		try {
			if (!this._persistBranches) {
				return undefined;
			}

			const branchPath = this._safeBranchPath(branchId);

			try {
				if (!existsSync(branchPath)) {
					return undefined;
				}

				const content = await readFile(branchPath, 'utf-8');
				const data = JSON.parse(content) as ThoughtData[];

				return Array.isArray(data) ? data : undefined;
			} catch {
				return undefined;
			}
		} finally {
			this._recordOperationDuration('load_branch', startTime);
		}
	}

	public async listBranches(): Promise<string[]> {
		return this.getBranchIds();
	}

	public async clear(): Promise<void> {
		try {
			// Clear history
			if (existsSync(this._historyPath)) {
				await unlink(this._historyPath);
			}

			// Clear all branches
			if (this._persistBranches && existsSync(this._branchesDir)) {
				const files = await readdir(this._branchesDir);
				for (const file of files) {
					if (file.endsWith('.json')) {
						await unlink(join(this._branchesDir, file));
					}
				}
			}
		} catch {
			// Ignore errors during clear
		}
	}

	public async healthy(): Promise<boolean> {
		try {
			await this._ensureDirectories();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the data directory path.
	 */
	public getDataDir(): string {
		return this._dataDir;
	}

	/**
	 * Get all branch IDs that are persisted.
	 */
	public async getBranchIds(): Promise<string[]> {
		if (!this._persistBranches || !existsSync(this._branchesDir)) {
			return [];
		}

		try {
			const files = await readdir(this._branchesDir);
			return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
		} catch {
			return [];
		}
	}

	/**
	 * Close the backend and release resources.
	 * No resources to release for file backend.
	 */
	public async close(): Promise<void> {
		// No-op for file backend (files are already flushed on write)
	}
}
