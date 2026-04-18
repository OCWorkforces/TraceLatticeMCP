import { describe, it, expect, beforeEach } from 'vitest';
import { ThoughtProcessor } from '../../core/ThoughtProcessor.js';
import { ThoughtFormatter } from '../../core/ThoughtFormatter.js';
import { ThoughtEvaluator } from '../../core/ThoughtEvaluator.js';
import { InMemorySuspensionStore } from '../../core/tools/InMemorySuspensionStore.js';
import { SequentialStrategy } from '../../core/reasoning/strategies/SequentialStrategy.js';
import { MockHistoryManager } from '../helpers/factories.js';
import type { FeatureFlags } from '../../ServerConfig.js';
import type { ThoughtData } from '../../core/thought.js';

function makeFeatures(overrides: Partial<FeatureFlags> = {}): FeatureFlags {
	return {
		dagEdges: false,
		reasoningStrategy: 'sequential',
		calibration: false,
		compression: false,
		toolInterleave: true,
		newThoughtTypes: false,
		outcomeRecording: false,
		...overrides,
	};
}

function makeProcessor(
	store: InMemorySuspensionStore,
	features: FeatureFlags = makeFeatures(),
): { processor: ThoughtProcessor; history: MockHistoryManager } {
	const history = new MockHistoryManager();
	const processor = new ThoughtProcessor(
		history,
		new ThoughtFormatter(),
		new ThoughtEvaluator(),
		undefined,
		new SequentialStrategy(),
		undefined,
		store,
		features,
	);
	return { processor, history };
}

