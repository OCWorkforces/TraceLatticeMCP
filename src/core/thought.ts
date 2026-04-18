/**
 * Core data structure for a thought in the sequential thinking process.
 *
 * @module types/thought
 */

import type { ThoughtType } from './reasoning.js';
import type { StepRecommendation } from './step.js';

/**
 * Core data structure for a thought in the sequential thinking process.
 *
 * Thoughts represent individual reasoning steps that can be chained together
 * to form complex reasoning chains. Each thought can reference previous thoughts,
 * create branches, and include tool/skill recommendations.
 *
 * @remarks
 * - Thoughts are numbered sequentially within a branch
 * - Branching allows exploring alternative reasoning paths
 * - Revisions allow correcting or updating previous thoughts
 * - The `next_thought_needed` flag controls continuation
 *
 * @example
 * ```typescript
 * const thought: ThoughtData = {
 *   available_mcp_tools: ['Read', 'Write', 'Bash'],
 *   available_skills: ['commit', 'pdf'],
 *   thought: 'I should read the package.json to understand dependencies',
 *   thought_number: 1,
 *   total_thoughts: 5,
 *   next_thought_needed: true,
 *   current_step: {
 *     step_description: 'Read package.json',
 *     recommended_tools: [{
 *       tool_name: 'Read',
 *       confidence: 1.0,
 *       rationale: 'Direct file reading',
 *       priority: 1
 *     }],
 *     expected_outcome: 'Contents of package.json'
 *   }
 * };
 * ```
 */
export interface ThoughtData {
	/** Array of MCP tool names available for recommendation. */
	available_mcp_tools?: string[];

	/** Array of skill names available for recommendation. */
	available_skills?: string[];

	/** The current thinking step or reasoning content. */
	thought: string;

	/**
	 * Unique identifier for this thought (ulid).
	 * Auto-generated when not provided. Used as stable DAG node identity.
	 * Required for DAG edge references; falls back to thought_number for backward compat.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, id: '01H0X0X0X0X0X0X0X0X0X0X0X0' };
	 * ```
	 */
	id?: string;

	/** Current thought number in the sequence (1-indexed). */
	thought_number: number;

	/** Estimated total number of thoughts (can be adjusted during processing). */
	total_thoughts: number;

	/** Whether this thought revises a previous thought. */
	is_revision?: boolean;

	/** If revising, the thought number being revised. */
	revises_thought?: number;

	/** If branching, the thought number to branch from. */
	branch_from_thought?: number;

	/** Unique identifier for the branch this thought belongs to. */
	branch_id?: string;

	/** Whether more thoughts are needed beyond the current `total_thoughts`. */
	needs_more_thoughts?: boolean;

	/** Whether another thought should be generated (required field). */
	next_thought_needed: boolean;

	/** The current step recommendation being considered. */
	current_step?: StepRecommendation;

	/** Steps that have already been recommended in previous thoughts. */
	previous_steps?: StepRecommendation[];

	/** High-level descriptions of upcoming steps yet to be recommended. */
	remaining_steps?: string[];

	/**
	 * Classified purpose of this thought step.
	 * Enables type-specific formatting, evaluation, and analytics.
	 * Default: 'regular'.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, thought_type: 'hypothesis' };
	 * ```
	 */
	thought_type?: ThoughtType;

	/**
	 * LLM's self-assessed quality score for this thought (0-1).
	 * Higher values indicate better quality.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, quality_score: 0.85 };
	 * ```
	 */
	quality_score?: number;

	/**
	 * LLM's explicit confidence in this thought's correctness (0-1).
	 * Higher values indicate more certainty.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, confidence: 0.9 };
	 * ```
	 */
	confidence?: number;

	/**
	 * Links this thought to a hypothesis for tracking verification chains.
	 * Format: alphanumeric, hyphens, underscores, 1-50 chars.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, hypothesis_id: 'perf-bottleneck-1' };
	 * ```
	 */
	hypothesis_id?: string;

	/**
	 * If verification or critique, which thought_number is being evaluated.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, thought_type: 'verification', verification_target: 3 };
	 * ```
	 */
	verification_target?: number;

	/**
	 * If synthesis, which thought_numbers are being combined.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, thought_type: 'synthesis', synthesis_sources: [2, 5, 7] };
	 * ```
	 */
	synthesis_sources?: number[];

	/**
	 * For DAG merge: thought_numbers from other branches being merged into current context.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, merge_from_thoughts: [4, 8] };
	 * ```
	 */
	merge_from_thoughts?: number[];

	/**
	 * For DAG merge: branch_ids being merged into current context.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, merge_branch_ids: ['explore-a', 'explore-b'] };
	 * ```
	 */
	merge_branch_ids?: string[];

	/**
	 * Free-form metacognitive observation about the reasoning process itself.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, meta_observation: 'I am over-exploring branches' };
	 * ```
	 */
	meta_observation?: string;

	/**
	 * Effort signal: how deep should reasoning go for this thought.
	 * Default: 'moderate'.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, reasoning_depth: 'deep' };
	 * ```
	 */
	reasoning_depth?: 'shallow' | 'moderate' | 'deep';

	/**
	 * Optional session identifier for state isolation.
	 * When provided, thought history, branches, and statistics are scoped to this session.
	 * Format: alphanumeric, hyphens, underscores, 1-100 chars.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, session_id: 'analysis-task-42' };
	 * ```
	 */
	session_id?: string;

	/**
	 * When true, clears all state for the target session before processing this thought.
	 * The thought is then processed as the first in a fresh session.
	 *
	 * @example
	 * ```typescript
	 * const thought: ThoughtData = { ...base, session_id: 'task-1', reset_state: true };
	 * ```
	 */
	reset_state?: boolean;

	/** Tool name for tool_call thoughts */
	tool_name?: string;

	/** Arguments for the tool invocation */
	tool_arguments?: Record<string, unknown>;

	/** Result returned by the tool (for tool_observation) */
	tool_result?: unknown;

	/** Continuation token linking tool_observation back to suspended tool_call */
	continuation_token?: string;

	/** Sub-problem labels for decomposition thoughts */
	decomposition_children?: string[];

	/** Thought number being backtracked from */
	backtrack_target?: number;

	/**
	 * When true, this thought has been logically retracted by a subsequent
	 * `backtrack` thought. The thought remains in history (append-only,
	 * event-sourcing) but is excluded from quality calculations.
	 * Default: false.
	 */
	retracted?: boolean;

	/**
	 * Internal: thought_number of the tool_call this tool_observation resumes from.
	 * Set transiently by ThoughtProcessor; not part of the public API.
	 * Used by HistoryManager to emit `tool_invocation` DAG edges.
	 */
	_resumedFrom?: number;
}
