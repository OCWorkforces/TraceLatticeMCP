import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { IMetrics } from '../contracts/interfaces.js';
import type { ThoughtData } from '../core/thought.js';
import type { Edge } from '../core/graph/Edge.js';
import type { Summary } from '../core/compression/Summary.js';
import type { PersistenceBackend, PersistenceConfig } from '../contracts/PersistenceBackend.js';
import { asBranchId, type BranchId } from '../contracts/ids.js';

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
	private _edgesDir: string;
	private _summariesDir: string;
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
		this._edgesDir = join(this._dataDir, 'edges');
		this._summariesDir = join(this._dataDir, 'summaries');
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
		if (!existsSync(this._edgesDir)) {
			await mkdir(this._edgesDir, { recursive: true });
		}
		if (!existsSync(this._summariesDir)) {
			await mkdir(this._summariesDir, { recursive: true });
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
			const data = JSON.parse(content) as unknown as ThoughtData[];

			// Validate and filter
			return Array.isArray(data) ? data : [];
		} catch {
			// If file is corrupted, start fresh
			return [];
		} finally {
			this._recordOperationDuration('load_history', startTime);
		}
	}

	public async saveBranch(branchId: BranchId, thoughts: ThoughtData[]): Promise<void> {
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

	public async loadBranch(branchId: BranchId): Promise<ThoughtData[] | undefined> {
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
				const data = JSON.parse(content) as unknown as ThoughtData[];

				return Array.isArray(data) ? data : undefined;
			} catch {
				return undefined;
			}
		} finally {
			this._recordOperationDuration('load_branch', startTime);
		}
	}

	public async listBranches(): Promise<BranchId[]> {
		return (await this.getBranchIds()).map((id) => asBranchId(id));
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

			// Clear all edges
			if (existsSync(this._edgesDir)) {
				const edgeFiles = await readdir(this._edgesDir);
				for (const file of edgeFiles) {
					if (file.endsWith('.json')) {
						await unlink(join(this._edgesDir, file));
					}
				}
			}

			// Clear all summaries
			if (existsSync(this._summariesDir)) {
				const summaryFiles = await readdir(this._summariesDir);
				for (const file of summaryFiles) {
					if (file.endsWith('.json')) {
						await unlink(join(this._summariesDir, file));
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

	/**
	 * Validates session ID format and resolves the edge file path safely.
	 *
	 * @param sessionId - The session ID to validate and resolve
	 * @returns The safe, resolved edge file path
	 * @throws Error if session ID is invalid or path traversal is detected
	 */
	private _safeEdgePath(sessionId: string): string {
		const validSessionIdPattern = /^[a-zA-Z0-9_-]{1,100}$/;
		if (!validSessionIdPattern.test(sessionId)) {
			throw new Error(
				`Invalid session ID for edges: must be 1-100 alphanumeric characters, hyphens, or underscores only`
			);
		}

		const resolved = resolve(this._edgesDir, `${sessionId}.json`);
		const normalizedEdgesDir = resolve(this._edgesDir);

		if (!resolved.startsWith(normalizedEdgesDir + sep)) {
			throw new Error(`Invalid session ID: path traversal detected`);
		}

		return resolved;
	}

	/**
	 * Save edges for a session to a JSON file.
	 *
	 * @param sessionId - The session ID
	 * @param edges - Edges to persist (sorted by createdAt before write)
	 */
	public async saveEdges(sessionId: string, edges: readonly Edge[]): Promise<void> {
		const startTime = Date.now();
		try {
			await this._ensureDirectories();

			if (!existsSync(this._edgesDir)) {
				await mkdir(this._edgesDir, { recursive: true });
			}

			const edgePath = this._safeEdgePath(sessionId);

			if (edges.length === 0) {
				if (existsSync(edgePath)) {
					await unlink(edgePath);
				}
				return;
			}

			const sorted = [...edges].sort((a, b) => a.createdAt - b.createdAt);
			await writeFile(edgePath, JSON.stringify(sorted, null, 2), 'utf-8');
		} finally {
			this._recordOperationDuration('save_edges', startTime);
		}
	}

	/**
	 * Load edges for a session from a JSON file.
	 *
	 * @param sessionId - The session ID
	 * @returns Edges array (empty if file is missing or corrupted)
	 */
	public async loadEdges(sessionId: string): Promise<Edge[]> {
		const startTime = Date.now();
		try {
			const edgePath = this._safeEdgePath(sessionId);

			if (!existsSync(edgePath)) {
				return [];
			}

			try {
				const content = await readFile(edgePath, 'utf-8');
				const data = JSON.parse(content) as unknown as Edge[];
				return Array.isArray(data) ? data : [];
			} catch {
				return [];
			}
		} finally {
			this._recordOperationDuration('load_edges', startTime);
		}
	}

	/**
	 * List all session IDs that have persisted edge files.
	 *
	 * @returns Array of session identifiers (filenames without .json extension)
	 */
	public async listEdgeSessions(): Promise<string[]> {
		try {
			const files = await readdir(this._edgesDir);
			return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
		} catch {
			return [];
		}
	}

	/**
	 * Validates session ID format and resolves the summary file path safely.
	 *
	 * @param sessionId - The session ID to validate and resolve
	 * @returns The safe, resolved summary file path
	 * @throws Error if session ID is invalid or path traversal is detected
	 */
	private _safeSummaryPath(sessionId: string): string {
		const validSessionIdPattern = /^[a-zA-Z0-9_-]{1,100}$/;
		if (!validSessionIdPattern.test(sessionId)) {
			throw new Error(
				`Invalid session ID for summaries: must be 1-100 alphanumeric characters, hyphens, or underscores only`
			);
		}

		const resolved = resolve(this._summariesDir, `${sessionId}.json`);
		const normalizedSummariesDir = resolve(this._summariesDir);

		if (!resolved.startsWith(normalizedSummariesDir + sep)) {
			throw new Error(`Invalid session ID: path traversal detected`);
		}

		return resolved;
	}

	/**
	 * Save summaries for a session to a JSON file using an atomic
	 * write (tmp file + rename) to prevent partial-write corruption.
	 *
	 * @param sessionId - The session ID
	 * @param summaries - Summaries to persist (sorted by createdAt before write)
	 */
	public async saveSummaries(sessionId: string, summaries: readonly Summary[]): Promise<void> {
		const startTime = Date.now();
		try {
			await this._ensureDirectories();

			if (!existsSync(this._summariesDir)) {
				await mkdir(this._summariesDir, { recursive: true });
			}

			const summaryPath = this._safeSummaryPath(sessionId);

			if (summaries.length === 0) {
				if (existsSync(summaryPath)) {
					await unlink(summaryPath);
				}
				return;
			}

			const sorted = [...summaries].sort((a, b) => a.createdAt - b.createdAt);
			const tmpPath = `${summaryPath}.tmp`;
			await writeFile(tmpPath, JSON.stringify(sorted, null, 2), 'utf-8');
			await rename(tmpPath, summaryPath);
		} finally {
			this._recordOperationDuration('save_summaries', startTime);
		}
	}

	/**
	 * Load summaries for a session from a JSON file.
	 *
	 * @param sessionId - The session ID
	 * @returns Summaries array (empty if file is missing or corrupted)
	 */
	public async loadSummaries(sessionId: string): Promise<Summary[]> {
		const startTime = Date.now();
		try {
			const summaryPath = this._safeSummaryPath(sessionId);

			if (!existsSync(summaryPath)) {
				return [];
			}

			try {
				const content = await readFile(summaryPath, 'utf-8');
				const data = JSON.parse(content) as unknown as Summary[];
				if (!Array.isArray(data)) return [];
				return [...data].sort((a, b) => a.createdAt - b.createdAt);
			} catch {
				return [];
			}
		} finally {
			this._recordOperationDuration('load_summaries', startTime);
		}
	}
}
