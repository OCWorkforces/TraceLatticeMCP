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
	private thought_history: ThoughtData[] = [];
	private branches: Record<string, ThoughtData[]> = {};
	private maxHistorySize: number;
	private maxBranches: number;
	private maxBranchSize: number;
	private logger: StructuredLogger | null;
	public tools: ToolRegistry;
	public skills: SkillRegistry;

	constructor(config: HistoryManagerConfig = {}) {
		this.maxHistorySize = config.maxHistorySize || 1000;
		this.maxBranches = config.maxBranches || 50;
		this.maxBranchSize = config.maxBranchSize || 100;
		this.logger = config.logger || null;
		this.tools = new ToolRegistry(config.logger);
		this.skills = new SkillRegistry(config.logger);
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		if (this.logger) {
			this.logger.info(message, meta);
		} else {
			console.error(message); // Fallback for backward compatibility
		}
	}

	public addThought(thought: ThoughtData): void {
		this.thought_history.push(thought);

		if (this.thought_history.length > this.maxHistorySize) {
			this.thought_history = this.thought_history.slice(-this.maxHistorySize);
			this.log(`History trimmed to ${this.maxHistorySize} items`, { maxSize: this.maxHistorySize });
		}

		if (thought.branch_from_thought && thought.branch_id) {
			this.addToBranch(thought.branch_id, thought);
		}
	}

	private addToBranch(branchId: string, thought: ThoughtData): void {
		if (!this.branches[branchId]) {
			this.branches[branchId] = [];
		}

		this.trimBranchSize(branchId);
		this.branches[branchId].push(thought);

		if (Object.keys(this.branches).length > this.maxBranches) {
			this.cleanupBranches();
		}
	}

	private cleanupBranches(): void {
		const branchCount = Object.keys(this.branches).length;
		if (branchCount > this.maxBranches) {
			const branchesToRemove = Object.keys(this.branches).slice(0, branchCount - this.maxBranches);
			for (const branchId of branchesToRemove) {
				delete this.branches[branchId];
				this.log(`Removed old branch: ${branchId}`, { branchId });
			}
		}
	}

	private trimBranchSize(branchId: string): void {
		if (this.branches[branchId].length > this.maxBranchSize) {
			const removed = this.branches[branchId].length - this.maxBranchSize;
			this.branches[branchId] = this.branches[branchId].slice(-this.maxBranchSize);
			this.log(`Trimmed branch '${branchId}': removed ${removed} old thoughts`, { branchId, removed });
		}
	}

	public getHistory(): ThoughtData[] {
		return this.thought_history;
	}

	public getHistoryLength(): number {
		return this.thought_history.length;
	}

	public getBranches(): Record<string, ThoughtData[]> {
		return this.branches;
	}

	public getBranchIds(): string[] {
		return Object.keys(this.branches);
	}

	public getBranch(branchId: string): ThoughtData[] | undefined {
		return this.branches[branchId];
	}

	public clear(): void {
		this.thought_history = [];
		this.branches = {};
		this.log('History cleared');
	}
}
