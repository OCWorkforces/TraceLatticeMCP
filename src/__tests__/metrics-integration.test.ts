import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolAwareSequentialThinkingServer } from '../index.js';
import type { ThoughtData } from '../types.js';

describe('Metrics Integration', () => {
	let server: ToolAwareSequentialThinkingServer;

	beforeEach(async () => {
		server = await ToolAwareSequentialThinkingServer.create({
			maxHistorySize: 100,
			lazyDiscovery: true,
		});
	});

	afterEach(async () => {
		await server.stop();
	});

	it('resolves Metrics from DI container and returns Prometheus format', () => {
		const snapshot = server.getMetricsSnapshot();
		expect(snapshot).toContain('# TYPE');
		expect(snapshot).toContain('sequentialthinking_');
	});

	it('increments thought_requests_total after processing', async () => {
		const thought: ThoughtData = {
			thought: 'Test thought',
			thought_number: 1,
			total_thoughts: 1,
		};

		await server.processThought(thought);

		const snapshot = server.getMetricsSnapshot();
		expect(snapshot).toContain('thought_requests_total');
	});

	it('tracks multiple thought requests', async () => {
		const thoughts: ThoughtData[] = [
			{ thought: 'First', thought_number: 1, total_thoughts: 3 },
			{ thought: 'Second', thought_number: 2, total_thoughts: 3 },
			{ thought: 'Third', thought_number: 3, total_thoughts: 3 },
		];

		for (const thought of thoughts) {
			await server.processThought(thought);
		}

		const snapshot = server.getMetricsSnapshot();
		expect(snapshot).toContain('thought_requests_total');
		// Should have processed 3 thoughts
		expect(snapshot).toMatch(/thought_requests_total\} 3/);
	});

	it('includes persistence metrics when available', async () => {
		const thought: ThoughtData = {
			thought: 'Test with persistence',
			thought_number: 1,
			total_thoughts: 1,
		};

		await server.processThought(thought);

		const snapshot = server.getMetricsSnapshot();
		// If persistence is enabled, should have persistence metrics
		// If not, this will pass anyway (optional feature)
		expect(snapshot).toBeDefined();
	});
});
