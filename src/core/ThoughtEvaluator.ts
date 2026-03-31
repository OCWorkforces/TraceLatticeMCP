/**
 * Quality signal computation for sequential thinking.
 *
 * Provides the {@link ThoughtEvaluator} class — a stateless service that computes
 * confidence signals and reasoning analytics from thought history. Follows the
 * ThoughtFormatter pattern as a composed dependency of ThoughtProcessor.
 *
 * @module core/evaluator
 */

import type { ThoughtData } from './thought.js';
import type { ThoughtType, ConfidenceSignals, ReasoningStats } from './reasoning.js';

/** All valid thought types for distribution counting. */
const ALL_THOUGHT_TYPES: ThoughtType[] = [
	'regular',
	'hypothesis',
	'verification',
	'critique',
	'synthesis',
	'meta',
];

/**
 * Stateless service that computes quality signals and reasoning analytics
 * from thought history and branch data.
 *
 * @remarks
 * All methods are pure computations — no side effects, no I/O, no internal state.
 * Designed to be registered as transient in the DI container.
 *
 * @example
 * ```typescript
 * const evaluator = new ThoughtEvaluator();
 *
 * const signals = evaluator.computeConfidenceSignals(history, branches);
 * console.log(signals.reasoning_depth); // 5
 *
 * const stats = evaluator.computeReasoningStats(history, branches);
 * console.log(stats.total_thoughts); // 12
 * ```
 */
export class ThoughtEvaluator {
	/**
	 * Compute confidence signals from history context.
	 * Pure computation — no side effects, no I/O.
	 *
	 * @param history - All thoughts in the current session
	 * @param branches - Map of branch IDs to their thought arrays
	 * @returns Computed confidence signals reflecting reasoning quality
	 *
	 * @example
	 * ```typescript
	 * const evaluator = new ThoughtEvaluator();
 * const signals = evaluator.computeConfidenceSignals(
 *   [thought1, thought2, thought3],
 *   { 'branch-a': [branchThought1] }
 * );
	 *
	 * console.log(signals.reasoning_depth);   // 3
	 * console.log(signals.branch_count);      // 1
	 * console.log(signals.has_hypothesis);    // false
	 * console.log(signals.average_confidence); // 0.85 or null
	 * ```
	 */
	public computeConfidenceSignals(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): ConfidenceSignals {
		const typeDistribution = this._countByType(history);
		const allConfidences = history
			.map((t) => t.confidence)
			.filter((c): c is number => c !== undefined);

		return {
			reasoning_depth: history.length,
			revision_count: history.filter((t) => t.is_revision).length,
			branch_count: Object.keys(branches).length,
			thought_type_distribution: typeDistribution,
			has_hypothesis: history.some((t) => t.thought_type === 'hypothesis'),
			has_verification: history.some((t) => t.thought_type === 'verification'),
			average_confidence:
				allConfidences.length > 0
					? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
					: null,
		};
	}

	/**
	 * Compute aggregated reasoning analytics.
	 * Pure computation from history + branches.
	 *
	 * @param history - All thoughts in the current session
	 * @param branches - Map of branch IDs to their thought arrays
	 * @returns Aggregated reasoning statistics for the session
	 *
	 * @example
	 * ```typescript
	 * const evaluator = new ThoughtEvaluator();
	 * const stats = evaluator.computeReasoningStats(
	 *   [thought1, thought2, hypothesisThought, verificationThought],
	 *   { 'explore-a': [branchThought] }
	 * );
	 *
	 * console.log(stats.total_thoughts);              // 4
	 * console.log(stats.total_branches);              // 1
	 * console.log(stats.hypothesis_count);            // 1
	 * console.log(stats.verified_hypothesis_count);   // 1
	 * console.log(stats.average_quality_score);       // 0.78 or null
	 * ```
	 */
	public computeReasoningStats(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): ReasoningStats {
		const typeCounts = this._countByType(history);
		const allScores = history
			.map((t) => t.quality_score)
			.filter((s): s is number => s !== undefined);
		const allConfidences = history
			.map((t) => t.confidence)
			.filter((c): c is number => c !== undefined);

		const hypotheses = history.filter((t) => t.thought_type === 'hypothesis');
		const hypothesisIds = new Set(hypotheses.map((t) => t.hypothesis_id).filter(Boolean));
		const verifiedIds = new Set(
			history
				.filter((t) => t.thought_type === 'verification' && t.hypothesis_id)
				.map((t) => t.hypothesis_id)
		);
		const unresolvedCount = [...hypothesisIds].filter((id) => !verifiedIds.has(id)).length;

		return {
			total_thoughts: history.length,
			total_branches: Object.keys(branches).length,
			total_revisions: history.filter((t) => t.is_revision).length,
			total_merges: history.filter(
				(t) => (t.merge_from_thoughts?.length ?? 0) > 0 || (t.merge_branch_ids?.length ?? 0) > 0
			).length,
			chain_depth: this._computeChainDepth(history),
			thought_type_counts: typeCounts,
			hypothesis_count: hypothesisIds.size,
			verified_hypothesis_count: [...hypothesisIds].filter((id) => verifiedIds.has(id)).length,
			unresolved_hypothesis_count: unresolvedCount,
			average_quality_score:
				allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null,
			average_confidence:
				allConfidences.length > 0
					? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
					: null,
		};
	}

	/** Count thoughts by type across history. */
	private _countByType(thoughts: ThoughtData[]): Record<ThoughtType, number> {
		const counts = Object.fromEntries(ALL_THOUGHT_TYPES.map((t) => [t, 0])) as Record<
			ThoughtType,
			number
		>;

		for (const thought of thoughts) {
			const type = thought.thought_type ?? 'regular';
			if (type in counts) {
				counts[type]++;
			}
		}

		return counts;
	}

	/** Find longest sequential chain depth (contiguous thoughts without branching). */
	private _computeChainDepth(history: ThoughtData[]): number {
		if (history.length === 0) return 0;
		// Simple: longest contiguous chain without branching
		let maxDepth = 1;
		let currentDepth = 1;

		for (let i = 1; i < history.length; i++) {
			const thought = history[i]!;
			if (!thought.branch_from_thought) {
				currentDepth++;
				maxDepth = Math.max(maxDepth, currentDepth);
			} else {
				currentDepth = 1;
			}
		}

		return maxDepth;
	}
}
