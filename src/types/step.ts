/**
 * Step recommendation type for coordinated multi-step thought processes.
 *
 * @module types/step
 */

import type { ToolRecommendation } from './tool.js';
import type { SkillRecommendation } from './skill.js';

/**
 * Represents a coordinated step in a multi-step thought process.
 *
 * Step recommendations combine tool and skill recommendations to provide
 * a comprehensive plan for completing a specific task, including expected
 * outcomes and conditions for moving to the next step.
 *
 * @example
 * ```typescript
 * const step: StepRecommendation = {
 *   step_description: 'Search for TypeScript documentation',
 *   recommended_tools: [
 *     {
 *       tool_name: 'mcp__tavily-mcp__tavily-search',
 *       confidence: 0.9,
 *       rationale: 'Best for web search',
 *       priority: 1
 *     }
 *   ],
 *   recommended_skills: [],
 *   expected_outcome: 'Search results with TypeScript documentation links',
 *   next_step_conditions: ['If no results found, try broader search terms']
 * };
 * ```
 */
export interface StepRecommendation {
	/** Human-readable description of what needs to be done in this step. */
	step_description: string;

	/** Array of tools recommended for this step, ordered by priority. */
	recommended_tools: ToolRecommendation[];

	/** Optional array of skills recommended for this step. */
	recommended_skills?: SkillRecommendation[];

	/** Description of what to expect after completing this step. */
	expected_outcome: string;

	/** Optional conditions to consider when determining the next step. */
	next_step_conditions?: string[];
}
