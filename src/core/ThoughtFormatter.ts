/**
 * Display formatting for thoughts and recommendations.
 *
 * This module provides the `ThoughtFormatter` class which handles all
 * presentation logic for thought data, including clean, simple output
 * formatting and structured display of tool/skill recommendations.
 *
 * @module formatter
 */

import type { ThoughtData } from './thought.js';
import type { StepRecommendation } from './step.js';
import chalk from 'chalk';

/**
 * Formatter for thought data and step recommendations.
 *
 * This class separates presentation concerns from business logic, providing
 * clean, readable output for thoughts with structured display of
 * tool and skill recommendations.
 *
 * @remarks
 * Output Format is clean and simple:
 * - 💭 Thought - Regular thought (blue)
 * - 🔄 Revision - Thought that revises a previous thought (yellow)
 * - 🌿 Branch - Thought that creates a new branch (green)
 *
 * @example
 * ```typescript
 * const formatter = new ThoughtFormatter();
 *
 * // Format a thought with recommendations
 * const output = formatter.formatThought({
 *   thought: 'I need to analyze the data structure',
 *   thought_number: 1,
 *   total_thoughts: 3,
 *   next_thought_needed: true,
 *   current_step: {
 *     step_description: 'Analyze data structure',
 *     recommended_tools: [{
 *       tool_name: 'Read',
 *       confidence: 0.95,
 *       rationale: 'Direct file reading',
 *       priority: 1,
 *       suggested_inputs: { file_path: './data/schema.json' }
 *     }],
 *     expected_outcome: 'Understanding of data schema'
 *   }
 * });
 *
 * console.log(output);
 * ```
 */
export class ThoughtFormatter {
	/**
	 * Formats a step recommendation into a readable string.
	 *
	 * Creates a structured display of the step description, recommended tools,
	 * recommended skills, expected outcome, and conditions for the next step.
	 *
	 * @param step - The step recommendation to format
	 * @returns A formatted string representation of the recommendation
	 *
	 * @example
	 * ```typescript
	 * const step: StepRecommendation = {
	 *   step_description: 'Search for API endpoints',
	 *   recommended_tools: [{
	 *     tool_name: 'Grep',
	 *     confidence: 0.9,
	 *     rationale: 'Best for searching code patterns',
	 *     priority: 1,
	 *     suggested_inputs: { pattern: 'export.*function' }
	 *   }],
	 *   expected_outcome: 'List of all exported API functions',
	 *   next_step_conditions: ['If no results, try broader pattern']
	 * };
	 *
	 * const formatted = formatter.formatRecommendation(step);
	 * console.log(formatted);
	 * ```
	 */
	public formatRecommendation(step: StepRecommendation): string {
		const parts: string[] = [];

		// Add tools if present
		if (step.recommended_tools?.length) {
			const toolNames = step.recommended_tools.map((t) => t.tool_name).join(', ');
			parts.push(chalk.cyan(`Tools: ${toolNames}`));
		}

		// Add skills if present
		if (step.recommended_skills?.length) {
			const skillNames = step.recommended_skills.map((s) => s.skill_name).join(', ');
			parts.push(chalk.green(`Skills: ${skillNames}`));
		}

		// Add expected outcome
		if (step.expected_outcome) {
			parts.push(chalk.gray(`→ ${step.expected_outcome}`));
		}

		return parts.join(' | ');
	}

	/**
	 * Formats a thought into a clean, simple display.
	 *
	 * Creates a clean output containing the thought content with an appropriate
	 * header indicating whether this is a regular thought, revision, or branch.
	 * Any current step recommendation is appended below.
	 *
	 * @param thoughtData - The thought data to format
	 * @returns A formatted string with thought and recommendations
	 *
	 * @example
	 * ```typescript
	 * // Regular thought
	 * const regular = formatter.formatThought({
	 *   thought: 'I should read the configuration file',
	 *   thought_number: 1,
	 *   total_thoughts: 3,
	 *   next_thought_needed: true
	 * });
	 * // Output: 💭 Thought 1/3: I should read the configuration file
	 *
	 * // With recommendation
	 * const withRec = formatter.formatThought({
	 *   thought: 'I need to search the codebase',
	 *   thought_number: 1,
	 *   total_thoughts: 3,
	 *   next_thought_needed: true,
	 *   current_step: {
	 *     step_description: 'Search for files',
	 *     recommended_tools: [{ tool_name: 'Grep', priority: 1 }],
	 *     expected_outcome: 'List of matching files'
	 *   }
	 * });
	 * // Output:
	 * // 💭 Thought 1/3: I need to search the codebase
	 * //   → Tools: Grep | List of matching files
	 * ```
	 */
	public formatThought(thoughtData: ThoughtData): string {
		const {
			thought_number,
			total_thoughts,
			thought,
			is_revision,
			revises_thought,
			branch_from_thought,
			current_step,
		} = thoughtData;

		let icon = '';
		let label = 'Thought';
		let suffix = '';

		if (is_revision) {
			icon = chalk.yellow('🔄');
			label = 'Revision';
			suffix = chalk.gray(` (revise #${revises_thought})`);
		} else if (branch_from_thought) {
			icon = chalk.green('🌿');
			label = 'Branch';
			suffix = chalk.gray(` (from #${branch_from_thought})`);
		} else {
			icon = chalk.blue('💭');
		}

		// Build header: "💭 Thought 1/3: "
		const header = `${icon} ${label} ${thought_number}/${total_thoughts}${suffix}: `;

		// Build content lines
		const lines: string[] = [];

		// Add the thought content
		lines.push(`${header}${thought}`);

		// Add recommendation if present
		if (current_step) {
			const recommendation = this.formatRecommendation(current_step);
			lines.push(`  ${recommendation}`);
		}

		return lines.join('\n');
	}
}
