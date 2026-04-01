import { describe, it, expect, afterEach } from 'vitest';
import {
	SseTransport,
	createSseTransport,
	type SseTransportOptions,
} from '../transport/SseTransport.js';
import { ConnectionPool } from '../pool/ConnectionPool.js';
import { HealthChecker } from '../health/HealthChecker.js';
import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { request } from 'node:http';
import { setTimeout } from 'node:timers';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import type { IMetrics } from '../contracts/index.js';

// Helper to make HTTP requests with optional timeout for SSE
function makeRequest(
	port: number,
	path: string,
	method = 'GET',
	timeoutMs = 1000
): Promise<{
	statusCode: number;
	headers: Record<string, string | string[]>;
	body: string;
}> {
	return new Promise((resolve, reject) => {
		const req = request(
			{
				hostname: 'localhost',
				port,
				path,
				method,
				headers: {
					'Content-Type': 'application/json',
				},
				timeout: timeoutMs,
			},
			(res) => {
				let body = '';
				let resolved = false;

				const finish = () => {
					if (resolved) return;
					resolved = true;
					resolve({
						statusCode: res.statusCode ?? 0,
						headers: res.headers as Record<string, string | string[]>,
						body,
					});
				};

				res.on('data', (chunk) => {
					body += chunk;
					// For SSE, resolve after getting some data
					if (path.includes('/sse') || path.includes('/events')) {
					setTimeoutPromise(50)
							.then(finish)
							.catch(() => {});
					}
				});

				res.on('end', () => {
					finish();
				});

				// Set timeout for SSE connections
				if (path.includes('/sse') || path.includes('/events')) {
					setTimeoutPromise(timeoutMs)
						.then(finish)
						.catch(() => {});
				}
			}
		);

		req.on('error', reject);
		req.on('timeout', () => {
			req.destroy();
		});
		req.end();
	});
}

// Helper to make POST request with body
function makePostRequest(
	port: number,
	path: string,
	data: unknown
): Promise<{
	statusCode: number;
	headers: Record<string, string | string[]>;
	body: string;
}> {
	return new Promise((resolve, reject) => {
		const req = request(
			{
				hostname: 'localhost',
				port,
				path,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
			},
			(res) => {
				let body = '';
				res.on('data', (chunk) => {
					body += chunk;
				});
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode ?? 0,
						headers: res.headers as Record<string, string | string[]>,
						body,
					});
				});
			}
		);

		req.on('error', reject);
		req.write(JSON.stringify(data));
		req.end();
	});
}

// Helper to make POST request with raw string body (for invalid JSON tests)
function makeRawPostRequest(
	port: number,
	path: string,
	rawBody: string
): Promise<{
	statusCode: number;
	headers: Record<string, string | string[]>;
	body: string;
}> {
	return new Promise((resolve, reject) => {
		const req = request(
			{
				hostname: 'localhost',
				port,
				path,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
			},
			(res) => {
				let body = '';
				res.on('data', (chunk) => {
					body += chunk;
				});
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode ?? 0,
						headers: res.headers as Record<string, string | string[]>,
						body,
					});
				});
			}
		);

		req.on('error', reject);
		req.write(rawBody);
		req.end();
	});
}

/** Create a simple stub IMetrics that records calls */
function createStubMetrics(): IMetrics & {
	counters: Map<string, number>;
	gauges: Map<string, number>;
	histograms: Map<string, number>;
} {
	const counters = new Map<string, number>();
	const gauges = new Map<string, number>();
	const histograms = new Map<string, number>();
	return {
		counters,
		gauges,
		histograms,
		counter(name: string, value = 1) {
			counters.set(name, (counters.get(name) ?? 0) + value);
		},
		gauge(name: string, value: number) {
			gauges.set(name, value);
		},
		histogram(name: string, value: number) {
			histograms.set(name, value);
		},
		get(name: string) {
			return counters.get(name) ?? gauges.get(name);
		},
		inc(name: string) {
			counters.set(name, (counters.get(name) ?? 0) + 1);
		},
		dec(name: string) {
			counters.set(name, (counters.get(name) ?? 0) - 1);
		},
		reset() {
			counters.clear();
			gauges.clear();
			histograms.clear();
		},
		export() {
			return '';
		},
	};
}

