/**
 * Core data structure for a thought in the sequential thinking process.
 *
 * @module types/thought
 */

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
}
