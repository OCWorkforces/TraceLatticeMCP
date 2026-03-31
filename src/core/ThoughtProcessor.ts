/**
 * Core thought processing logic and validation.
 *
 * This module provides the `ThoughtProcessor` class which handles the main
 * sequential thinking request processing pipeline, including input validation,
 * history management, and response formatting.
 *
 * @module processor
 */

import { NullLogger } from '../logger/NullLogger.js';
import type { Logger } from '../logger/StructuredLogger.js';
import type { IHistoryManager } from './IHistoryManager.js';
import { normalizeInput } from './InputNormalizer.js';
import type { ThoughtData } from './thought.js';
import type { ThoughtEvaluator } from './ThoughtEvaluator.js';
import { ThoughtFormatter } from './ThoughtFormatter.js';

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
 * 4. Compute quality signals via ThoughtEvaluator
 * 5. Return structured response with metadata and reasoning enrichment
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
 * const processor = new ThoughtProcessor(historyManager, formatter, new ThoughtEvaluator());
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

	/** Evaluator for quality signal computation. */
	private readonly _thoughtEvaluator: ThoughtEvaluator;

	/**
	 * Creates a new ThoughtProcessor instance.
	 *
	 * @param historyManager - The history manager for storing thoughts
	 * @param thoughtFormatter - The formatter for output formatting
	 * @param thoughtEvaluator - Evaluator for quality signal computation
	 * @param logger - Optional logger for diagnostics (defaults to NullLogger)
	 *
	 * @example
	 * ```typescript
	 * const processor = new ThoughtProcessor(
	 *   historyManager,
	 *   new ThoughtFormatter(),
	 *   new ThoughtEvaluator(),
	 *   logger,
	 * );
	 * ```
	 */
	constructor(
		private historyManager: IHistoryManager,
		private thoughtFormatter: ThoughtFormatter,
		thoughtEvaluator: ThoughtEvaluator,
		logger?: Logger
	) {
		this._thoughtEvaluator = thoughtEvaluator;
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
	 * computes quality signals via the ThoughtEvaluator, and returns
	 * a structured response with metadata about the current state.
	 *
	 * @param input - The thought data to process
	 * @returns A Promise resolving to the formatted tool result containing:
	 *   - `thought_number` — Current thought index
	 *   - `total_thoughts` — Estimated total thoughts
	 *   - `next_thought_needed` — Whether to continue
	 *   - `branches` — Active branch IDs
	 *   - `thought_history_length` — Number of thoughts in history
	 *   - `available_mcp_tools` — MCP tools available for recommendation
	 *   - `available_skills` — Skills available for recommendation
	 *   - `current_step` — Current step recommendation
	 *   - `previous_steps` — Previously recommended steps
	 *   - `remaining_steps` — Upcoming step descriptions
	 *   - `thought_type` — Classification of thought purpose (optional)
	 *   - `quality_score` — Self-assessed quality score 0-1 (optional)
	 *   - `confidence` — Self-assessed confidence 0-1 (optional)
	 *   - `hypothesis_id` — Hypothesis link for verification chains (optional)
	 *   - `confidence_signals` — Computed reasoning quality signals
	 *   - `reasoning_stats` — Aggregated reasoning analytics
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

			const { result: validatedInput, warnings: validateWarnings } =
				this.validateInput(normalizedInput);
			const { result: checkedInput, warnings: refWarnings } =
				this._validateCrossReferences(validatedInput);
			const allWarnings = [...validateWarnings, ...refWarnings];

			this.historyManager.addThought(checkedInput);

			const formattedThought = this.thoughtFormatter.formatThought(checkedInput);
			this.log(formattedThought);

			// Compute quality signals
			const confidenceSignals = this._thoughtEvaluator.computeConfidenceSignals(
				this.historyManager.getHistory(),
				this.historyManager.getBranches()
			);
			const reasoningStats = this._thoughtEvaluator.computeReasoningStats(
				this.historyManager.getHistory(),
				this.historyManager.getBranches()
			);

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
							thought_number: checkedInput.thought_number,
							total_thoughts: checkedInput.total_thoughts,
							next_thought_needed: checkedInput.next_thought_needed ?? true,
							branches: this.historyManager.getBranchIds(),
							thought_history_length: this.historyManager.getHistoryLength(),
							available_mcp_tools: checkedInput.available_mcp_tools,
							available_skills: checkedInput.available_skills,
							current_step: checkedInput.current_step,
							previous_steps: checkedInput.previous_steps,
							remaining_steps: checkedInput.remaining_steps,
							// Reasoning enrichment fields
							thought_type: checkedInput.thought_type,
							quality_score: checkedInput.quality_score,
							confidence: checkedInput.confidence,
							hypothesis_id: checkedInput.hypothesis_id,
							confidence_signals: confidenceSignals,
							reasoning_stats: reasoningStats,
							...(allWarnings.length > 0 && { warnings: allWarnings }),
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
	 * automatically adjusted to match and a warning is emitted.
	 *
	 * @param input - The input to validate
	 * @returns Object with validated input and any warnings generated
	 * @private
	 *
	 * @example
	 * ```typescript
	 * // Auto-adjusts total_thoughts when thought_number exceeds it
	 * const { result, warnings } = this.validateInput(input);
	 * // result.total_thoughts === 10 (auto-adjusted from 5)
	 * // warnings === ['Auto-adjusted total_thoughts from 5 to 10 to match thought_number']
	 * ```
	 */
	private validateInput(input: ThoughtData): {
		result: ThoughtData;
		warnings: string[];
	} {
		const warnings: string[] = [];
		if (input.thought_number > input.total_thoughts) {
			const originalTotal = input.total_thoughts;
			warnings.push(
				`Auto-adjusted total_thoughts from ${originalTotal} to ${input.thought_number} to match thought_number`
			);
			this._logger.warn('Auto-adjusted total_thoughts to match thought_number', {
				thought_number: input.thought_number,
				original_total_thoughts: originalTotal,
				adjusted_total_thoughts: input.thought_number,
			});
			input.total_thoughts = input.thought_number;
		}
		return { result: input, warnings };
	}

	/**
	 * Validates cross-field references against actual thought history.
	 * Drops invalid references with a warning log — never rejects.
	 * LLMs frequently send optimistic references to thoughts that don't exist yet.
	 *
	 * @param input - The thought data to validate
	 * @returns Object with cleaned input and any warnings generated
	 * @private
	 *
	 * @example
	 * ```typescript
	 * // verification_target=999 with only 3 thoughts in history
	 * const { result, warnings } = this._validateCrossReferences(input);
	 * // result.verification_target === undefined
	 * // warnings === ['Dropped dangling verification_target: 999 (history has 3 thoughts)']
	 * ```
	 */
	private _validateCrossReferences(input: ThoughtData): {
		result: ThoughtData;
		warnings: string[];
	} {
		const warnings: string[] = [];
		const historyLength = this.historyManager.getHistoryLength();
		const branchIds = new Set(this.historyManager.getBranchIds());

		// verification_target: must reference existing thought
		if (input.verification_target !== undefined && input.verification_target > historyLength) {
			warnings.push(
				`Dropped dangling verification_target: ${input.verification_target} (history has ${historyLength} thoughts)`
			);
			this._logger.warn('Dropped dangling verification_target', {
				verification_target: input.verification_target,
				historyLength,
			});
			input.verification_target = undefined;
		}

		// revises_thought: must reference existing thought
		if (input.revises_thought !== undefined && input.revises_thought > historyLength) {
			warnings.push(
				`Dropped dangling revises_thought: ${input.revises_thought} (history has ${historyLength} thoughts)`
			);
			this._logger.warn('Dropped dangling revises_thought', {
				revises_thought: input.revises_thought,
				historyLength,
			});
			input.revises_thought = undefined;
		}

		// branch_from_thought: must reference existing thought
		if (input.branch_from_thought !== undefined && input.branch_from_thought > historyLength) {
			warnings.push(
				`Dropped dangling branch_from_thought: ${input.branch_from_thought} (history has ${historyLength} thoughts)`
			);
			this._logger.warn('Dropped dangling branch_from_thought', {
				branch_from_thought: input.branch_from_thought,
				historyLength,
			});
			input.branch_from_thought = undefined;
		}

		// synthesis_sources: filter to existing thoughts only
		if (input.synthesis_sources?.length) {
			const valid = input.synthesis_sources.filter((n: number) => n <= historyLength);
			if (valid.length < input.synthesis_sources.length) {
				const dropped = input.synthesis_sources.filter((n: number) => n > historyLength);
				warnings.push(
					`Filtered dangling synthesis_sources: [${dropped.join(', ')}] (history has ${historyLength} thoughts)`
				);
				this._logger.warn('Filtered dangling synthesis_sources', {
					original: input.synthesis_sources,
					filtered: valid,
					historyLength,
				});
			}
			input.synthesis_sources = valid.length > 0 ? valid : undefined;
		}

		// merge_from_thoughts: filter to existing thoughts only
		if (input.merge_from_thoughts?.length) {
			const valid = input.merge_from_thoughts.filter((n: number) => n <= historyLength);
			if (valid.length < input.merge_from_thoughts.length) {
				const dropped = input.merge_from_thoughts.filter(
					(n: number) => n > historyLength
				);
				warnings.push(
					`Filtered dangling merge_from_thoughts: [${dropped.join(', ')}] (history has ${historyLength} thoughts)`
				);
				this._logger.warn('Filtered dangling merge_from_thoughts', {
					original: input.merge_from_thoughts,
					filtered: valid,
					historyLength,
				});
			}
			input.merge_from_thoughts = valid.length > 0 ? valid : undefined;
		}

		// merge_branch_ids: filter to existing branches only
		if (input.merge_branch_ids?.length) {
			const valid = input.merge_branch_ids.filter((id: string) => branchIds.has(id));
			if (valid.length < input.merge_branch_ids.length) {
				const dropped = input.merge_branch_ids.filter(
					(id: string) => !branchIds.has(id)
				);
				warnings.push(`Filtered dangling merge_branch_ids: [${dropped.join(', ')}]`);
				this._logger.warn('Filtered dangling merge_branch_ids', {
					original: input.merge_branch_ids,
					filtered: valid,
					existingBranches: Array.from(branchIds),
				});
			}
			input.merge_branch_ids = valid.length > 0 ? valid : undefined;
		}

		return { result: input, warnings };
	}
}
