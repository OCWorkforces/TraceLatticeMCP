/**
 * Reasoning analytics aggregation.
 *
 * Provides the {@link Aggregator} class — a stateless service that computes
 * aggregated {@link ReasoningStats} from thought history and branch data.
 * Extracted from {@link ThoughtEvaluator} to isolate the stats-aggregation
 * concern.
 *
 * @module core/evaluator/Aggregator
 */

import type { ReasoningStats } from '../reasoning.js';
import type { ThoughtData } from '../thought.js';
import { _computeChainDepth, _countByType } from './internals.js';

/**
 * Round a numeric value to a fixed number of decimal places to mitigate
 * IEEE 754 floating-point accumulation errors (e.g. 0.9 + 0.8 averaging to
 * 0.8500000000000001 instead of 0.85).
 */
function roundToPrecision(value: number, decimals: number = 10): number {
	const factor = Math.pow(10, decimals);
	return Math.round(value * factor) / factor;
}

/**
 * Stateless service that aggregates reasoning analytics from thought
 * history and branch data.
 *
 * @remarks
 * All methods are pure computations — no side effects, no I/O, no
 * internal state. Designed to be registered as transient in the DI
 * container.
 *
 * @example
 * ```typescript
 * const aggregator = new Aggregator();
 * const stats = aggregator.computeReasoningStats(history, branches);
 * console.log(stats.total_thoughts); // 12
 * ```
 */
export class Aggregator {
	/**
	 * Compute aggregated reasoning analytics.
	 * Pure computation from history + branches.
	 *
	 * @param history - All thoughts in the current session
	 * @param branches - Map of branch IDs to their thought arrays
	 * @returns Aggregated reasoning statistics for the session
	 */
	public computeReasoningStats(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): ReasoningStats {
		const typeCounts = _countByType(history);
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
			chain_depth: _computeChainDepth(history),
			thought_type_counts: typeCounts,
			hypothesis_count: hypothesisIds.size,
			verified_hypothesis_count: [...hypothesisIds].filter((id) => verifiedIds.has(id)).length,
			unresolved_hypothesis_count: unresolvedCount,
			average_quality_score:
				allScores.length > 0
					? roundToPrecision(allScores.reduce((a, b) => a + b, 0) / allScores.length)
					: null,
			average_confidence:
				allConfidences.length > 0
					? roundToPrecision(allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length)
					: null,
		};
	}
}