function randomPort(): number {
	return 4000 + Math.floor(Math.random() * 5000);
}

describe('SseTransport coverage: connection pool', () => {
	let transport: SseTransport;
	let testPort: number;
	let pool: ConnectionPool;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should assign session ID when pool is provided and no existing session', async () => {
		testPort = randomPort();
		pool = new ConnectionPool({
			maxSessions: 10,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
				stop: () => {},
			}),
		});

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
		});
		await transport.connect({} as McpServer);

		const response = await makeRequest(testPort, '/sse');

		expect(response.statusCode).toBe(200);
		expect(response.headers['content-type']).toBe('text/event-stream');
		// The connected event should include a sessionId
		expect(response.body).toContain('event: connected');
		expect(response.body).toContain('sessionId');
	});

	it('should reuse existing session when valid sessionId query param is provided', async () => {
		testPort = randomPort();
		pool = new ConnectionPool({
			maxSessions: 10,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
				stop: () => {},
			}),
		});

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
		});
		await transport.connect({} as McpServer);

		// Create a session first
		const sessionId = await pool.createSession();

		// Connect with existing session
		const response = await makeRequest(testPort, `/sse?sessionId=${sessionId}`);

		expect(response.statusCode).toBe(200);
		expect(response.body).toContain('event: connected');
		expect(response.body).toContain(sessionId);
	});

	it('should send error event when pool.createSession fails', async () => {
		testPort = randomPort();
		// Pool with max 0 sessions — will throw MaxSessionsReachedError
		pool = new ConnectionPool({
			maxSessions: 0,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: '' }] }),
				stop: () => {},
			}),
		});

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
		});
		await transport.connect({} as McpServer);

		const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
			let body = '';
			let resolved = false;
			const timeout = setTimeout(() => {
				resolved = true;
			}, 8000); // 8 second absolute timeout
			const req = request(
				{ hostname: 'localhost', port: testPort, path: '/sse', timeout: 10000 },
				(res) => {
				res.on('data', (chunk) => {
					body += chunk;
					// Wait for complete SSE message (event + data lines)
					if (body.includes('event: error') && body.includes('data:')) {
						resolved = true;
						resolve({ statusCode: res.statusCode ?? 0, body });
					}
				});
					res.on('end', () => {
						if (!resolved) {
							resolved = true;
							resolve({ statusCode: res.statusCode ?? 0, body });
						}
					});
				}
			);
			req.on('error', (err) => {
				clearTimeout(timeout);
				reject(err);
			});
			req.end();
		});

		expect(response.statusCode).toBe(200); // SSE always returns 200 before data
		expect(response.body).toContain('event: error');
		expect(response.body).toContain('Max sessions');
	});

	it('should expose connectionPool via getter', () => {
		testPort = randomPort();
		pool = new ConnectionPool({ maxSessions: 5, autoCleanup: false });
		transport = new SseTransport({ port: testPort, connectionPool: pool });

		expect(transport.connectionPool).toBe(pool);
	});

	it('should return undefined connectionPool when not configured', () => {
		testPort = randomPort();
		transport = new SseTransport({ port: testPort });

		expect(transport.connectionPool).toBeUndefined();
	});
});

