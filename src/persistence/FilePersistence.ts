import type { PersistenceBackend, PersistenceConfig } from './PersistenceBackend.js';
import type { ThoughtData } from '../types.js';
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

	constructor(options?: PersistenceConfig['options']) {
		// Default to .claude/data in current directory or home directory
		const defaultDataDir = existsSync('.claude/data') ? '.claude/data' : join(homedir(), '.claude/data');
		this._dataDir = options?.dataDir ?? defaultDataDir;
		this._historyPath = join(this._dataDir, 'history.json');
		this._branchesDir = join(this._dataDir, 'branches');
		this._maxHistorySize = options?.maxHistorySize ?? 10000;
		this._persistBranches = options?.persistBranches ?? true;
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

	public async saveThought(thought: ThoughtData): Promise<void> {
		await this._ensureDirectories();

		// Load existing history
		const history = await this.loadHistory();

		// Add new thought
		history.push(thought);

		// Trim to max size if needed
		if (history.length > this._maxHistorySize) {
			history.splice(0, history.length - this._maxHistorySize);
		}

		// Save back to file
		await writeFile(this._historyPath, JSON.stringify(history, null, 2), 'utf-8');
	}

	public async loadHistory(): Promise<ThoughtData[]> {
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
		}
	}

	public async saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void> {
		if (!this._persistBranches) {
			return;
		}

		await this._ensureDirectories();

		const branchPath = join(this._branchesDir, `${branchId}.json`);
		await writeFile(branchPath, JSON.stringify(thoughts, null, 2), 'utf-8');
	}

	public async loadBranch(branchId: string): Promise<ThoughtData[] | undefined> {
		if (!this._persistBranches) {
			return undefined;
		}

		const branchPath = join(this._branchesDir, `${branchId}.json`);

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
			return files
				.filter((f) => f.endsWith('.json'))
				.map((f) => f.replace('.json', ''));
		} catch {
			return [];
		}
	}
}
