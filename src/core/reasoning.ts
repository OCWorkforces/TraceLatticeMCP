/**
 * Reasoning type definitions for advanced sequential thinking.
 *
 * Provides type-level constructs for classifying thoughts, computing confidence
 * signals from reasoning history, and aggregating session analytics.
 *
 * @module core/reasoning
 */

/**
 * Classification of thought purpose — enables type-specific formatting, evaluation, and analytics.
 *
 * @example
 * ```typescript
 * const thoughtType: ThoughtType = 'hypothesis';
 *
 * // Use in conditional formatting
 * if (thoughtType === 'verification') {
 *   console.log('Verifying a hypothesis...');
 * }
 * ```
 */
export type ThoughtType =
	| 'regular' // Standard analytical step (default)
	| 'hypothesis' // Proposed explanation/solution candidate
	| 'verification' // Testing a hypothesis against evidence
	| 'critique' // Self-critique of reasoning (Reflexion pattern)
	| 'synthesis' // Combining multiple thoughts/branches (GoT merge)
	| 'meta'; // Metacognitive observation about the reasoning process itself

/**
 * Signals about reasoning quality computed from history.
 *
 * These metrics are derived from the thought chain and provide insight into
 * the depth, breadth, and completeness of the reasoning process.
 *
 * @example
 * ```typescript
 * const signals: ConfidenceSignals = {
 *   reasoning_depth: 5,
 *   revision_count: 1,
 *   branch_count: 2,
 *   thought_type_distribution: {
 *     regular: 3,
 *     hypothesis: 1,
 *     verification: 1,
 *     critique: 0,
 *     synthesis: 0,
 *     meta: 0,
 *   },
 *   has_hypothesis: true,
 *   has_verification: true,
 *   average_confidence: 0.85,
 * };
 * ```
 */
export interface ConfidenceSignals {
	/** Length of thought chain to this point. */
	reasoning_depth: number;

	/** How many revisions in this chain. */
	revision_count: number;

	/** Active branches. */
	branch_count: number;

	/** Distribution of thought types used. */
	thought_type_distribution: Record<ThoughtType, number>;

	/** Whether any hypothesis exists in chain. */
	has_hypothesis: boolean;

	/** Whether any verification exists. */
	has_verification: boolean;

	/** Mean of explicit confidence values, null if none. */
	average_confidence: number | null;
}

/**
 * Aggregated analytics about the reasoning session.
 *
 * Provides a comprehensive summary of the reasoning process including
 * thought counts, branch metrics, hypothesis tracking, and quality scores.
 *
 * @example
 * ```typescript
 * const stats: ReasoningStats = {
 *   total_thoughts: 12,
 *   total_branches: 3,
 *   total_revisions: 2,
 *   total_merges: 1,
 *   chain_depth: 8,
 *   thought_type_counts: {
 *     regular: 6,
 *     hypothesis: 2,
 *     verification: 2,
 *     critique: 1,
 *     synthesis: 1,
 *     meta: 0,
 *   },
 *   hypothesis_count: 2,
 *   verified_hypothesis_count: 1,
 *   unresolved_hypothesis_count: 1,
 *   average_quality_score: 0.78,
 *   average_confidence: 0.82,
 * };
 * ```
 */
export interface ReasoningStats {
	/** Total thoughts in session. */
	total_thoughts: number;

	/** Total branches created. */
	total_branches: number;

	/** Total revision operations. */
	total_revisions: number;

	/** Total merge operations (DAG topology). */
	total_merges: number;

	/** Longest sequential chain depth. */
	chain_depth: number;

	/** Count of each thought type. */
	thought_type_counts: Record<ThoughtType, number>;

	/** Hypotheses created. */
	hypothesis_count: number;

	/** Hypotheses that have been verified. */
	verified_hypothesis_count: number;

	/** Hypotheses without verification. */
	unresolved_hypothesis_count: number;

	/** Average quality score across thoughts with scores, null if none. */
	average_quality_score: number | null;

	/** Average confidence across thoughts with confidence, null if none. */
	average_confidence: number | null;
}
