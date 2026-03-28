import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { ToolAwareSequentialThinkingServer } from '../index.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';
import { Metrics } from '../metrics/metrics.impl.js';
import { FilePersistence } from '../persistence/FilePersistence.js';
import { HttpTransport } from '../transport/HttpTransport.js';
import { SseTransport } from '../transport/SseTransport.js';
import type { ThoughtData } from '../core/thought.js';

function createMetrics(): Metrics {
	return new Metrics({ prefix: 'sequentialthinking' });
}

function createMockMcpServer(): McpServer {
	return new McpServer(
		{ name: 'metrics-integration-test', version: '1.0.0' },
		{
			adapter: new ValibotJsonSchemaAdapter(),
			capabilities: {
				tools: { listChanged: true },
			},
		}
	);
}

function httpRequest(options: {
	port: number;
	method?: string;
	path?: string;
	headers?: Record<string, string>;
	body?: string;
}): Promise<{ statusCode: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = request(
			{
				hostname: '127.0.0.1',
				port: options.port,
				path: options.path ?? '/messages',
				method: options.method ?? 'POST',
				headers: options.headers,
			},
			(res) => {
				let body = '';
				res.on('data', (chunk) => {
					body += chunk.toString();
				});
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode ?? 0,
						body,
					});
				});
			}
		);

		req.on('error', reject);
		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
}

function openSseConnection(port: number): Promise<{ close: () => void }> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const req = request(
			{
				hostname: '127.0.0.1',
				port,
				path: '/sse',
				method: 'GET',
			},
			(res) => {
				let body = '';
				res.on('data', (chunk) => {
					body += chunk.toString();
					if (!settled && body.includes('event: connected')) {
						settled = true;
						resolve({
							close: () => {
								res.destroy();
								req.destroy();
							},
						});
					}
				});
				res.on('error', (error) => {
					if (!settled) {
						settled = true;
						reject(error);
					}
				});
			}
		);

		req.on('error', (error) => {
			if (!settled) {
				settled = true;
				reject(error);
			}
		});
		req.end();
	});
}

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
		server.getContainer().resolve<Metrics>('Metrics').counter('test_metric_total', 1, {});
		const snapshot = server.getMetricsSnapshot();
		expect(snapshot).toContain('# TYPE');
		expect(snapshot).toContain('sequentialthinking_');
	});

	it('increments thought_requests_total from HistoryManager addThought', async () => {
		const thought: ThoughtData = {
			thought: 'Test thought',
			thought_number: 1,
			total_thoughts: 1,
			next_thought_needed: false,
		};

		await server.processThought(thought);

		const snapshot = server.getMetricsSnapshot();
		expect(snapshot).toContain('sequentialthinking_thought_requests_total{} 1');
	});

	it('tracks multiple thought requests without double counting', async () => {
		const thoughts: ThoughtData[] = [
			{ thought: 'First', thought_number: 1, total_thoughts: 3, next_thought_needed: true },
			{ thought: 'Second', thought_number: 2, total_thoughts: 3, next_thought_needed: true },
			{ thought: 'Third', thought_number: 3, total_thoughts: 3, next_thought_needed: false },
		];

		for (const thought of thoughts) {
			await server.processThought(thought);
		}

		const snapshot = server.getMetricsSnapshot();
		expect(snapshot).toContain('sequentialthinking_thought_requests_total{} 3');
	});

	it('collects cache hit and miss counters', () => {
		const metrics = createMetrics();
		const cache = new DiscoveryCache<string>({ metrics });

		expect(cache.get('missing')).toBeNull();
		cache.set('skills', ['commit']);
		expect(cache.get('skills')).toEqual(['commit']);

		const snapshot = metrics.export();
		expect(snapshot).toContain('sequentialthinking_cache_miss_total{} 1');
		expect(snapshot).toContain('sequentialthinking_cache_hit_total{} 1');
	});

	it('tracks active SSE connections with a gauge', async () => {
		const metrics = createMetrics();
		const port = 8100 + Math.floor(Math.random() * 500);
		const transport = new SseTransport({
			port,
			host: '127.0.0.1',
			enableRateLimit: false,
			metrics,
		});

		await transport.connect(createMockMcpServer());
		const connection = await openSseConnection(port);
		expect(metrics.export()).toContain('sequentialthinking_sse_active_connections{} 1');

		connection.close();
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(metrics.export()).toContain('sequentialthinking_sse_active_connections{} 0');

		await transport.stop();
	});

	it('collects HTTP request counters and duration histograms', async () => {
		const metrics = createMetrics();
		const port = 8600 + Math.floor(Math.random() * 500);
		const transport = new HttpTransport({
			port,
			host: '127.0.0.1',
			enableRateLimit: false,
			metrics,
		});

		await transport.connect(createMockMcpServer());

		const response = await httpRequest({
			port,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
		});

		expect(response.statusCode).toBe(200);

		const snapshot = metrics.export();
		expect(snapshot).toContain('sequentialthinking_http_requests_total{} 1');
		expect(snapshot).toContain('sequentialthinking_http_request_duration_seconds_count 1');

		await transport.stop();
	});

	it('records persistence operation durations', async () => {
		const metrics = createMetrics();
		const dataDir = await mkdtemp(join(tmpdir(), 'trace-lattice-metrics-'));
		const persistence = new FilePersistence({ dataDir, metrics });
		const thought: ThoughtData = {
			thought: 'Persist me',
			thought_number: 1,
			total_thoughts: 1,
			next_thought_needed: false,
		};

		await persistence.saveThought(thought);
		await persistence.loadHistory();

		const snapshot = metrics.export();
		expect(snapshot).toContain(
			'sequentialthinking_persistence_op_duration_seconds_count{operation="save_thought"} 1'
		);
		expect(snapshot).toContain(
			'sequentialthinking_persistence_op_duration_seconds_count{operation="load_history"} 2'
		);

		await rm(dataDir, { recursive: true, force: true });
	});
});
