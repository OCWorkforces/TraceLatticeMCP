import { describe, it, expect } from 'vitest';
import { ThoughtEvaluator } from '../core/ThoughtEvaluator.js';
import { createTestThought } from './helpers/index.js';
import type { ThoughtData } from '../core/thought.js';

describe('ThoughtEvaluator', () => {
	const evaluator = new ThoughtEvaluator();

	// Helper to build history quickly
	function makeThought(overrides?: Partial<ThoughtData>): ThoughtData {
		return createTestThought(overrides);
	}

	describe('computeConfidenceSignals', () => {
		it('returns zeros/nulls for empty history', () => {
			const signals = evaluator.computeConfidenceSignals([], {});

			expect(signals.reasoning_depth).toBe(0);
			expect(signals.revision_count).toBe(0);
			expect(signals.branch_count).toBe(0);
			expect(signals.has_hypothesis).toBe(false);
			expect(signals.has_verification).toBe(false);
			expect(signals.average_confidence).toBeNull();
			expect(signals.thought_type_distribution).toEqual({
				regular: 0,
				hypothesis: 0,
				verification: 0,
				critique: 0,
				synthesis: 0,
				meta: 0,
			});
		});

		it('returns correct values for single thought', () => {
			const thought = makeThought({ thought_number: 1 });
			const signals = evaluator.computeConfidenceSignals([thought], {});

			expect(signals.reasoning_depth).toBe(1);
			expect(signals.revision_count).toBe(0);
			expect(signals.branch_count).toBe(0);
		});

		it('counts mixed thought types correctly', () => {
			const history = [
				makeThought({ thought_type: 'regular' }),
				makeThought({ thought_type: 'hypothesis' }),
				makeThought({ thought_type: 'verification' }),
				makeThought({ thought_type: 'critique' }),
				makeThought({ thought_type: 'hypothesis' }),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});

			expect(signals.thought_type_distribution.regular).toBe(1);
			expect(signals.thought_type_distribution.hypothesis).toBe(2);
			expect(signals.thought_type_distribution.verification).toBe(1);
			expect(signals.thought_type_distribution.critique).toBe(1);
			expect(signals.thought_type_distribution.synthesis).toBe(0);
			expect(signals.thought_type_distribution.meta).toBe(0);
			expect(signals.has_hypothesis).toBe(true);
			expect(signals.has_verification).toBe(true);
		});

		it('computes average confidence correctly', () => {
			const history = [
				makeThought({ confidence: 0.8 }),
				makeThought({ confidence: 0.6 }),
				makeThought({}), // no confidence
				makeThought({ confidence: 1.0 }),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});

			expect(signals.average_confidence).toBeCloseTo(0.8, 5);
		});

		it('counts revisions correctly', () => {
			const history = [
				makeThought({}),
				makeThought({ is_revision: true, revises_thought: 1 }),
				makeThought({}),
				makeThought({ is_revision: true, revises_thought: 3 }),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});

			expect(signals.revision_count).toBe(2);
		});

		it('counts branches correctly', () => {
			const branches = {
				'branch-a': [makeThought({ branch_id: 'branch-a' })],
				'branch-b': [makeThought({ branch_id: 'branch-b' })],
				'branch-c': [makeThought({ branch_id: 'branch-c' })],
			};
			const signals = evaluator.computeConfidenceSignals([], branches);

			expect(signals.branch_count).toBe(3);
		});

		it('defaults thoughts without thought_type to regular', () => {
			const history = [
				makeThought({}), // no thought_type → defaults to regular
				makeThought({}),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});

			expect(signals.thought_type_distribution.regular).toBe(2);
		});
	});

	describe('computeReasoningStats', () => {
		it('returns zeros/nulls for empty history', () => {
			const stats = evaluator.computeReasoningStats([], {});

			expect(stats.total_thoughts).toBe(0);
			expect(stats.total_branches).toBe(0);
			expect(stats.total_revisions).toBe(0);
			expect(stats.total_merges).toBe(0);
			expect(stats.chain_depth).toBe(0);
			expect(stats.hypothesis_count).toBe(0);
			expect(stats.verified_hypothesis_count).toBe(0);
			expect(stats.unresolved_hypothesis_count).toBe(0);
			expect(stats.average_quality_score).toBeNull();
			expect(stats.average_confidence).toBeNull();
			expect(stats.thought_type_counts).toEqual({
				regular: 0,
				hypothesis: 0,
				verification: 0,
				critique: 0,
				synthesis: 0,
				meta: 0,
			});
		});

		it('counts total thoughts correctly', () => {
			const history = [makeThought(), makeThought(), makeThought()];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.total_thoughts).toBe(3);
		});

		it('computes average quality score', () => {
			const history = [
				makeThought({ quality_score: 0.7 }),
				makeThought({ quality_score: 0.9 }),
				makeThought({}), // no score
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.average_quality_score).toBeCloseTo(0.8, 5);
		});

		it('computes average confidence', () => {
			const history = [
				makeThought({ confidence: 0.5 }),
				makeThought({ confidence: 0.7 }),
				makeThought({ confidence: 0.9 }),
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.average_confidence).toBeCloseTo(0.7, 5);
		});

		it('counts revisions', () => {
			const history = [
				makeThought({}),
				makeThought({ is_revision: true }),
				makeThought({}),
				makeThought({ is_revision: true }),
				makeThought({ is_revision: true }),
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.total_revisions).toBe(3);
		});

		it('counts merge operations from merge_from_thoughts', () => {
			const history = [
				makeThought({}),
				makeThought({ merge_from_thoughts: [1, 2] }),
				makeThought({}),
				makeThought({ merge_branch_ids: ['a', 'b'] }),
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.total_merges).toBe(2);
		});

		it('tracks hypothesis + verification chain correctly', () => {
			const history = [
				makeThought({
					thought_type: 'hypothesis',
					hypothesis_id: 'hyp-1',
				}),
				makeThought({
					thought_type: 'hypothesis',
					hypothesis_id: 'hyp-2',
				}),
				makeThought({
					thought_type: 'verification',
					hypothesis_id: 'hyp-1',
				}),
				makeThought({
					thought_type: 'regular',
				}),
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.hypothesis_count).toBe(2);
			expect(stats.verified_hypothesis_count).toBe(1);
			expect(stats.unresolved_hypothesis_count).toBe(1);
		});

		it('counts branches from branches map', () => {
			const branches = {
				alpha: [makeThought()],
				beta: [makeThought()],
			};
			const stats = evaluator.computeReasoningStats([makeThought()], branches);

			expect(stats.total_branches).toBe(2);
		});

		it('computes chain depth for contiguous sequence', () => {
			// 5 thoughts, none branching → chain depth = 5
			const history = [
				makeThought({ thought_number: 1 }),
				makeThought({ thought_number: 2 }),
				makeThought({ thought_number: 3 }),
				makeThought({ thought_number: 4 }),
				makeThought({ thought_number: 5 }),
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.chain_depth).toBe(5);
		});

		it('computes chain depth with branching interruptions', () => {
			// 6 thoughts: 3 contiguous, 1 branch, 2 contiguous → max depth = 3
			const history = [
				makeThought({ thought_number: 1 }),
				makeThought({ thought_number: 2 }),
				makeThought({ thought_number: 3 }),
				makeThought({ thought_number: 4, branch_from_thought: 2 }),
				makeThought({ thought_number: 5 }),
				makeThought({ thought_number: 6 }),
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.chain_depth).toBe(3);
		});

		it('counts thought types correctly in stats', () => {
			const history = [
				makeThought({ thought_type: 'meta' }),
				makeThought({ thought_type: 'synthesis' }),
				makeThought({ thought_type: 'meta' }),
			];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.thought_type_counts.meta).toBe(2);
			expect(stats.thought_type_counts.synthesis).toBe(1);
			expect(stats.thought_type_counts.regular).toBe(0);
		});

		it('defaults thoughts without thought_type to regular in stats', () => {
			const history = [makeThought({}), makeThought({})];
			const stats = evaluator.computeReasoningStats(history, {});

			expect(stats.thought_type_counts.regular).toBe(2);
		});
	});

	describe('computePatternSignals', () => {

		it('returns empty array for empty history', () => {
			expect(evaluator.computePatternSignals([], {})).toEqual([]);
		});

		it('returns empty array for single thought', () => {
			const history = [makeThought({ thought_number: 1, thought: 'test' })];
			expect(evaluator.computePatternSignals(history, {})).toEqual([]);
		});

		// consecutive_without_verification
		it('detects 3+ consecutive regular thoughts without verification', () => {
			const history = [
				makeThought({ thought_number: 1 }),
				makeThought({ thought_number: 2 }),
				makeThought({ thought_number: 3 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			const match = signals.find((s) => s.pattern === 'consecutive_without_verification');
			expect(match).toBeDefined();
			expect(match!.severity).toBe('warning');
			expect(match!.thought_range).toEqual([1, 3]);
		});

		it('does not fire when verification exists in the run', () => {
			const history = [
				makeThought({ thought_number: 1 }),
				makeThought({ thought_number: 2, thought_type: 'verification' }),
				makeThought({ thought_number: 3 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			expect(
				signals.find((s) => s.pattern === 'consecutive_without_verification')
			).toBeUndefined();
		});

		it('treats undefined thought_type as regular', () => {
			const history = [
				makeThought({ thought_number: 1 }),
				makeThought({ thought_number: 2 }),
				makeThought({ thought_number: 3 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			const match = signals.find((s) => s.pattern === 'consecutive_without_verification');
			expect(match).toBeDefined();
		});

		// unverified_hypothesis
		it('detects hypothesis without verification within 3 thoughts', () => {
			const history = [
				makeThought({ thought_number: 1, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 2 }),
				makeThought({ thought_number: 3 }),
				makeThought({ thought_number: 4 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			const match = signals.find((s) => s.pattern === 'unverified_hypothesis');
			expect(match).toBeDefined();
			expect(match!.severity).toBe('warning');
		});

		it('does not fire when verification exists within 3 thoughts', () => {
			const history = [
				makeThought({ thought_number: 1, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 2, thought_type: 'verification' }),
				makeThought({ thought_number: 3 }),
				makeThought({ thought_number: 4 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			expect(
				signals.find((s) => s.pattern === 'unverified_hypothesis')
			).toBeUndefined();
		});

		it('does not fire when fewer than 3 subsequent thoughts exist', () => {
			const history = [
				makeThought({ thought_number: 1, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 2 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			expect(
				signals.find((s) => s.pattern === 'unverified_hypothesis')
			).toBeUndefined();
		});

		// no_alternatives_explored
		it('detects 5+ thoughts with no critique and no branches', () => {
			const history = Array.from({ length: 5 }, (_, i) =>
				makeThought({ thought_number: i + 1 })
			);
			const signals = evaluator.computePatternSignals(history, {});
			const match = signals.find((s) => s.pattern === 'no_alternatives_explored');
			expect(match).toBeDefined();
			expect(match!.severity).toBe('info');
		});

		it('does not fire when critique exists', () => {
			const history = [
				makeThought({ thought_number: 1 }),
				makeThought({ thought_number: 2 }),
				makeThought({ thought_number: 3 }),
				makeThought({ thought_number: 4, thought_type: 'critique' }),
				makeThought({ thought_number: 5 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			expect(
				signals.find((s) => s.pattern === 'no_alternatives_explored')
			).toBeUndefined();
		});

		it('does not fire when branches exist', () => {
			const history = Array.from({ length: 5 }, (_, i) =>
				makeThought({ thought_number: i + 1 })
			);
			const signals = evaluator.computePatternSignals(history, {
				'branch-a': [makeThought({ thought_number: 1 })],
			});
			expect(
				signals.find((s) => s.pattern === 'no_alternatives_explored')
			).toBeUndefined();
		});

		// monotonic_type
		it('detects 4+ consecutive same thought_type', () => {
			const history = [
				makeThought({ thought_number: 1, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 2, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 3, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 4, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 5, thought_type: 'hypothesis' }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			const match = signals.find((s) => s.pattern === 'monotonic_type');
			expect(match).toBeDefined();
			expect(match!.severity).toBe('info');
		});

		it('does not fire for 3 consecutive same type', () => {
			const history = [
				makeThought({ thought_number: 1, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 2, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 3, thought_type: 'hypothesis' }),
				makeThought({ thought_number: 4, thought_type: 'verification' }),
				makeThought({ thought_number: 5 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			expect(signals.find((s) => s.pattern === 'monotonic_type')).toBeUndefined();
		});

		// confidence_drift
		it('detects 3+ consecutive decreasing confidence values', () => {
			const history = [
				makeThought({ thought_number: 1, confidence: 0.9 }),
				makeThought({ thought_number: 2, confidence: 0.7 }),
				makeThought({ thought_number: 3, confidence: 0.5 }),
				makeThought({ thought_number: 4 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			const match = signals.find((s) => s.pattern === 'confidence_drift');
			expect(match).toBeDefined();
			expect(match!.severity).toBe('warning');
		});

		it('does not fire when confidence increases', () => {
			const history = [
				makeThought({ thought_number: 1, confidence: 0.5 }),
				makeThought({ thought_number: 2, confidence: 0.7 }),
				makeThought({ thought_number: 3, confidence: 0.9 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			expect(signals.find((s) => s.pattern === 'confidence_drift')).toBeUndefined();
		});

		it('ignores thoughts without confidence values', () => {
			const history = [
				makeThought({ thought_number: 1, confidence: 0.9 }),
				makeThought({ thought_number: 2 }),
				makeThought({ thought_number: 3, confidence: 0.5 }),
			];
			const signals = evaluator.computePatternSignals(history, {});
			expect(signals.find((s) => s.pattern === 'confidence_drift')).toBeUndefined();
		});

		// healthy_verification
		it('detects hypothesis followed by verification within 3 thoughts', () => {
			const history = [
				makeThought({
					thought_number: 1,
					thought_type: 'hypothesis',
					hypothesis_id: 'hyp-1',
				}),
				makeThought({ thought_number: 2 }),
				makeThought({
					thought_number: 3,
					thought_type: 'verification',
					hypothesis_id: 'hyp-1',
				}),
			];
			const signals = evaluator.computePatternSignals(history, {});
			const match = signals.find((s) => s.pattern === 'healthy_verification');
			expect(match).toBeDefined();
			expect(match!.severity).toBe('info');
		});
	});

	describe('structural_quality', () => {

		it('is undefined for empty history', () => {
			const signals = evaluator.computeConfidenceSignals([], {});
			expect(signals.structural_quality).toBeUndefined();
			expect(signals.quality_components).toBeUndefined();
		});

		it('computes type_diversity using Shannon entropy', () => {
			const history = [
				makeThought({ thought_type: 'regular' }),
				makeThought({ thought_type: 'hypothesis' }),
				makeThought({ thought_type: 'verification' }),
				makeThought({ thought_type: 'critique' }),
				makeThought({ thought_type: 'synthesis' }),
				makeThought({ thought_type: 'meta' }),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.structural_quality).toBeDefined();
			expect(signals.quality_components!.type_diversity).toBeCloseTo(1.0, 2);
		});

		it('returns type_diversity near 0 for all-same-type history', () => {
			const history = [makeThought({}), makeThought({})];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.quality_components!.type_diversity).toBeGreaterThanOrEqual(0.01);
			expect(signals.quality_components!.type_diversity).toBeLessThanOrEqual(0.1);
		});

		it('returns verification_coverage 1.0 when no hypotheses', () => {
			const history = [makeThought({ thought_type: 'regular' })];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.quality_components!.verification_coverage).toBe(1.0);
		});

		it('returns verification_coverage based on verified/total hypotheses', () => {
			const history = [
				makeThought({ thought_type: 'hypothesis', hypothesis_id: 'h1' }),
				makeThought({ thought_type: 'hypothesis', hypothesis_id: 'h2' }),
				makeThought({ thought_type: 'verification', hypothesis_id: 'h1' }),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.quality_components!.verification_coverage).toBeCloseTo(0.5, 2);
		});

		it('computes depth_efficiency with branching bonus', () => {
			const history = [makeThought({}), makeThought({})];
			const branches = { b1: [makeThought({})] };
			const signals = evaluator.computeConfidenceSignals(history, branches);
			expect(signals.quality_components!.depth_efficiency).toBeGreaterThan(0);
		});

		it('returns confidence_stability 0.5 when no confidence values', () => {
			const history = [makeThought({}), makeThought({})];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.quality_components!.confidence_stability).toBe(0.5);
		});

		it('computes confidence_stability from stddev', () => {
			const history = [
				makeThought({ confidence: 1.0 }),
				makeThought({ confidence: 0.0 }),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.quality_components!.confidence_stability).toBeCloseTo(0.5, 2);
		});

		it('computes weighted geometric mean correctly', () => {
			const history = [
				makeThought({ thought_type: 'regular' }),
				makeThought({ thought_type: 'hypothesis' }),
				makeThought({ thought_type: 'verification' }),
				makeThought({ thought_type: 'critique' }),
				makeThought({ thought_type: 'synthesis' }),
				makeThought({ thought_type: 'meta' }),
			];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.structural_quality).toBeGreaterThan(0);
			expect(signals.structural_quality).toBeLessThanOrEqual(1.0);
		});

		it('floors components at 0.01 to prevent geometric mean collapse', () => {
			const history = [makeThought({}), makeThought({})];
			const signals = evaluator.computeConfidenceSignals(history, {});
			expect(signals.quality_components!.type_diversity).toBeGreaterThanOrEqual(0.01);
			expect(signals.structural_quality).toBeGreaterThan(0);
		});
	});
});

describe('ThoughtEvaluator — uncovered branches (lines 347-351)', () => {
	const evaluator = new ThoughtEvaluator();

	function makeThought(overrides?: Partial<ThoughtData>): ThoughtData {
		return createTestThought(overrides);
	}

	describe('confidence drift — mid-run non-decreasing reset (else branch)', () => {
		it('should detect confidence_drift when 3+ decreasing run is broken by non-decreasing value', () => {
			// Build a run of 3+ strictly decreasing confidences, then a non-decreasing one.
			// This hits the else branch at line 345-361 where runLength >= 3.
			const history = [
				makeThought({ thought_number: 1, confidence: 0.9 }),
				makeThought({ thought_number: 2, confidence: 0.7 }),
				makeThought({ thought_number: 3, confidence: 0.5 }),
				makeThought({ thought_number: 4, confidence: 0.8 }), // non-decreasing → breaks run
			];
			const signals = evaluator.computeConfidenceSignals(history, {});
			const patterns = evaluator.computePatternSignals(history, {});
			const driftPatterns = patterns.filter((p) => p.pattern === 'confidence_drift');
			expect(driftPatterns.length).toBeGreaterThanOrEqual(1);
			expect(driftPatterns[0]!.severity).toBe('warning');
			expect(driftPatterns[0]!.thought_range).toEqual([1, 3]);
			expect(signals).toBeDefined();
		});

		it('should not detect confidence_drift when run of only 2 is broken', () => {
			// Run of 2 strictly decreasing, then non-decreasing → no signal
			const history = [
				makeThought({ thought_number: 1, confidence: 0.9 }),
				makeThought({ thought_number: 2, confidence: 0.7 }),
				makeThought({ thought_number: 3, confidence: 0.8 }), // non-decreasing, run was only 2
			];
			const patterns = evaluator.computePatternSignals(history, {});
			const driftPatterns = patterns.filter((p) => p.pattern === 'confidence_drift');
			expect(driftPatterns).toHaveLength(0);
		});

		it('should detect confidence_drift when 4-run is broken at the end by equal value', () => {
			const history = [
				makeThought({ thought_number: 1, confidence: 1.0 }),
				makeThought({ thought_number: 2, confidence: 0.8 }),
				makeThought({ thought_number: 3, confidence: 0.6 }),
				makeThought({ thought_number: 4, confidence: 0.4 }),
				makeThought({ thought_number: 5, confidence: 0.4 }), // equal → non-decreasing, breaks run
			];
			const patterns = evaluator.computePatternSignals(history, {});
			const driftPatterns = patterns.filter((p) => p.pattern === 'confidence_drift');
			expect(driftPatterns.length).toBeGreaterThanOrEqual(1);
			expect(driftPatterns[0]!.thought_range).toEqual([1, 4]);
		});
	});
});