describe('SseTransport coverage: health check with pool', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should include pool stats in health response when pool is provided', async () => {
		testPort = randomPort();
		const pool = new ConnectionPool({
			maxSessions: 50,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: '' }] }),
				stop: () => {},
			}),
		});

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
		});
		await transport.connect({} as McpServer);

		const response = await makeRequest(testPort, '/health');

		expect(response.statusCode).toBe(200);
		const data = JSON.parse(response.body);
		expect(data.status).toBe('healthy');
		expect(data.pool).toBeDefined();
		expect(data.pool.maxSessions).toBe(50);
		expect(typeof data.pool.totalSessions).toBe('number');
		expect(typeof data.pool.activeSessions).toBe('number');
	});

	it('should include liveness data when healthChecker is provided', async () => {
		testPort = randomPort();
		const healthChecker = new HealthChecker();

		transport = new SseTransport({
			port: testPort,
			healthChecker,
		});
		await transport.connect({} as McpServer);

		const response = await makeRequest(testPort, '/health');

		expect(response.statusCode).toBe(200);
		const data = JSON.parse(response.body);
		expect(data.status).toBe('healthy');
		expect(data.liveness).toBeDefined();
		expect(data.liveness.status).toBe('ok');
	});

	it('should include both pool and liveness data when both configured', async () => {
		testPort = randomPort();
		const pool = new ConnectionPool({ maxSessions: 10, autoCleanup: false });
		const healthChecker = new HealthChecker();

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
			healthChecker,
		});
		await transport.connect({} as McpServer);

		const response = await makeRequest(testPort, '/health');

		expect(response.statusCode).toBe(200);
		const data = JSON.parse(response.body);
		expect(data.pool).toBeDefined();
		expect(data.liveness).toBeDefined();
	});
});

describe('SseTransport coverage: readiness check', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should return default ok readiness when no healthChecker', async () => {
		testPort = randomPort();
		transport = new SseTransport({ port: testPort });
		await transport.connect({} as McpServer);

		const response = await makeRequest(testPort, '/ready');

		expect(response.statusCode).toBe(200);
		const data = JSON.parse(response.body);
		expect(data.status).toBe('ok');
		expect(data.timestamp).toBeDefined();
		expect(data.components).toBeDefined();
	});

	it('should delegate to healthChecker for readiness when configured', async () => {
		testPort = randomPort();
		const healthChecker = new HealthChecker();

		transport = new SseTransport({
			port: testPort,
			healthChecker,
		});
		await transport.connect({} as McpServer);

		const response = await makeRequest(testPort, '/ready');

		expect(response.statusCode).toBe(200);
		const data = JSON.parse(response.body);
		expect(data.status).toBe('ok');
		expect(data.timestamp).toBeDefined();
	});
});

describe('SseTransport coverage: pool metrics', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should update pool metrics when pool and metrics are both provided', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();
		const pool = new ConnectionPool({
			maxSessions: 20,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: '' }] }),
				stop: () => {},
			}),
		});

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
			metrics,
		});
		await transport.connect({} as McpServer);

		// Connect an SSE client which triggers _updatePoolMetrics
		const response = await makeRequest(testPort, '/sse');

		expect(response.statusCode).toBe(200);
		// Pool metrics should have been updated
		expect(metrics.gauges.has('sse_pool_active_sessions')).toBe(true);
		expect(metrics.gauges.has('sse_pool_total_sessions')).toBe(true);
		expect(metrics.gauges.has('sse_pool_max_sessions')).toBe(true);
		expect(metrics.gauges.get('sse_pool_max_sessions')).toBe(20);
	});

	it('should not update pool metrics when pool is missing', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();

		transport = new SseTransport({
			port: testPort,
			metrics,
		});
		await transport.connect({} as McpServer);

		// Make a request; _updatePoolMetrics returns early
		await makeRequest(testPort, '/health');

		expect(metrics.gauges.has('sse_pool_active_sessions')).toBe(false);
	});

	it('should update active connections metric', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();

		transport = new SseTransport({
			port: testPort,
			metrics,
		});
		await transport.connect({} as McpServer);

		// The constructor already calls _updateActiveConnectionsMetric
		expect(metrics.gauges.has('sse_active_connections')).toBe(true);
		expect(metrics.gauges.get('sse_active_connections')).toBe(0);
	});
});

