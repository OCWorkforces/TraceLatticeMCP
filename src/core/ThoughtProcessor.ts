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
import type { IEdgeStore } from '../contracts/interfaces.js';
import type { ISuspensionStore, SuspensionRecord } from '../contracts/suspension.js';
import type { IReasoningStrategy, StrategyDecision } from '../contracts/strategy.js';
import type { FeatureFlags } from '../ServerConfig.js';
import {
	InvalidBacktrackError,
	InvalidToolCallError,
	SuspensionExpiredError,
	SuspensionNotFoundError,
	ValidationError,
} from '../errors.js';
import { getErrorMessage } from '../errors.js';
import { GraphView } from './graph/GraphView.js';
import type { IHistoryManager } from './IHistoryManager.js';
import { normalizeInput } from './InputNormalizer.js';
import type { ThoughtData } from './thought.js';
import type { ThoughtEvaluator } from './ThoughtEvaluator.js';
import { ThoughtFormatter } from './ThoughtFormatter.js';
import type { PatternSignal } from './reasoning.js';
import { SequentialStrategy } from './reasoning/strategies/SequentialStrategy.js';
import type { CompressionService } from './compression/CompressionService.js';

/**
 * Internal extension to ThoughtData carrying resume metadata.
 * Attached by `_handleToolObservation` so downstream consumers (e.g. edge
 * emission) can correlate the observation with the suspended `tool_call`.
 */
type ResumableThought = ThoughtData & { _resumedFrom?: number };

/** Default feature flags used when none are supplied to ThoughtProcessor. */
const DEFAULT_FEATURES: FeatureFlags = {
	dagEdges: false,
	reasoningStrategy: 'sequential',
	calibration: false,
	compression: false,
	toolInterleave: false,
	newThoughtTypes: false,
	outcomeRecording: false,
};

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
 * Pipeline: validate → normalize → add to history → format → evaluate signals
 * → run reasoning strategy → return structured response.
 *
 * Auto-adjusts `total_thoughts` if `thought_number` exceeds it. All errors are
 * caught and returned as formatted error responses with `isError: true`.
 *
 * @example
 * ```typescript
 * const processor = new ThoughtProcessor(historyManager, formatter, new ThoughtEvaluator());
 * const result = await processor.process({ thought: '...', thought_number: 1, total_thoughts: 5, next_thought_needed: true });
 * ```
 */
export class ThoughtProcessor {
	/** Logger for debugging and monitoring. */
	private _logger: Logger;

	/** Evaluator for quality signal computation. */
	private readonly _thoughtEvaluator: ThoughtEvaluator;

	/**
	 * Per-session cooldown tracker: session_id → pattern → last_fired_thought_number.
	 * Prevents re-firing the same pattern hint within 3 thoughts.
	 */
	private _hintCooldowns = new Map<string, Map<string, number>>();

