import type { ThoughtData, StepRecommendation } from '../types.js';
import chalk from 'chalk';

/**
 * ThoughtFormatter handles display logic for thoughts and recommendations.
 * Separates presentation concerns from business logic.
 */
export class ThoughtFormatter {
	/**
	 * Format a step recommendation into a readable string
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
	 * Format a thought into a visually appealing display
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