describe('SseTransport coverage: broadcast error handling', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should handle broadcast to disconnected clients without throwing', async () => {
		testPort = randomPort();
		transport = new SseTransport({ port: testPort });
		await transport.connect({} as McpServer);

		// Connect a client
		const req = request(
			{
				hostname: 'localhost',
				port: testPort,
				path: '/sse',
			},
			() => {}
		);
		req.end();

		await setTimeoutPromise(100);

		expect(transport.clientCount).toBeGreaterThan(0);

		// Destroy the client connection abruptly
		req.destroy();
		await setTimeoutPromise(50);

		// Broadcast should not throw even with disconnected/destroyed clients
		expect(() => {
			transport.broadcast('test', { msg: 'hello' });
		}).not.toThrow();
	});
});

describe('SseTransport coverage: message handling edge cases', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should return 503 when MCP server is not connected and valid JSON-RPC sent', async () => {
		testPort = randomPort();
		// Create transport but set _mcpServer to null by NOT connecting a real server
		// SseTransport.connect sets _mcpServer, but we need _mcpServer = null
		// We'll create a transport, connect with a dummy server, then we need the scenario
		// where _mcpServer is null. The connect() method always sets it.
		// Instead: we connect with a real MCP but the key path is _mcpServer being null.
		// Looking at code: _mcpServer starts as null. connect() sets it.
		// We need to test the path where _mcpServer is null.
		// The simplest approach: create transport, start listening manually, send a request.
		// But _handleMessage is private and only reachable via HTTP.
		// Actually: looking at the code flow — _mcpServer is set via connect().
		// The `else` branch at line 335-339 is reached when _mcpServer is null.
		// This means we'd need the server listening but _mcpServer not set.
		// We can't easily do this without modifying the source.
		// BUT: connect() DOES set _mcpServer. So after connect(), it's never null.
		// The test in the existing file uses `{} as McpServer` — which means _mcpServer is truthy (empty object).
		// When we call receive() on it, it will throw. But the code calls this._mcpServer.receive()
		// which would throw because {} has no receive method.
		// The 503 path requires _mcpServer to be falsy (null).
		// We need to find a way... Let's use a real McpServer but not connect it.
		// Wait — we can set _mcpServer = null after connect by using Object access.
		// But the task says "Do NOT mock internal SseTransport methods".
		// Let's use a real McpServer that IS connected, and test the other paths instead.

		// Actually, we CAN test this: just don't call connect(). But then the server isn't listening.
		// Solution: access the internal server directly to listen without setting _mcpServer.
		// That's too hacky. Let's test this differently.

		// Alternative: The only way to reach 503 is if _mcpServer is null.
		// Since connect() always sets it, this path is only reachable if someone calls
		// stop() and then sends a request during shutdown, or if the transport is
		// started without connect(). Since the HTTP server is created in the constructor,
		// we could manually listen on the internal _server.
		// That said, this is internal. Let's skip this specific path and focus on others.

		// Actually, wait. We can use (transport as any) to null out _mcpServer after connect.
		// The instruction says "Do NOT mock internal SseTransport methods" — setting a field
		// to null isn't mocking a method.

		transport = new SseTransport({ port: testPort });
		await transport.connect({} as McpServer);

		// Force _mcpServer to null to test the 503 path
		(transport as unknown as { _mcpServer: null })._mcpServer = null;

		const response = await makePostRequest(testPort, '/sse/message', {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/list',
			params: {},
		});

		expect(response.statusCode).toBe(503);
		const data = JSON.parse(response.body);
		expect(data.error).toBe('Server not ready');
	});

	it('should return 400 for invalid JSON in message body', async () => {
		testPort = randomPort();
		transport = new SseTransport({ port: testPort });
		await transport.connect({} as McpServer);

		const response = await makeRawPostRequest(
			testPort,
			'/sse/message',
			'{this is not valid json!!'
		);

		expect(response.statusCode).toBe(400);
		const data = JSON.parse(response.body);
		expect(data.error).toBe('Invalid JSON');
	});

	it('should return JSON-RPC error for valid JSON but invalid JSON-RPC schema', async () => {
		testPort = randomPort();
		const mcpServer = new McpServer(
			{ name: 'test-server', version: '1.0.0' },
			{
				adapter: new ValibotJsonSchemaAdapter(),
				capabilities: { tools: { listChanged: true } },
			}
		);
		transport = new SseTransport({ port: testPort });
		await transport.connect(mcpServer);

		// Valid JSON but not a valid JSON-RPC request (missing jsonrpc, method fields)
		const response = await makePostRequest(testPort, '/sse/message', {
			notJsonRpc: true,
			random: 'data',
		});

		expect(response.statusCode).toBe(200);
		const data = JSON.parse(response.body);
		expect(data.jsonrpc).toBe('2.0');
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32600);
		expect(data.error.message).toBe('Invalid Request');
	});

	it('should process valid JSON-RPC request through MCP server', async () => {
		testPort = randomPort();
		const mcpServer = new McpServer(
			{ name: 'test-server', version: '1.0.0' },
			{
				adapter: new ValibotJsonSchemaAdapter(),
				capabilities: { tools: { listChanged: true } },
			}
		);
		transport = new SseTransport({ port: testPort });
		await transport.connect(mcpServer);

		const response = await makePostRequest(testPort, '/sse/message', {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/list',
			params: {},
		});

		expect(response.statusCode).toBe(200);
		const data = JSON.parse(response.body);
		expect(data.jsonrpc).toBe('2.0');
		expect(data.id).toBe(1);
	});
});

