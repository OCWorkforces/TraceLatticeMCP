import type { ThoughtData } from '../types.js';
import type { StructuredLogger } from '../logger/StructuredLogger.js';
import { HistoryManager } from '../HistoryManager.js';
import { ThoughtFormatter } from '../formatter/ThoughtFormatter.js';

/**
 * CallToolResult is the return type expected by MCP tools
 */
export interface CallToolResult {
	content: Array<{
		type: 'text';
		text: string;
	}>;
	isError?: boolean;
}

/**
 * ThoughtProcessor handles core logic and validation for thought processing.
 * Coordinates between history management and formatting.
 */
export class ThoughtProcessor {
	private _logger: StructuredLogger | null;

	constructor(
		private historyManager: HistoryManager,
		private thoughtFormatter: ThoughtFormatter,
		logger?: StructuredLogger
	) {
		this._logger = logger || null;
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		if (this._logger) {
			this._logger.info(message, meta);
		} else {
			console.error(message); // Fallback for backward compatibility
		}
	}

	/**
	 * Process a thought step through the sequential thinking pipeline
	 */
	public async process(input: ThoughtData): Promise<CallToolResult> {
		try {
			const validatedInput = this.validateInput(input);

			this.historyManager.addThought(validatedInput);

			const formattedThought = this.thoughtFormatter.formatThought(validatedInput);
			this.log(formattedThought);

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
								thought_number: validatedInput.thought_number,
								total_thoughts: validatedInput.total_thoughts,
								next_thought_needed: validatedInput.next_thought_needed ?? true,
								branches: this.historyManager.getBranchIds(),
								thought_history_length: this.historyManager.getHistoryLength(),
								available_mcp_tools: validatedInput.available_mcp_tools,
								available_skills: validatedInput.available_skills,
								current_step: validatedInput.current_step,
								previous_steps: validatedInput.previous_steps,
								remaining_steps: validatedInput.remaining_steps,
							},
							null,
							2
						),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
								error: error instanceof Error ? error.message : String(error),
								status: 'failed',
							},
							null,
							2
						),
					},
				],
				isError: true,
			};
		}
	}

	/**
	 * Validate and normalize thought input
	 */
	private validateInput(input: ThoughtData): ThoughtData {
		if (input.thought_number > input.total_thoughts) {
			input.total_thoughts = input.thought_number;
		}
		return input;
	}
}