	/**
	 * Creates a new ThoughtProcessor instance.
	 *
	 * @param historyManager - History manager for storing thoughts
	 * @param thoughtFormatter - Formatter for output formatting
	 * @param thoughtEvaluator - Evaluator for quality signal computation
	 * @param logger - Optional logger for diagnostics (defaults to NullLogger)
	 * @param strategy - Reasoning strategy controlling next-action decisions (defaults to SequentialStrategy)
	 * @param compressionService - Optional compression service for auto-compression on terminate
	 */
	constructor(
		private historyManager: IHistoryManager,
		private thoughtFormatter: ThoughtFormatter,
		thoughtEvaluator: ThoughtEvaluator,
		logger?: Logger,
		private readonly strategy: IReasoningStrategy = new SequentialStrategy(),
		private readonly _compressionService?: CompressionService,
		private readonly _suspensionStore?: ISuspensionStore,
		private readonly _features: FeatureFlags = DEFAULT_FEATURES
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
	 * Generate actionable hints from pattern signals.
	 * Rules: max 3 hints, warning-severity only, cooldown of 3 thoughts per pattern per session.
	 *
	 * @param patterns - Detected pattern signals
	 * @param currentThoughtNumber - The current thought number being processed
	 * @param sessionId - Session identifier for cooldown scoping
	 * @returns Array of hint strings (max 3), empty if no warnings
	 */
	private _generateHints(
		patterns: PatternSignal[],
		currentThoughtNumber: number,
		sessionId?: string
	): string[] {
		const warnings = patterns.filter((p) => p.severity === 'warning');
		if (warnings.length === 0) return [];

		const sessionKey = sessionId ?? '__global__';
		if (!this._hintCooldowns.has(sessionKey)) {
			this._hintCooldowns.set(sessionKey, new Map());
		}
		const cooldowns = this._hintCooldowns.get(sessionKey)!;

		const hints: string[] = [];
		for (const warning of warnings) {
			if (hints.length >= 3) break;

			const lastFired = cooldowns.get(warning.pattern);
			if (lastFired !== undefined && currentThoughtNumber - lastFired < 3) {
				continue; // Still in cooldown
			}

			hints.push(warning.message);
			cooldowns.set(warning.pattern, currentThoughtNumber);
		}

		return hints;
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
 *   - `confidence_signals` — Computed reasoning quality signals (includes structural_quality and quality_components)
 *   - `reasoning_stats` — Aggregated reasoning analytics
 *   - `reasoning_hints` — (Conditional) Actionable hints from pattern analysis, max 3, warning-severity only (optional)
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
			const sessionId = normalizedInput.session_id;

			// Handle reset_state: clear session before processing
			if (normalizedInput.reset_state) {
				this.historyManager.clear(sessionId);
				this.log('State reset for session', { sessionId: sessionId ?? '__global__' });
			}

			// Persist available_mcp_tools/available_skills across calls within a session.
			// If the caller omits these, reuse the last-seen values from the session.
			if (!normalizedInput.available_mcp_tools) {
				normalizedInput.available_mcp_tools = this.historyManager.getAvailableMcpTools(sessionId);
			}
			if (!normalizedInput.available_skills) {
				normalizedInput.available_skills = this.historyManager.getAvailableSkills(sessionId);
			}

			const { result: validatedInput, warnings: validateWarnings } =
				this.validateInput(normalizedInput);
			const { result: checkedInput, warnings: refWarnings } =
				this._validateCrossReferences(validatedInput, sessionId);
			const allWarnings = [...validateWarnings, ...refWarnings];

			// Validate new thought types and tool-interleave invariants.
			this._validateNewTypes(checkedInput);

			// Tool-interleave suspend path: persist the tool_call thought, then return
			// a `suspended` envelope without running strategy/evaluator.
			if (checkedInput.thought_type === 'tool_call' && this._suspensionStore) {
				return this._handleToolCall(checkedInput, sessionId);
			}

			// Tool-interleave resume path: consume the suspension and continue the
			// normal pipeline (addThought → format → evaluate → strategy).
			if (checkedInput.thought_type === 'tool_observation' && this._suspensionStore) {
				this._handleToolObservation(checkedInput, sessionId);
			}

			this.historyManager.addThought(checkedInput);

			const formattedThought = this.thoughtFormatter.formatThought(checkedInput);
			this.log(formattedThought, { sessionId: sessionId ?? '__global__' });

			// Compute quality signals — fetch history/branches once
			const history = this.historyManager.getHistory(sessionId);
			const branches = this.historyManager.getBranches(sessionId);

			const confidenceSignals = this._thoughtEvaluator.computeConfidenceSignals(
				history,
				branches
			);
			const reasoningStats = this._thoughtEvaluator.computeReasoningStats(
				history,
				branches
			);

			// Detect reasoning patterns and generate hints
			const patternSignals = this._thoughtEvaluator.computePatternSignals(
				history,
				branches
			);
			const reasoningHints = this._generateHints(
				patternSignals,
				checkedInput.thought_number,
				sessionId
			);

			// Strategy decision — pluggable reasoning policy hook.
			// Built after history/stats so strategies see the latest state.
			const decision = this._runStrategy(checkedInput, history, reasoningStats, sessionId);

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
							thought_number: checkedInput.thought_number,
							total_thoughts: checkedInput.total_thoughts,
							next_thought_needed: checkedInput.next_thought_needed ?? true,
							branches: this.historyManager.getBranchIds(sessionId),
							thought_history_length: this.historyManager.getHistoryLength(sessionId),
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
							...(reasoningHints.length > 0 && { reasoning_hints: reasoningHints }),
							...(decision.action !== 'continue' && { strategy_hint: decision }),
							...(allWarnings.length > 0 && { warnings: allWarnings }),
							...(sessionId ? { session_id: sessionId } : {}),
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
								error: getErrorMessage(error),
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
	 * Run the configured reasoning strategy and return its decision.
	 * Strategy errors degrade to `{ action: 'continue' }`.
	 * @private
	 */
	private _runStrategy(
		currentThought: ThoughtData,
		history: ThoughtData[],
		stats: ReturnType<ThoughtEvaluator['computeReasoningStats']>,
		sessionId?: string
	): StrategyDecision {
		let decision: StrategyDecision;
		try {
			const edgeStore = this._getEdgeStore();
			const graph = edgeStore ? new GraphView(edgeStore) : (undefined as unknown as GraphView);
			decision = this.strategy.decide({
				sessionId: sessionId ?? '__global__',
				history,
				graph,
				stats,
				currentThought,
			});
		} catch (error) {
			this._logger.warn('Reasoning strategy threw — defaulting to continue', {
				strategy: this.strategy.name,
				error: getErrorMessage(error),
			});
			decision = { action: 'continue' };
		}

		// Auto-compression trigger: when strategy terminates a branch and
		// compression is enabled, summarize the branch subtree. Compression
		// failures must NEVER break the thought pipeline.
		if (
			decision.action === 'terminate' &&
			this._compressionService &&
			currentThought.branch_id
		) {
			try {
				const sid = sessionId ?? '__global__';
				const branchRoot = this._findBranchRoot(sid, currentThought.branch_id);
				if (branchRoot) {
					this._compressionService.compressBranch(sid, currentThought.branch_id, branchRoot);
				}
			} catch (err) {
				this._logger.debug('Compression auto-trigger failed', {
					error: getErrorMessage(err),
				});
			}
		}

		return decision;
	}

	/**
	 * Locate the root thought id for a branch.
	 * Prefers GraphView.branchThoughts() when an EdgeStore is available;
	 * falls back to historyManager.getBranches()[branchId][0].id.
	 * @private
	 */
	private _findBranchRoot(sessionId: string, branchId: string): string | undefined {
		const edgeStore = this._getEdgeStore();
		const branches = this.historyManager.getBranches(sessionId);
		const branchList = branches[branchId];
		const firstId = branchList?.[0]?.id;
		if (edgeStore && firstId) {
			const graph = new GraphView(edgeStore);
			const ids = graph.branchThoughts(sessionId, firstId);
			if (ids.length > 0) return ids[0];
		}
		return firstId;
	}

	/** Best-effort access to the EdgeStore via duck typing. @private */
	private _getEdgeStore(): IEdgeStore | undefined {
		const hm = this.historyManager as { getEdgeStore?: () => IEdgeStore | undefined };
		return typeof hm.getEdgeStore === 'function' ? hm.getEdgeStore() : undefined;
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
	private _validateCrossReferences(input: ThoughtData, sessionId?: string): {
		result: ThoughtData;
		warnings: string[];
	} {
		const warnings: string[] = [];
		const historyLength = this.historyManager.getHistoryLength(sessionId);
		const branchIds = new Set(this.historyManager.getBranchIds(sessionId));

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

	/**
	 * Validate new thought-type invariants behind feature flags.
	 * @private
	 */
	private _validateNewTypes(input: ThoughtData): void {
		const t = input.thought_type;
		if ((t === 'tool_call' || t === 'tool_observation') && !this._features.toolInterleave) {
			throw new ValidationError('thought_type', t + ' requires toolInterleave feature flag');
		}
		if (
			(t === 'assumption' || t === 'decomposition' || t === 'backtrack') &&
			!this._features.newThoughtTypes
		) {
			throw new ValidationError('thought_type', t + ' requires newThoughtTypes feature flag');
		}
		if (t === 'tool_call' && !input.tool_name) {
			throw new InvalidToolCallError(
				'tool_call thought ' + input.thought_number + ' missing required tool_name'
			);
		}
		if (t === 'tool_observation' && !input.continuation_token) {
			throw new ValidationError(
				'continuation_token',
				'tool_observation thought ' + input.thought_number + ' missing continuation_token'
			);
		}
		if (
			t === 'backtrack' &&
			input.backtrack_target !== undefined &&
			input.backtrack_target > input.thought_number
		) {
			throw new InvalidBacktrackError(
				'backtrack_target ' + input.backtrack_target + ' must be <= thought_number ' + input.thought_number
			);
		}
	}

	/**
	 * Persist a tool_call thought and return a `suspended` envelope.
	 * Strategy/evaluator are intentionally skipped.
	 * @private
	 */
	private _handleToolCall(input: ThoughtData, sessionId?: string): CallToolResult {
		this.historyManager.addThought(input);
		const record: SuspensionRecord = this._suspensionStore!.suspend({
			sessionId: sessionId ?? '__global__',
			toolCallThoughtNumber: input.thought_number,
			toolName: input.tool_name!,
			toolArguments: input.tool_arguments ?? {},
			ttlMs: 5 * 60_000,
			expiresAt: 0,
		});
		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(
						{
							status: 'suspended',
							continuation_token: record.token,
							tool_name: record.toolName,
							tool_arguments: record.toolArguments,
							expires_at: record.expiresAt,
							thought_number: input.thought_number,
							total_thoughts: input.total_thoughts,
							...(sessionId ? { session_id: sessionId } : {}),
						},
						null,
						2
					),
				},
			],
		};
	}

	/**
	 * Resume from a tool_observation, consuming the suspension record.
	 * Distinguishes missing vs expired via peek().
	 * @private
	 */
	private _handleToolObservation(input: ThoughtData, _sessionId?: string): void {
		const token = input.continuation_token!;
		const peeked = this._suspensionStore!.peek(token);
		if (peeked && peeked.expiresAt <= Date.now()) {
			throw new SuspensionExpiredError('Suspension token expired: ' + token);
		}
		const record = this._suspensionStore!.resume(token);
		if (!record) {
			throw new SuspensionNotFoundError('Suspension token not found: ' + token);
		}
		(input as ResumableThought)._resumedFrom = record.toolCallThoughtNumber;
	}
}