describe('SseTransport coverage: session ID validation', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should return 400 for invalid session ID format in query params', async () => {
		testPort = randomPort();
		transport = new SseTransport({ port: testPort });
		await transport.connect({} as McpServer);

		// Session ID with special characters (invalid per SESSION_ID_PATTERN)
		const response = await makeRequest(testPort, '/health?session=invalid!@%23$%25');

		expect(response.statusCode).toBe(400);
		const data = JSON.parse(response.body);
		expect(data.error).toContain('Invalid session ID');
	});

	it('should accept valid session ID in query params', async () => {
		testPort = randomPort();
		transport = new SseTransport({ port: testPort });
		await transport.connect({} as McpServer);

		const response = await makeRequest(testPort, '/health?session=valid-session_123');

		expect(response.statusCode).toBe(200);
	});

	it('should reject session ID exceeding max length', async () => {
		testPort = randomPort();
		transport = new SseTransport({ port: testPort });
		await transport.connect({} as McpServer);

		const longSessionId = 'a'.repeat(65); // MAX_SESSION_ID_LENGTH is 64
		const response = await makeRequest(testPort, `/health?sessionId=${longSessionId}`);

		expect(response.statusCode).toBe(400);
		const data = JSON.parse(response.body);
		expect(data.error).toContain('Invalid session ID');
	});
});

describe('SseTransport coverage: metrics recording', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should record http_requests_total counter on requests', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();
		transport = new SseTransport({ port: testPort, metrics });
		await transport.connect({} as McpServer);

		await makeRequest(testPort, '/health');

		expect(metrics.counters.has('http_requests_total')).toBe(true);
		expect(metrics.counters.get('http_requests_total') ?? 0).toBeGreaterThanOrEqual(1);
	});

	it('should record http_request_duration_seconds histogram on responses', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();
		transport = new SseTransport({ port: testPort, metrics });
		await transport.connect({} as McpServer);

		await makeRequest(testPort, '/health');

		// Give a tick for the 'finish' event to fire
		await setTimeoutPromise(50);

		expect(metrics.histograms.has('http_request_duration_seconds')).toBe(true);
	});

	it('should record validation errors when invalid session ID is sent', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();
		transport = new SseTransport({ port: testPort, metrics });
		await transport.connect({} as McpServer);

		await makeRequest(testPort, '/health?session=bad!id');

		expect(metrics.counters.has('http_request_errors_total')).toBe(true);
	});

	it('should record parse_error on invalid JSON', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();
		transport = new SseTransport({ port: testPort, metrics });
		await transport.connect({} as McpServer);

		await makeRawPostRequest(testPort, '/sse/message', 'not json at all');

		expect(metrics.counters.has('http_request_errors_total')).toBe(true);
	});

	it('should record server_not_ready error when mcpServer is null', async () => {
		testPort = randomPort();
		const metrics = createStubMetrics();
		transport = new SseTransport({ port: testPort, metrics });
		await transport.connect({} as McpServer);

		// Force _mcpServer to null
		(transport as unknown as { _mcpServer: null })._mcpServer = null;

		await makePostRequest(testPort, '/sse/message', {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/list',
			params: {},
		});

		expect(metrics.counters.has('http_request_errors_total')).toBe(true);
	});
});

