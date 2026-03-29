/**
 * Core thought processing logic and validation.
 *
 * This module provides the `ThoughtProcessor` class which handles the main
 * sequential thinking request processing pipeline, including input validation,
 * history management, and response formatting.
 *
 * @module processor
 */

import type { ThoughtData } from './thought.js';
import type { Logger } from '../logger/StructuredLogger.js';
import type { IHistoryManager } from './IHistoryManager.js';
import { ThoughtFormatter } from './ThoughtFormatter.js';
import { normalizeInput } from './InputNormalizer.js';
import { NullLogger } from '../logger/NullLogger.js';

/**
 * The return type expected by MCP tool invocations.
 *
 * This structure matches the MCP protocol for tool results,
 * supporting both success and error responses.
 *
 * @example
 * ```typescript
 * const successResult: CallToolResult = {
 *   content: [{ type: 'text', text: '{"status":"success"}' }]
 * };
 *
 * const errorResult: CallToolResult = {
 *   content: [{ type: 'text', text: '{"error":"Something went wrong"}' }],
 *   isError: true
 * };
 * ```
 */
export interface CallToolResult {
	/** Array of content blocks (typically text) to return to the client. */
	content: Array<{
		type: 'text';
		text: string;
	}>;

	/** Whether this result represents an error condition. */
	isError?: boolean;
}

/**
 * Core processor for sequential thinking requests.
 *
 * This class handles the main processing pipeline for thought requests,
 * coordinating between history management, validation, and response formatting.
 * It serves as the central entry point for the sequential thinking tool.
 *
 * @remarks
 * **Processing Pipeline:**
 * 1. Validate and normalize the input thought
 * 2. Add the thought to history (triggers auto-trimming if needed)
 * 3. Format the thought for logging/display
 * 4. Return structured response with metadata
 *
 * **Validation Rules:**
 * - `thought_number` must be >= 1
 * - `total_thoughts` must be >= 1
 * - If `thought_number > total_thoughts`, `total_thoughts` is auto-adjusted
 *
 * **Error Handling:**
 * All errors are caught and returned as formatted error responses
 * with `isError: true` set, preventing crashes from malformed input.
 *
 * @example
 * ```typescript
 * const processor = new ThoughtProcessor(historyManager, formatter, logger);
 *
 * const result = await processor.process({
 *   thought: 'I need to analyze the codebase structure',
 *   thought_number: 1,
 *   total_thoughts: 5,
 *   next_thought_needed: true,
 *   available_mcp_tools: ['Read', 'Grep', 'Glob'],
 *   current_step: {
 *     step_description: 'Analyze codebase structure',
 *     recommended_tools: [{
 *       tool_name: 'Glob',
 *       confidence: 0.9,
 *       rationale: 'Best for finding files by pattern',
 *       priority: 1
 *     }],
 *     expected_outcome: 'List of all TypeScript files'
 *   }
 * });
 * ```
 */
export class ThoughtProcessor {
	/** Logger for debugging and monitoring. */
	private _logger: Logger;

	/**
	 * Creates a new ThoughtProcessor instance.
	 *
	 * @param historyManager - The history manager for storing thoughts
	 * @param thoughtFormatter - The formatter for output formatting
	 * @param logger - Optional logger for diagnostics (defaults to NullLogger)
	 *
	 * @example
	 * ```typescript
	 * const processor = new ThoughtProcessor(
	 *   historyManager,
	 *   new ThoughtFormatter(),
	 *   new StructuredLogger({ context: 'Processor' })
	 * );
	 * ```
	 */
	constructor(
		private historyManager: IHistoryManager,
		private thoughtFormatter: ThoughtFormatter,
		logger?: Logger
	) {
		this._logger = logger ?? new NullLogger();
	}

	/**
	 * Internal logging method.
	 * @param message - The message to log
	 * @param meta - Optional metadata
	 * @private
	 */
	private log(message: string, meta?: Record<string, unknown>): void {
		this._logger.info(message, meta);
	}

	/**
	 * Processes a thought through the sequential thinking pipeline.
	 *
	 * This method validates the input, adds it to history, formats the output,
	 * and returns a structured response with metadata about the current state.
	 *
	 * @param input - The thought data to process
	 * @returns A Promise resolving to the formatted tool result
	 *
	 * @example
	 * ```typescript
	 * const result = await processor.process({
	 *   thought: 'I should read the README file',
	 *   thought_number: 1,
	 *   total_thoughts: 3,
	 *   next_thought_needed: true
	 * });
	 *
	 * console.log(result.content[0].text);
	 * // Output includes: thought_number, total_thoughts, next_thought_needed,
	 * // branches, thought_history_length, and any recommendations
	 * ```
	 */
	public async process(input: ThoughtData): Promise<CallToolResult> {
		try {
			// Normalize input to handle common LLM field name mistakes
			const normalizedInput = normalizeInput(input);

			// Persist available_mcp_tools/available_skills across calls within a session.
			// If the caller omits these, reuse the last-seen values from the session.
			if (!normalizedInput.available_mcp_tools) {
				normalizedInput.available_mcp_tools = this.historyManager.getAvailableMcpTools();
			}
			if (!normalizedInput.available_skills) {
				normalizedInput.available_skills = this.historyManager.getAvailableSkills();
			}

			const validatedInput = this.validateInput(normalizedInput);

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
	 * Validates and normalizes thought input.
	 *
	 * Ensures that thought numbers are consistent and within valid ranges.
	 * If `thought_number` exceeds `total_thoughts`, `total_thoughts` is
	 * automatically adjusted to match.
	 *
	 * @param input - The input to validate
	 * @returns The validated and normalized thought data
	 * @private
	 *
	 * @example
	 * ```typescript
	 * // Auto-adjusts total_thoughts when thought_number exceeds it
	 * const input = { thought_number: 10, total_thoughts: 5, ... };
	 * const validated = processor.validateInput(input);
	 * // validated.total_thoughts === 10
	 * ```
	 */
	private validateInput(input: ThoughtData): ThoughtData {
		if (input.thought_number > input.total_thoughts) {
			input.total_thoughts = input.thought_number;
		}
		return input;
	}
}
