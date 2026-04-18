/**
 * Integration tests for the auto-compression trigger in ThoughtProcessor.
 *
 * Verifies that when a reasoning strategy returns `action: 'terminate'` AND
 * the compression service is wired AND the current thought has a `branch_id`,
 * the processor invokes `CompressionService.compressBranch()` to produce a
 * Summary in the SummaryStore. Also verifies that compression failures never
 * break the thought pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { ThoughtProcessor } from '../../core/ThoughtProcessor.js';
import { ThoughtFormatter } from '../../core/ThoughtFormatter.js';
import { ThoughtEvaluator } from '../../core/ThoughtEvaluator.js';
import { HistoryManager } from '../../core/HistoryManager.js';
import { EdgeStore } from '../../core/graph/EdgeStore.js';
import { CompressionService } from '../../core/compression/CompressionService.js';
import { InMemorySummaryStore } from '../../core/compression/InMemorySummaryStore.js';
import { NullLogger } from '../../logger/NullLogger.js';
import type {
	IReasoningStrategy,
	StrategyContext,
	StrategyDecision,
} from '../../contracts/strategy.js';
import { createTestThought } from '../helpers/index.js';

class TerminateStrategy implements IReasoningStrategy {
	readonly name = 'terminate-always';
	decide(_ctx: StrategyContext): StrategyDecision {
		return { action: 'terminate', reason: 'forced for test' };
	}
	shouldBranch(_ctx: StrategyContext): boolean {
		return false;
	}
	shouldTerminate(_ctx: StrategyContext): boolean {
		return true;
	}
}

class ContinueStrategy implements IReasoningStrategy {
	readonly name = 'continue-always';
	decide(_ctx: StrategyContext): StrategyDecision {
		return { action: 'continue' };
	}
	shouldBranch(_ctx: StrategyContext): boolean {
		return false;
	}
	shouldTerminate(_ctx: StrategyContext): boolean {
		return false;
	}
}

interface Deps {
	history: HistoryManager;
	formatter: ThoughtFormatter;
	evaluator: ThoughtEvaluator;
	logger: NullLogger;
	edgeStore: EdgeStore;
	summaryStore: InMemorySummaryStore;
	compression: CompressionService;
}

function makeDeps(): Deps {
	const logger = new NullLogger();
	const edgeStore = new EdgeStore();
	const summaryStore = new InMemorySummaryStore();
	const history = new HistoryManager({ logger, edgeStore, dagEdges: true });
	const formatter = new ThoughtFormatter();
	const evaluator = new ThoughtEvaluator();
	const compression = new CompressionService({
		historyManager: history,
		edgeStore,
		summaryStore,
		logger,
	});
	return { history, formatter, evaluator, logger, edgeStore, summaryStore, compression };
}

describe('Compression Auto-Trigger Integration', () => {
	let deps: Deps;

	beforeEach(() => {
		deps = makeDeps();
	});

	it('creates a Summary on terminate when compression is enabled and thought has branch_id', async () => {
		const processor = new ThoughtProcessor(
			deps.history,
			deps.formatter,
			deps.evaluator,
			deps.logger,
			new TerminateStrategy(),
			deps.compression
		);

		// Seed a thought to anchor the branch off of.
		await processor.process(
			createTestThought({
				thought: 'root thought one',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
			})
		);

		// Branch thought — terminate strategy should trigger compression.
		const result = await processor.process(
			createTestThought({
				thought: 'branch terminal thought summary candidate',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				branch_from_thought: 1,
				branch_id: 'alt-1',
			})
		);

		expect(result.isError).toBeUndefined();

		const summaries = deps.summaryStore.forBranch('__global__', 'alt-1');
		expect(summaries.length).toBe(1);
		expect(summaries[0]!.branchId).toBe('alt-1');
		expect(summaries[0]!.sessionId).toBe('__global__');
	});

	it('does NOT compress when compression service is not wired (flag-off path)', async () => {
		const processor = new ThoughtProcessor(
			deps.history,
			deps.formatter,
			deps.evaluator,
			deps.logger,
			new TerminateStrategy()
			// no compressionService param
		);

		await processor.process(
			createTestThought({
				thought: 'root thought',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
			})
		);
		await processor.process(
			createTestThought({
				thought: 'terminal branch thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				branch_from_thought: 1,
				branch_id: 'alt-2',
			})
		);

		expect(deps.summaryStore.size()).toBe(0);
	});

	it('does NOT compress on main chain (no branch_id) even when terminate fires', async () => {
		const processor = new ThoughtProcessor(
			deps.history,
			deps.formatter,
			deps.evaluator,
			deps.logger,
			new TerminateStrategy(),
			deps.compression
		);

		const result = await processor.process(
			createTestThought({
				thought: 'main chain terminal',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			})
		);

		expect(result.isError).toBeUndefined();
		expect(deps.summaryStore.size()).toBe(0);
	});

	it('does NOT compress when strategy decision is not terminate', async () => {
		const processor = new ThoughtProcessor(
			deps.history,
			deps.formatter,
			deps.evaluator,
			deps.logger,
			new ContinueStrategy(),
			deps.compression
		);

		await processor.process(
			createTestThought({
				thought: 'root',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
			})
		);
		await processor.process(
			createTestThought({
				thought: 'branch but continuing',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: true,
				branch_from_thought: 1,
				branch_id: 'alt-3',
			})
		);

		expect(deps.summaryStore.size()).toBe(0);
	});

	it('pipeline still completes when compressionService.compressBranch throws', async () => {
		// Wrap compression service so compressBranch throws.
		const throwingCompression = {
			compressBranch: () => {
				throw new Error('boom from compression');
			},
		} as unknown as CompressionService;

		const processor = new ThoughtProcessor(
			deps.history,
			deps.formatter,
			deps.evaluator,
			deps.logger,
			new TerminateStrategy(),
			throwingCompression
		);

		await processor.process(
			createTestThought({
				thought: 'root',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
			})
		);
		const result = await processor.process(
			createTestThought({
				thought: 'branch terminal',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				branch_from_thought: 1,
				branch_id: 'alt-4',
			})
		);

		// Pipeline completed successfully despite compression throwing.
		expect(result.isError).toBeUndefined();
		const parsed = JSON.parse(result.content[0]!.text) as {
			thought_number: number;
			next_thought_needed: boolean;
		};
		expect(parsed.thought_number).toBe(2);
		expect(parsed.next_thought_needed).toBe(false);
	});
});