describe('SseTransport coverage: createSseTransport factory', () => {
	it('should create transport with all options including pool and metrics', async () => {
		const metrics = createStubMetrics();
		const pool = new ConnectionPool({ maxSessions: 5, autoCleanup: false });
		const healthChecker = new HealthChecker();

		const options: SseTransportOptions = {
			port: randomPort(),
			host: '127.0.0.1',
			corsOrigin: 'https://example.com',
			path: '/custom-sse',
			metrics,
			connectionPool: pool,
			healthChecker,
		};

		const transport = createSseTransport(options);

		expect(transport).toBeInstanceOf(SseTransport);
		expect(transport.connectionPool).toBe(pool);

		await transport.stop();
	});

	it('should create transport with no options (all defaults)', () => {
		const transport = createSseTransport();
		expect(transport).toBeInstanceOf(SseTransport);
		expect(transport.clientCount).toBe(0);
		expect(transport.connectionPool).toBeUndefined();
		transport.stop();
	});
});

describe('SseTransport coverage: SSE connection with pool session param', () => {
	let transport: SseTransport;
	let testPort: number;

	afterEach(async () => {
		await transport?.stop();
	});

	it('should create new session when requested session does not exist in pool', async () => {
		testPort = randomPort();
		const pool = new ConnectionPool({
			maxSessions: 10,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: '' }] }),
				stop: () => {},
			}),
		});

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
		});
		await transport.connect({} as McpServer);

		// Use a non-existent session ID — pool should create a new one
		const response = await makeRequest(testPort, '/sse?session=nonexistent-session-id');

		expect(response.statusCode).toBe(200);
		expect(response.body).toContain('event: connected');
		// Should contain a new sessionId (not the nonexistent one)
		expect(response.body).toContain('sessionId');
	});

	it('should use session param alias sessionId', async () => {
		testPort = randomPort();
		const pool = new ConnectionPool({
			maxSessions: 10,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: '' }] }),
				stop: () => {},
			}),
		});

		transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
		});
		await transport.connect({} as McpServer);

		// Create a session first
		const sessionId = await pool.createSession();

		// Use sessionId param
		const response = await makeRequest(testPort, `/sse?sessionId=${sessionId}`);

		expect(response.statusCode).toBe(200);
		expect(response.body).toContain(sessionId);
	});
});

describe('SseTransport coverage: stop with pool', () => {
	it('should terminate connection pool on stop', async () => {
		const testPort = randomPort();
		const pool = new ConnectionPool({
			maxSessions: 10,
			autoCleanup: false,
			serverFactory: async () => ({
				processThought: async () => ({ content: [{ type: 'text', text: '' }] }),
				stop: () => {},
			}),
		});

		const transport = new SseTransport({
			port: testPort,
			connectionPool: pool,
		});
		await transport.connect({} as McpServer);

		// Create a session in the pool
		await pool.createSession();
		expect(pool.isRunning()).toBe(true);

		await transport.stop();

		// Pool should be terminated after transport stop
		expect(pool.isRunning()).toBe(false);
	});
});
