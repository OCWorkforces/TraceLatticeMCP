/**
 * Confidence signal computation for sequential thinking.
 *
 * Provides {@link SignalComputer} — a pure stateless service that computes
 * {@link ConfidenceSignals} (including the composite `structural_quality`
 * score and its components) from thought history and branch data.
 *
 * Extracted from `ThoughtEvaluator` as part of the evaluator decomposition.
 * All methods are pure: no side effects, no I/O, no internal state.
 *
 * @module core/evaluator/SignalComputer
 */

import type { ConfidenceSignals, ThoughtType } from '../reasoning.js';
import type { ThoughtData } from '../thought.js';
import { ALL_THOUGHT_TYPES, _computeChainDepth, _countByType } from './internals.js';

/** Floor value applied to each quality component to prevent geometric mean collapse. */
const FLOOR = 0.01;

/** Result of {@link SignalComputer.computeStructuralQuality}. */
interface StructuralQualityResult {
	score: number;
	components: {
		type_diversity: number;
		verification_coverage: number;
		depth_efficiency: number;
		confidence_stability: number;
	};
}

/**
 * Stateless service that computes {@link ConfidenceSignals} from thought history.
 *
 * @remarks
 * Pure computation — no side effects, no I/O, no internal state.
 * Safe to register as singleton or transient in DI.
 */
export class SignalComputer {
	/**
	 * Compute confidence signals from history context.
	 *
	 * @param history - All thoughts in the current session
	 * @param branches - Map of branch IDs to their thought arrays
	 * @returns Computed confidence signals reflecting reasoning quality
	 */
	public computeConfidenceSignals(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): ConfidenceSignals {
		const typeDistribution = _countByType(history);
		const allConfidences = history
			.map((t) => t.confidence)
			.filter((c): c is number => c !== undefined);

		// Compute structural quality components
		const structuralResult = this.computeStructuralQuality(
			history,
			branches,
			typeDistribution,
			allConfidences
		);

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
			...(structuralResult !== null && {
				structural_quality: structuralResult.score,
				quality_components: structuralResult.components,
			}),
		};
	}

	/**
	 * Compute the composite structural quality score and its components.
	 *
	 * Algorithm (all components floored at {@link FLOOR} = 0.01):
	 * - `type_diversity` = Shannon entropy of thought_type distribution / log2(6)
	 * - `verification_coverage` = verified_hypotheses / max(total_hypotheses, 1) (1.0 if none)
	 * - `depth_efficiency` = max(chain_depth, branch_count + 1) / total_thoughts, clamped to 1.0
	 * - `confidence_stability` = 1 - stddev(confidences), default 0.5 when empty
	 * - `structural_quality` = td^0.3 * vc^0.3 * de^0.2 * cs^0.2 (weighted geometric mean)
	 *
	 * @returns Score + components, or `null` when history is empty
	 */
	public computeStructuralQuality(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>,
		typeDistribution: Record<ThoughtType, number>,
		confidences: number[]
	): StructuralQualityResult | null {
		if (history.length === 0) return null;

		// 1. type_diversity: Shannon entropy / log2(6)
		const total = history.length;
		let entropy = 0;
		for (const type of ALL_THOUGHT_TYPES) {
			const count = typeDistribution[type];
			if (count > 0) {
				const pk = count / total;
				entropy -= pk * Math.log2(pk);
			}
		}
		const typeDiversity = Math.max(entropy / Math.log2(6), FLOOR);

		// 2. verification_coverage: verified / total hypotheses (1.0 if none)
		const hypotheses = history.filter((t) => t.thought_type === 'hypothesis');
		const hypothesisIds = new Set(hypotheses.map((t) => t.hypothesis_id).filter(Boolean));
		const verifiedIds = new Set(
			history
				.filter((t) => t.thought_type === 'verification' && t.hypothesis_id)
				.map((t) => t.hypothesis_id)
		);
		const verificationCoverage =
			hypothesisIds.size === 0
				? 1.0
				: Math.max(
						[...hypothesisIds].filter((id) => verifiedIds.has(id)).length / hypothesisIds.size,
						FLOOR
					);

		// 3. depth_efficiency: max(chain_depth, branch_count + 1) / total_thoughts, clamped to 1.0
		// NOTE (Metis H3): Branching is desirable — treat branches as depth-equivalent.
		const chainDepth = _computeChainDepth(history);
		const branchCount = Object.keys(branches).length;
		const effectiveDepth = Math.max(chainDepth, branchCount + 1);
		const depthEfficiency = Math.max(Math.min(effectiveDepth / total, 1.0), FLOOR);

		// 4. confidence_stability: 1 - stddev(confidences), default 0.5
		const confidenceStability = this.computeConfidenceStability(confidences);

		const components = {
			type_diversity: typeDiversity,
			verification_coverage: verificationCoverage,
			depth_efficiency: depthEfficiency,
			confidence_stability: confidenceStability,
		};

		// Weighted geometric mean: td^0.3 * vc^0.3 * de^0.2 * cs^0.2
		const score =
			Math.pow(typeDiversity, 0.3) *
			Math.pow(verificationCoverage, 0.3) *
			Math.pow(depthEfficiency, 0.2) *
			Math.pow(confidenceStability, 0.2);

		return { score, components };
	}

	/**
	 * Compute confidence stability: 1 - stddev(confidences).
	 *
	 * - Empty input → 0.5 (default neutral value, floored at {@link FLOOR})
	 * - Single value → 1.0 (perfectly stable, floored at {@link FLOOR})
	 * - Otherwise → max(1 - stddev, FLOOR)
	 */
	public computeConfidenceStability(confidences: number[]): number {
		if (confidences.length === 0) return Math.max(0.5, FLOOR);
		if (confidences.length === 1) return Math.max(1.0, FLOOR);

		const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
		const variance =
			confidences.reduce((sum, c) => sum + (c - mean) ** 2, 0) / confidences.length;
		const stddev = Math.sqrt(variance);
		return Math.max(1 - stddev, FLOOR);
	}
}