describe('ThoughtProcessor — tool interleave', () => {
	let store: InMemorySuspensionStore;

	beforeEach(() => {
		store = new InMemorySuspensionStore();
	});

	it('tool_call returns a suspended envelope with continuation_token and tool metadata', async () => {
		const { processor } = makeProcessor(store);
		const result = await processor.process({
			thought: 'invoke search',
			thought_number: 1,
			total_thoughts: 3,
			next_thought_needed: true,
			thought_type: 'tool_call',
			tool_name: 'search',
			tool_arguments: { q: 'hello' },
		});
		expect(result.isError).toBeFalsy();
		const payload = JSON.parse(result.content[0]!.text);
		expect(payload.status).toBe('suspended');
		expect(typeof payload.continuation_token).toBe('string');
		expect(payload.tool_name).toBe('search');
		expect(payload.tool_arguments).toEqual({ q: 'hello' });
		expect(typeof payload.expires_at).toBe('number');
		expect(payload.thought_number).toBe(1);
		expect(payload.total_thoughts).toBe(3);
	});

	it('tool_call suspend envelope omits confidence_signals and reasoning_stats', async () => {
		const { processor } = makeProcessor(store);
		const result = await processor.process({
			thought: 'invoke',
			thought_number: 1,
			total_thoughts: 2,
			next_thought_needed: true,
			thought_type: 'tool_call',
			tool_name: 'search',
			tool_arguments: {},
		});
		const payload = JSON.parse(result.content[0]!.text);
		expect(payload.confidence_signals).toBeUndefined();
		expect(payload.reasoning_stats).toBeUndefined();
	});

	it('tool_call persists the originating thought to history before suspending', async () => {
		const { processor, history } = makeProcessor(store);
		await processor.process({
			thought: 'invoke',
			thought_number: 1,
			total_thoughts: 1,
			next_thought_needed: true,
			thought_type: 'tool_call',
			tool_name: 'search',
			tool_arguments: {},
		});
		const items = history.getHistory();
		expect(items).toHaveLength(1);
		expect(items[0]!.thought_type).toBe('tool_call');
		expect(items[0]!.tool_name).toBe('search');
	});

	it('tool_observation resumes via continuation_token and runs the normal pipeline', async () => {
		const { processor, history } = makeProcessor(store);
		const callResult = await processor.process({
			thought: 'invoke',
			thought_number: 1,
			total_thoughts: 2,
			next_thought_needed: true,
			thought_type: 'tool_call',
			tool_name: 'search',
			tool_arguments: {},
		});
		const token = JSON.parse(callResult.content[0]!.text).continuation_token as string;

		const obsResult = await processor.process({
			thought: 'tool returned X',
			thought_number: 2,
			total_thoughts: 2,
			next_thought_needed: false,
			thought_type: 'tool_observation',
			continuation_token: token,
		});
		expect(obsResult.isError).toBeFalsy();
		const payload = JSON.parse(obsResult.content[0]!.text);
		// Normal pipeline shape — has confidence_signals + reasoning_stats.
		expect(payload.thought_number).toBe(2);
		expect(payload.confidence_signals).toBeDefined();
		expect(payload.reasoning_stats).toBeDefined();
		// Observation persisted to history.
		const items = history.getHistory();
		expect(items).toHaveLength(2);
		expect(items[1]!.thought_type).toBe('tool_observation');
	});

	it('tool_observation attaches _resumedFrom referencing the tool_call thought_number', async () => {
		const { processor, history } = makeProcessor(store);
		const callResult = await processor.process({
			thought: 'invoke',
			thought_number: 7,
			total_thoughts: 8,
			next_thought_needed: true,
			thought_type: 'tool_call',
			tool_name: 'search',
			tool_arguments: {},
		});
		const token = JSON.parse(callResult.content[0]!.text).continuation_token as string;

		await processor.process({
			thought: 'observed',
			thought_number: 8,
			total_thoughts: 8,
			next_thought_needed: false,
			thought_type: 'tool_observation',
			continuation_token: token,
		});

		const obs = history.getHistory()[1] as ThoughtData & { _resumedFrom?: number };
		expect(obs._resumedFrom).toBe(7);
	});

	it('tool_observation with an unknown token returns SuspensionNotFoundError', async () => {
		const { processor } = makeProcessor(store);
		const result = await processor.process({
			thought: 'observed',
			thought_number: 1,
			total_thoughts: 1,
			next_thought_needed: false,
			thought_type: 'tool_observation',
			continuation_token: 'definitely-not-a-real-token',
		});
		expect(result.isError).toBe(true);
		const payload = JSON.parse(result.content[0]!.text);
		expect(payload.status).toBe('failed');
		expect(payload.error).toMatch(/Suspension token not found/);
	});

	it('tool_observation with an expired token returns SuspensionExpiredError', async () => {
		// Manually seed an expired record in the store.
		const expired = store.suspend({
			sessionId: '__global__',
			toolCallThoughtNumber: 1,
			toolName: 'search',
			toolArguments: {},
			ttlMs: 1,
			expiresAt: 0,
		});
		// Wait at least 2ms so peek sees expiresAt <= Date.now().
		await new Promise((r) => setTimeout(r, 5));

		const { processor } = makeProcessor(store);
		const result = await processor.process({
			thought: 'observed',
			thought_number: 2,
			total_thoughts: 2,
			next_thought_needed: false,
			thought_type: 'tool_observation',
			continuation_token: expired.token,
		});
		expect(result.isError).toBe(true);
		const payload = JSON.parse(result.content[0]!.text);
		expect(payload.error).toMatch(/Suspension token expired/);
	});

	it('tool_call suspend single-uses the token (resume after consume returns NotFound)', async () => {
		const { processor } = makeProcessor(store);
		const callResult = await processor.process({
			thought: 'invoke',
			thought_number: 1,
			total_thoughts: 3,
			next_thought_needed: true,
			thought_type: 'tool_call',
			tool_name: 'search',
			tool_arguments: {},
		});
		const token = JSON.parse(callResult.content[0]!.text).continuation_token as string;

		// First observation succeeds.
		const ok = await processor.process({
			thought: 'first observation',
			thought_number: 2,
			total_thoughts: 3,
			next_thought_needed: true,
			thought_type: 'tool_observation',
			continuation_token: token,
		});
		expect(ok.isError).toBeFalsy();

		// Second observation with same token should fail.
		const dup = await processor.process({
			thought: 'duplicate observation',
			thought_number: 3,
			total_thoughts: 3,
			next_thought_needed: false,
			thought_type: 'tool_observation',
			continuation_token: token,
		});
		expect(dup.isError).toBe(true);
		const payload = JSON.parse(dup.content[0]!.text);
		expect(payload.error).toMatch(/Suspension token not found/);
	});
});
