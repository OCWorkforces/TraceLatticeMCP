/**
 * Skill types for MCP skill recommendations and definitions.
 *
 * @module types/skill
 */

/**
 * Represents a recommended skill with associated metadata.
 *
 * Skills are higher-level workflows that coordinate multiple tools and operations.
 * Skill recommendations include information about which tools the skill is allowed
 * to use and whether the skill can be invoked directly by users.
 *
 * @example
 * ```typescript
 * const recommendation: SkillRecommendation = {
 *   skill_name: 'commit',
 *   confidence: 0.95,
 *   rationale: 'Handles the complete git commit workflow',
 *   priority: 1,
 *   alternatives: ['review-pr'],
 *   allowed_tools: ['Bash', 'Read', 'Grep'],
 *   user_invocable: true
 * };
 * ```
 */
export interface SkillRecommendation {
	/** The unique name/identifier of the recommended skill. */
	skill_name: string;

	/** Confidence score from 0-1 indicating how appropriate this skill is for the current task. */
	confidence: number;

	/** Explanation of why this skill is recommended and how it addresses the current need. */
	rationale: string;

	/** Order in the recommendation sequence (lower numbers = higher priority). */
	priority: number;

	/** Alternative skills that could be used if the primary recommendation is not available. */
	alternatives?: string[];

	/** List of tool names this skill is allowed to use during execution. */
	allowed_tools?: string[];

	/** Whether this skill can be directly invoked by users (via slash commands). */
	user_invocable?: boolean;
}

/**
 * Defines a skill that coordinates multiple tools and operations.
 *
 * Skills are higher-level workflows that can be invoked directly
 * by users (via slash commands) or recommended by the sequential
 * thinking process.
 *
 * @example
 * ```typescript
 * const skill: Skill = {
 *   name: 'commit',
 *   description: 'Create a git commit with proper message formatting',
 *   user_invocable: true,
 *   allowed_tools: ['Bash', 'Read', 'Grep']
 * };
 * ```
 */
export interface Skill {
	/** Unique identifier for the skill. */
	name: string;

	/** Human-readable description of what the skill does. */
	description: string;

	/** Whether users can invoke this skill directly via slash commands. */
	user_invocable?: boolean;

	/** List of tool names this skill is allowed to use. */
	allowed_tools?: string[];
}
