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
			const current = makeThought();
			const signals = evaluator.computeConfidenceSignals(current, [], {});

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
			const signals = evaluator.computeConfidenceSignals(thought, [thought], {});

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
			const current = makeThought();
			const signals = evaluator.computeConfidenceSignals(current, history, {});

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
			const current = makeThought();
			const signals = evaluator.computeConfidenceSignals(current, history, {});

			expect(signals.average_confidence).toBeCloseTo(0.8, 5);
		});

		it('counts revisions correctly', () => {
			const history = [
				makeThought({}),
				makeThought({ is_revision: true, revises_thought: 1 }),
				makeThought({}),
				makeThought({ is_revision: true, revises_thought: 3 }),
			];
			const current = makeThought();
			const signals = evaluator.computeConfidenceSignals(current, history, {});

			expect(signals.revision_count).toBe(2);
		});

		it('counts branches correctly', () => {
			const branches = {
				'branch-a': [makeThought({ branch_id: 'branch-a' })],
				'branch-b': [makeThought({ branch_id: 'branch-b' })],
				'branch-c': [makeThought({ branch_id: 'branch-c' })],
			};
			const signals = evaluator.computeConfidenceSignals(makeThought(), [], branches);

			expect(signals.branch_count).toBe(3);
		});

		it('defaults thoughts without thought_type to regular', () => {
			const history = [
				makeThought({}), // no thought_type → defaults to regular
				makeThought({}),
			];
			const current = makeThought();
			const signals = evaluator.computeConfidenceSignals(current, history, {});

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
});
