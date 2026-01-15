import type { ThoughtData } from './types.js';
import type { StructuredLogger } from './logger/StructuredLogger.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { SkillRegistry } from './registry/SkillRegistry.js';

export interface HistoryManagerConfig {
	maxHistorySize?: number;
	maxBranches?: number;
	maxBranchSize?: number;
	logger?: StructuredLogger;
}

/**
 * HistoryManager manages thought history and branches with configurable size limits.
 * Handles automatic trimming to prevent memory leaks.
 */
export class HistoryManager {
	private _thought_history: ThoughtData[] = [];
	private _branches: Record<string, ThoughtData[]> = {};
	private _maxHistorySize: number;
	private _maxBranches: number;
	private _maxBranchSize: number;
	private _logger: StructuredLogger | null;
	public tools: ToolRegistry;
	public skills: SkillRegistry;

	constructor(config: HistoryManagerConfig = {}) {
		this._maxHistorySize = config.maxHistorySize || 1000;
		this._maxBranches = config.maxBranches || 50;
		this._maxBranchSize = config.maxBranchSize || 100;
		this._logger = config.logger || null;
		this.tools = new ToolRegistry(config.logger);
		this.skills = new SkillRegistry(config.logger);
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		if (this._logger) {
			this._logger.info(message, meta);
		} else {
			console.error(message); // Fallback for backward compatibility
		}
	}

	public addThought(thought: ThoughtData): void {
		this._thought_history.push(thought);

		if (this._thought_history.length > this._maxHistorySize) {
			this._thought_history = this._thought_history.slice(-this._maxHistorySize);
			this.log(`History trimmed to ${this._maxHistorySize} items`, { maxSize: this._maxHistorySize });
		}

		if (thought.branch_from_thought && thought.branch_id) {
			this.addToBranch(thought.branch_id, thought);
		}
	}

	private addToBranch(branchId: string, thought: ThoughtData): void {
		if (!this._branches[branchId]) {
			this._branches[branchId] = [];
		}

		this.trimBranchSize(branchId);
		this._branches[branchId].push(thought);

		if (Object.keys(this._branches).length > this._maxBranches) {
			this.cleanupBranches();
		}
	}

	private cleanupBranches(): void {
		const branchCount = Object.keys(this._branches).length;
		if (branchCount > this._maxBranches) {
			const branchesToRemove = Object.keys(this._branches).slice(0, branchCount - this._maxBranches);
			for (const branchId of branchesToRemove) {
				delete this._branches[branchId];
				this.log(`Removed old branch: ${branchId}`, { branchId });
			}
		}
	}

	private trimBranchSize(branchId: string): void {
		if (this._branches[branchId].length > this._maxBranchSize) {
			const removed = this._branches[branchId].length - this._maxBranchSize;
			this._branches[branchId] = this._branches[branchId].slice(-this._maxBranchSize);
			this.log(`Trimmed branch '${branchId}': removed ${removed} old thoughts`, { branchId, removed });
		}
	}

	public getHistory(): ThoughtData[] {
		return this._thought_history;
	}

	public getHistoryLength(): number {
		return this._thought_history.length;
	}

	public getBranches(): Record<string, ThoughtData[]> {
		return this._branches;
	}

	public getBranchIds(): string[] {
		return Object.keys(this._branches);
	}

	public getBranch(branchId: string): ThoughtData[] | undefined {
		return this._branches[branchId];
	}

	public clear(): void {
		this._thought_history = [];
		this._branches = {};
		this.log('History cleared');
	}
}
