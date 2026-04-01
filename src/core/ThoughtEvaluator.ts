/**
 * Quality signal computation for sequential thinking.
 *
 * Provides the {@link ThoughtEvaluator} class — a stateless service that computes
 * confidence signals and reasoning analytics from thought history. Follows the
 * ThoughtFormatter pattern as a composed dependency of ThoughtProcessor.
 *
 * @module core/evaluator
 */

import type { ConfidenceSignals, PatternSignal, ReasoningStats, ThoughtType } from './reasoning.js';
import type { ThoughtData } from './thought.js';

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

		// Compute structural quality components
		const structuralResult = this._computeStructuralQuality(
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

	/**
 * Detect reasoning patterns (anti-patterns and positive signals) from history.
 * Pure computation — no side effects, no I/O.
 *
 * Detected patterns:
 * - `consecutive_without_verification` (warning) — 3+ consecutive regular thoughts without a verification step
 * - `unverified_hypothesis` (warning) — hypothesis not verified within 3 subsequent thoughts
 * - `no_alternatives_explored` (info) — 5+ thoughts with no critique and no branches
 * - `monotonic_type` (info) — 4+ consecutive thoughts with the same thought_type (requires ≥1 explicit type and ≥5 thoughts)
 * - `confidence_drift` (warning) — 3+ consecutive thoughts with strictly decreasing confidence
 * - `healthy_verification` (info) — hypothesis verified within 3 subsequent thoughts
 *
 * @param history - All thoughts in the current session
 * @param branches - Map of branch IDs to their thought arrays
 * @returns Array of detected pattern signals, possibly empty
 *
 * @example
 * ```typescript
 * const evaluator = new ThoughtEvaluator();
 * const patterns = evaluator.computePatternSignals(history, branches);
 * const warnings = patterns.filter(p => p.severity === 'warning');
 * ```
 */
	public computePatternSignals(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): PatternSignal[] {
		if (history.length === 0) return [];

		const signals: PatternSignal[] = [];
		signals.push(...this._detectConsecutiveWithoutVerification(history));
		signals.push(...this._detectUnverifiedHypothesis(history));
		signals.push(...this._detectNoAlternativesExplored(history, branches));
		signals.push(...this._detectMonotonicType(history));
		signals.push(...this._detectConfidenceDrift(history));
		signals.push(...this._detectHealthyVerification(history));
		return signals;
	}

	/** Detect runs of 3+ consecutive thoughts without verification. */
	private _detectConsecutiveWithoutVerification(history: ThoughtData[]): PatternSignal[] {
		const signals: PatternSignal[] = [];
		let runStart = 0;
		for (let i = 0; i < history.length; i++) {
			const type = history[i]!.thought_type ?? 'regular';
			if (type === 'verification') {
				runStart = i + 1;
				continue;
			}
			if (i - runStart + 1 >= 3) {
				const start = history[runStart]!.thought_number ?? runStart + 1;
				const end = history[i]!.thought_number ?? i + 1;
				signals.push({
					pattern: 'consecutive_without_verification',
					severity: 'warning',
					message: `3+ consecutive thoughts (${start}-${end}) without verification`,
					thought_range: [start, end],
				});
				runStart = i + 1;
			}
		}
		return signals;
	}

	/** Detect hypothesis thoughts not verified within 3 subsequent thoughts. */
	private _detectUnverifiedHypothesis(history: ThoughtData[]): PatternSignal[] {
		const signals: PatternSignal[] = [];
		for (let i = 0; i < history.length; i++) {
			if (history[i]!.thought_type !== 'hypothesis') continue;
			const remaining = history.length - i - 1;
			if (remaining < 3) continue;
			const lookahead = history.slice(i + 1, i + 4);
			const hasVerification = lookahead.some((t) => t.thought_type === 'verification');
			if (!hasVerification) {
				const n = history[i]!.thought_number ?? i + 1;
				signals.push({
					pattern: 'unverified_hypothesis',
					severity: 'warning',
					message: `Hypothesis at thought ${n} has not been verified within 3 thoughts`,
					thought_range: [n, n],
				});
			}
		}
		return signals;
	}

	/** Detect 5+ thoughts with no critique and no branches. */
	private _detectNoAlternativesExplored(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): PatternSignal[] {
		if (history.length < 5) return [];
		if (history.some((t) => t.thought_type === 'critique')) return [];
		if (Object.keys(branches).length > 0) return [];
		const start = history[0]!.thought_number ?? 1;
		const end = history[history.length - 1]!.thought_number ?? history.length;
		return [
			{
				pattern: 'no_alternatives_explored',
				severity: 'info',
				message: '5+ thoughts with no critique or branching — consider exploring alternatives',
				thought_range: [start, end],
			},
		];
	}

	/**
	 * Detect runs of 4+ consecutive thoughts with the same thought_type.
	 * Only fires when history has ≥5 thoughts and at least one explicitly set thought_type.
	 */
	private _detectMonotonicType(history: ThoughtData[]): PatternSignal[] {
		if (history.length < 5) return [];
		const hasExplicitType = history.some((t) => t.thought_type !== undefined);
		if (!hasExplicitType) return [];

		const signals: PatternSignal[] = [];
		let runType = history[0]!.thought_type ?? 'regular';
		let runStart = 0;
		let runLength = 1;

		for (let i = 1; i < history.length; i++) {
			const type = history[i]!.thought_type ?? 'regular';
			if (type === runType) {
				runLength++;
			} else {
				if (runLength >= 4) {
					const start = history[runStart]!.thought_number ?? runStart + 1;
					const end = history[runStart + runLength - 1]!.thought_number ?? runStart + runLength;
					signals.push({
						pattern: 'monotonic_type',
						severity: 'info',
						message: `4+ consecutive '${runType}' thoughts (${start}-${end}) — consider varying approach`,
						thought_range: [start, end],
					});
				}
				runType = type;
				runStart = i;
				runLength = 1;
			}
		}
		if (runLength >= 4) {
			const start = history[runStart]!.thought_number ?? runStart + 1;
			const end = history[runStart + runLength - 1]!.thought_number ?? runStart + runLength;
			signals.push({
				pattern: 'monotonic_type',
				severity: 'info',
				message: `4+ consecutive '${runType}' thoughts (${start}-${end}) — consider varying approach`,
				thought_range: [start, end],
			});
		}
		return signals;
	}

	/** Detect runs of 3+ consecutive thoughts with strictly decreasing confidence. */
	private _detectConfidenceDrift(history: ThoughtData[]): PatternSignal[] {
		const signals: PatternSignal[] = [];
		let runStart = -1;
		let runLength = 0;
		let prevConf = -1;

		for (let i = 0; i < history.length; i++) {
			const conf = history[i]!.confidence;
			if (conf === undefined) {
				if (runLength >= 3) {
					const start = history[runStart]!.thought_number ?? runStart + 1;
					const end = history[runStart + runLength - 1]!.thought_number ?? runStart + runLength;
					const firstConf = history[runStart]!.confidence!;
					const lastConf = history[runStart + runLength - 1]!.confidence!;
					signals.push({
						pattern: 'confidence_drift',
						severity: 'warning',
						message: `Confidence decreasing across thoughts ${start}-${end} (${firstConf} → ${lastConf})`,
						thought_range: [start, end],
					});
				}
				runStart = -1;
				runLength = 0;
				prevConf = -1;
				continue;
			}
			if (runLength === 0) {
				runStart = i;
				runLength = 1;
				prevConf = conf;
			} else if (conf < prevConf) {
				runLength++;
				prevConf = conf;
			} else {
				if (runLength >= 3) {
					const start = history[runStart]!.thought_number ?? runStart + 1;
					const end = history[runStart + runLength - 1]!.thought_number ?? runStart + runLength;
					const firstConf = history[runStart]!.confidence!;
					const lastConf = history[runStart + runLength - 1]!.confidence!;
					signals.push({
						pattern: 'confidence_drift',
						severity: 'warning',
						message: `Confidence decreasing across thoughts ${start}-${end} (${firstConf} → ${lastConf})`,
						thought_range: [start, end],
					});
				}
				runStart = i;
				runLength = 1;
				prevConf = conf;
			}
		}
		// Flush final run
		if (runLength >= 3) {
			const start = history[runStart]!.thought_number ?? runStart + 1;
			const end = history[runStart + runLength - 1]!.thought_number ?? runStart + runLength;
			const firstConf = history[runStart]!.confidence!;
			const lastConf = history[runStart + runLength - 1]!.confidence!;
			signals.push({
				pattern: 'confidence_drift',
				severity: 'warning',
				message: `Confidence decreasing across thoughts ${start}-${end} (${firstConf} → ${lastConf})`,
				thought_range: [start, end],
			});
		}
		return signals;
	}

	/** Detect hypothesis verified within 3 subsequent thoughts — positive signal. */
	private _detectHealthyVerification(history: ThoughtData[]): PatternSignal[] {
		const signals: PatternSignal[] = [];
		for (let i = 0; i < history.length; i++) {
			if (history[i]!.thought_type !== 'hypothesis') continue;
			const hypId = history[i]!.hypothesis_id;
			const lookahead = history.slice(i + 1, i + 4);
			const verifier = lookahead.find(
				(t) =>
					t.thought_type === 'verification' &&
					(t.hypothesis_id === hypId || t.verification_target === (history[i]!.thought_number ?? i + 1))
			);
			if (verifier) {
				const n = history[i]!.thought_number ?? i + 1;
				const m = verifier.thought_number ?? history.indexOf(verifier) + 1;
				signals.push({
					pattern: 'healthy_verification',
					severity: 'info',
					message: `Hypothesis at thought ${n} verified at thought ${m} — good practice`,
					thought_range: [n, m],
				});
			}
		}
		return signals;
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

	/** Compute composite structural quality score from history. */
	private _computeStructuralQuality(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>,
		typeDistribution: Record<ThoughtType, number>,
		confidences: number[]
	): { score: number; components: { type_diversity: number; verification_coverage: number; depth_efficiency: number; confidence_stability: number } } | null {
		if (history.length === 0) return null;

		const FLOOR = 0.01;

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
		const chainDepth = this._computeChainDepth(history);
		const branchCount = Object.keys(branches).length;
		const effectiveDepth = Math.max(chainDepth, branchCount + 1);
		const depthEfficiency = Math.max(Math.min(effectiveDepth / total, 1.0), FLOOR);

		// 4. confidence_stability: 1 - stddev(confidences), default 0.5
		const confidenceStability = this._computeConfidenceStability(confidences);

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

	/** Compute confidence stability: 1 - stddev(confidences). */
	private _computeConfidenceStability(confidences: number[]): number {
		const FLOOR = 0.01;
		if (confidences.length === 0) return Math.max(0.5, FLOOR);
		if (confidences.length === 1) return Math.max(1.0, FLOOR);

		const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
		const variance = confidences.reduce((sum, c) => sum + (c - mean) ** 2, 0) / confidences.length;
		const stddev = Math.sqrt(variance);
		return Math.max(1 - stddev, FLOOR);
	}
}
