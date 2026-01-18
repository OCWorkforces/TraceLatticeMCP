/**
 * Display formatting for thoughts and recommendations.
 *
 * This module provides the `ThoughtFormatter` class which handles all
 * presentation logic for thought data, including boxed output formatting
 * and structured display of tool/skill recommendations.
 *
 * @module formatter
 */

import type { ThoughtData, StepRecommendation } from '../types.js';
import chalk from 'chalk';

/**
 * Formatter for thought data and step recommendations.
 *
 * This class separates presentation concerns from business logic, providing
 * visually appealing, boxed output for thoughts with structured display of
 * tool and skill recommendations.
 *
 * @remarks
 * Output Format example shows a boxed thought with visual indicators.
 * Visual Indicators:
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
	 * // Output:
	 * // Step: Search for API endpoints
	 * // Recommended Tools:
	 * //   - Grep (priority: 1)
	 * //     Rationale: Best for searching code patterns
	 * //     Suggested inputs: {"pattern":"export.*function"}
	 * // Expected Outcome: List of all exported API functions
	 * // Conditions for next step:
	 * //   - If no results, try broader pattern
	 * ```
	 */
	public formatRecommendation(step: StepRecommendation): string {
		const tools = step.recommended_tools
			.map((tool) => {
				const alternatives = tool.alternatives?.length
					? ` (alternatives: ${tool.alternatives.join(', ')})`
					: '';
				const inputs = tool.suggested_inputs
					? `\n    Suggested inputs: ${JSON.stringify(tool.suggested_inputs)}`
					: '';
				return `  - ${tool.tool_name} (priority: ${tool.priority})${alternatives}
    Rationale: ${tool.rationale}${inputs}`;
			})
			.join('\n');

		const skills = step.recommended_skills?.length
			? step.recommended_skills
					.map((skill) => {
						const alternatives = skill.alternatives?.length
							? ` (alternatives: ${skill.alternatives.join(', ')})`
							: '';
						const toolsInfo = skill.allowed_tools?.length
							? `\n    Allowed tools: ${skill.allowed_tools.join(', ')}`
							: '';
						return `  - ${skill.skill_name} (priority: ${skill.priority})${alternatives}
    Rationale: ${skill.rationale}${toolsInfo}`;
					})
					.join('\n')
			: '';

		let output = `Step: ${step.step_description}`;

		if (step.recommended_tools?.length) {
			output += `\nRecommended Tools:\n${tools}`;
		}

		if (skills) {
			output += `\nRecommended Skills:\n${skills}`;
		}

		output += `\nExpected Outcome: ${step.expected_outcome}${
			step.next_step_conditions
				? `\nConditions for next step:\n  - ${step.next_step_conditions.join('\n  - ')}`
				: ''
		}`;

		return output;
	}

	/**
	 * Formats a thought into a visually appealing boxed display.
	 *
	 * Creates a bordered box containing the thought content with an appropriate
	 * header indicating whether this is a regular thought, revision, or branch.
	 * Any current step recommendation is appended below the box.
	 *
	 * @param thoughtData - The thought data to format
	 * @returns A formatted string with boxed thought and recommendations
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
	 * // 💭 Thought 1/3
	 *
	 * // Revision thought
	 * const revision = formatter.formatThought({
	 *   thought: 'Actually, I should read the README first',
	 *   thought_number: 2,
	 *   total_thoughts: 3,
	 *   is_revision: true,
	 *   revises_thought: 1,
	 *   next_thought_needed: true
	 * });
	 * // 🔄 Revision 2/3 (revising thought 1)
	 *
	 * // Branch thought
	 * const branch = formatter.formatThought({
	 *   thought: 'Let me try a different approach',
	 *   thought_number: 1,
	 *   total_thoughts: 2,
	 *   branch_from_thought: 5,
	 *   branch_id: 'alt-approach',
	 *   next_thought_needed: true
	 * });
	 * // 🌿 Branch 1/2 (from thought 5, ID: alt-approach)
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
			branch_id,
			current_step,
		} = thoughtData;

		let prefix = '';
		let context = '';

		if (is_revision) {
			prefix = chalk.yellow('🔄 Revision');
			context = ` (revising thought ${revises_thought})`;
		} else if (branch_from_thought) {
			prefix = chalk.green('🌿 Branch');
			context = ` (from thought ${branch_from_thought}, ID: ${branch_id})`;
		} else {
			prefix = chalk.blue('💭 Thought');
			context = '';
		}

		const header = `${prefix} ${thought_number}/${total_thoughts}${context}`;
		let content = thought;

		if (current_step) {
			content = `${thought}\n\nRecommendation:\n${this.formatRecommendation(current_step)}`;
		}

		const border = '─'.repeat(Math.max(header.length, content.length) + 4);

		return `
 ┌${border}┐
 │ ${header} │
 ├${border}┤
 │ ${content.padEnd(border.length - 2)} │
 └${border}┘`;
	}
}
