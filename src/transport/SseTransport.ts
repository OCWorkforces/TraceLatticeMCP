/**
 * SSE (Server-Sent Events) Transport implementation.
 *
 * This transport allows multiple concurrent connections over HTTP using Server-Sent Events,
 * enabling multi-user scenarios and horizontal scaling.
 *
 * When a ConnectionPool is provided, each SSE client gets an isolated session with its own
 * thought history. Without a pool, all clients share a single server instance (backward compatible).
 *
 * @example
 * ```typescript
 * const transport = new SseTransport({
 *   port: 3000,
 *   host: 'localhost'
 * });
 * await transport.connect(server);
 * ```
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { McpServer } from 'tmcp';
import { safeParse } from 'valibot';
import type { IMetrics } from '../contracts/index.js';
import type { ConnectionPool } from '../pool/ConnectionPool.js';
import { JsonRpcRequestSchema } from '../schema.js';
import { BaseTransport, type TransportOptions } from './BaseTransport.js';
import type { ITransport, TransportKind } from '../contracts/transport.js';
/**
 * SSE-specific transport options extending base TransportOptions.
 */
export interface SseTransportOptions extends TransportOptions {
	path?: string;
	metrics?: IMetrics;
	/**
	 * Optional connection pool for per-session state isolation.
	 * When provided, each SSE client gets an isolated thought history.
	 * When omitted, all clients share a single server instance (backward compatible).
	 */
	connectionPool?: ConnectionPool;
}

/**
 * SSE Transport for MCP server over HTTP.
 *
 * This transport uses Server-Sent Events (SSE) to communicate with clients,
 * allowing multiple concurrent connections and web-based clients.
 *
 * @remarks
 * **Security Features:**
 * - Session ID validation (alphanumeric, max 64 chars)
 * - Query parameter sanitization (whitelist allowed keys)
 * - Rate limiting per IP (configurable, default 100 req/min)
 * - CORS origin validation
 *
 * **Rate Limiting:**
 * - Tracks requests per IP address within a time window
 * - Returns 429 Too Many Requests when limit exceeded
 * - Can be disabled via `enableRateLimit: false`
 */
export class SseTransport extends BaseTransport implements ITransport {
	get kind(): TransportKind { return 'sse'; }
	private _server: ReturnType<typeof createServer>;
	private _path: string;
	private _clients: Set<ServerResponse> = new Set();
	private _clientSessionMap: Map<ServerResponse, string> = new Map();
	private _messageQueue: Map<string, unknown[]> = new Map();
	private _metrics?: IMetrics;
	private _connectionPool?: ConnectionPool;

	constructor(options: SseTransportOptions = {}) {
		super(options);
		this._path = options.path ?? '/sse';
		this._metrics = options.metrics;
		this._connectionPool = options.connectionPool;
		this._updateActiveConnectionsMetric();

		this._server = createServer((req, res) => this._handleRequest(req, res));
	}

	/**
	 * Connect MCP server to this transport.
	 *
	 * @param mcpServer - The MCP server instance
	 */
	async connect(mcpServer: McpServer): Promise<void> {
		this._mcpServer = mcpServer;

		return new Promise((resolve) => {
			this._server.listen(this._port, this._host, () => {
				this.log('info', `SSE transport listening on http://${this._host}:${this._port}`);
				resolve();
			});
		});
	}

	private _mcpServer: McpServer | null = null;

	/**
	 * Handle incoming HTTP requests
	 */
	private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const startTime = Date.now();
		const requestPath = req.url || '/';
		const requestMethod = req.method || 'GET';
		this._metrics?.counter('http_requests_total', 1, { transport: 'sse', method: requestMethod, path: requestPath }, 'Total HTTP requests');
		res.once('finish', () => {
			const durationSeconds = (Date.now() - startTime) / 1000;
			this._metrics?.histogram('http_request_duration_seconds', durationSeconds, { transport: 'sse', path: requestPath });
		});
		if (!this.validateHostHeader(req)) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'sse', error_type: 'forbidden' }, 'Total HTTP request errors');
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Forbidden - invalid host header' }));
			return;
		}

		const url = new URL(req.url || '', `http://${req.headers.host}`);

		// Check rate limit first
		const clientIp = this.getClientIp(req);
		if (this.checkRateLimit(clientIp)) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'sse', error_type: 'rate_limit' }, 'Total HTTP request errors');
			res.writeHead(429, {
				'Content-Type': 'application/json',
				'Retry-After': '60',
			});
			res.end(JSON.stringify({ error: 'Too many requests' }));
			return;
		}

		// Validate CORS origin
		if (!this.validateCorsOrigin(req)) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'sse', error_type: 'forbidden' }, 'Total HTTP request errors');
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Forbidden - invalid origin' }));
			return;
		}

		// Set CORS headers
		this.setCorsHeaders(res);

		// Sanitize query parameters
		const sanitizedParams = this.sanitizeQueryParams(url);

		// Validate session ID if present
		if (sanitizedParams.session || sanitizedParams.sessionId) {
			const sessionId = (sanitizedParams.session ?? sanitizedParams.sessionId)!;
			if (!this.validateSessionId(sessionId)) {
				this._metrics?.counter('http_request_errors_total', 1, { transport: 'sse', error_type: 'validation' }, 'Total HTTP request errors');
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid session ID format' }));
				return;
			}
		}
		// Handle CORS preflight
		if (this._enableCors && req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		// Handle SSE endpoint
		if (url.pathname === this._path && req.method === 'GET') {
			await this._handleSseConnection(req, res, sanitizedParams);
			return;
		}

		// Handle message endpoint (for receiving messages from clients)
		if (url.pathname === `${this._path}/message` && req.method === 'POST') {
			await this._handleMessage(req, res, sanitizedParams);
			return;
		}

		// Handle health check (liveness)
		if (url.pathname === '/health') {
			this._handleHealthCheck(res);
			return;
		}

		// Handle readiness check
		if (url.pathname === '/ready') {
			await this._handleReadinessCheck(res);
			return;
		}


		// 404 for unknown paths
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not Found');
	}

	/**
	 * Handle health check (liveness) endpoint
	 */
	private _handleHealthCheck(res: ServerResponse): void {
		const healthData: Record<string, unknown> = { status: 'healthy', clients: this._clients.size };
		if (this._connectionPool) {
			const poolStats = this._connectionPool.getStats();
			healthData.pool = poolStats;
		}
		if (this._healthChecker) {
			const liveness = this._healthChecker.checkLiveness();
			healthData.liveness = liveness;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(healthData));
	}

	/**
	 * Handle readiness check endpoint
	 */
	private async _handleReadinessCheck(res: ServerResponse): Promise<void> {
		if (this._healthChecker) {
			const readiness = await this._healthChecker.checkReadiness();
			const statusCode = readiness.status === 'ok' ? 200 : 503;
			res.writeHead(statusCode, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(readiness));
		} else {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), components: {} }));
		}
	}

	/**
	 * Handle new SSE connection
	 */
	private async _handleSseConnection(
		req: IncomingMessage,
		res: ServerResponse,
		params: Record<string, string>
	): Promise<void> {
		// Set SSE headers
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});

		// Resolve session ID when pool is active
		let sessionId: string | undefined;
		if (this._connectionPool) {
			const requestedSession = params.session ?? params.sessionId;
			if (requestedSession && this._connectionPool.getSessionInfo(requestedSession)) {
				sessionId = requestedSession;
			} else {
				try {
					sessionId = await this._connectionPool.createSession();
				} catch (error) {
					res.write(`event: error\n`);
					res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to create session' })}\n\n`);
					res.end();
					return;
				}
			}
			this._clientSessionMap.set(res, sessionId);
			this._updatePoolMetrics();
		}

		// Send initial connection event
		const connectedPayload: Record<string, unknown> = { timestamp: Date.now() };
		if (sessionId) {
			connectedPayload.sessionId = sessionId;
		}
		this._sendSseEvent(res, 'connected', connectedPayload);

		// Add to clients
		this._clients.add(res);
		this._updateActiveConnectionsMetric();

		// Handle client disconnect
		req.on('close', () => {
			this._clients.delete(res);
			this._clientSessionMap.delete(res);
			this._updateActiveConnectionsMetric();
		});

		// Send any queued messages
		const clientId = this._generateClientId();
		const queued = this._messageQueue.get(clientId);
		if (queued) {
			for (const message of queued) {
				this._sendSseEvent(res, 'message', message);
			}
			this._messageQueue.delete(clientId);
		}
	}

	/**
	 * Handle incoming message from client
	 */
	private async _handleMessage(
		req: IncomingMessage,
		res: ServerResponse,
		_params: Record<string, string>
	): Promise<void> {
		let body = '';

		for await (const chunk of req) {
			body += chunk.toString();
		}

		try {
			const jsonRpcRequest = JSON.parse(body);
			const parseResult = safeParse(JsonRpcRequestSchema, jsonRpcRequest);
			if (!parseResult.success) {
				this._metrics?.counter('http_request_errors_total', 1, { transport: 'sse', error_type: 'validation' }, 'Total HTTP request errors');
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						jsonrpc: '2.0',
						id: jsonRpcRequest?.id ?? null,
						error: {
							code: -32600,
							message: 'Invalid Request',
							data: parseResult.issues,
						},
					})
				);
				return;
			}

			// Process message through MCP server
			if (this._mcpServer) {
				const response = await this._mcpServer.receive(jsonRpcRequest, {
					sessionInfo: {},
				});
				res.writeHead(200, {
					'Content-Type': 'application/json',
				});

				if (response) {
					res.end(JSON.stringify(response));
				} else {
					res.end(JSON.stringify({ jsonrpc: '2.0', id: jsonRpcRequest?.id ?? null, result: null }));
				}
			} else {
				this._metrics?.counter('http_request_errors_total', 1, { transport: 'sse', error_type: 'server_not_ready' }, 'Total HTTP request errors');
				res.writeHead(503, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Server not ready' }));
			}
		} catch {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'sse', error_type: 'parse_error' }, 'Total HTTP request errors');
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Invalid JSON' }));
		}
	}

	/**
	 * Send an SSE event to a specific client
	 */
	private _sendSseEvent(res: ServerResponse, event: string, data: unknown): void {
		try {
			res.write(`event: ${event}\n`);
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		} catch {
			// Client disconnected
			this._clients.delete(res);
			this._updateActiveConnectionsMetric();
		}
	}

	private _updateActiveConnectionsMetric(): void {
		this._metrics?.gauge(
			'sse_active_connections',
			this._clients.size,
			{},
			'Current active SSE connections'
		);
	}

	private _updatePoolMetrics(): void {
		if (!this._connectionPool || !this._metrics) {
			return;
		}
		const stats = this._connectionPool.getStats();
		this._metrics.gauge(
			'sse_pool_active_sessions',
			stats.activeSessions,
			{},
			'Active sessions in connection pool'
		);
		this._metrics.gauge(
			'sse_pool_total_sessions',
			stats.totalSessions,
			{},
			'Total sessions in connection pool'
		);
		this._metrics.gauge(
			'sse_pool_max_sessions',
			stats.maxSessions,
			{},
			'Maximum sessions in connection pool'
		);
	}

	/**
	 * Broadcast a message to all connected clients
	 */
	broadcast(event: string, data: unknown): void {
		for (const client of this._clients) {
			this._sendSseEvent(client, event, data);
		}
	}

	/**
	 * Generate a unique client ID
	 */
	private _generateClientId(): string {
		return `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Get number of connected clients
	 */
	get clientCount(): number {
		return this._clients.size;
	}

	/**
	 * Get the connection pool, if one was configured.
	 */
	get connectionPool(): ConnectionPool | undefined {
		return this._connectionPool;
	}

	/**
	 * Stop the transport server with graceful shutdown.
	 *
	 * @param timeout - Maximum time to wait for requests to drain (not used for SSE)
	 * @returns Promise that resolves when shutdown is complete
	 */
	async stop(_timeout?: number): Promise<void> {
		this._isShuttingDown = true;
		this._stopRateLimitCleanup();

		// Terminate connection pool if present
		if (this._connectionPool) {
			await this._connectionPool.terminate();
		}

		return new Promise((resolve) => {
			// Close all client connections
			for (const client of this._clients) {
				try {
					client.end();
				} catch {
					// Ignore errors
				}
			}
			this._clients.clear();
			this._clientSessionMap.clear();
			this._updateActiveConnectionsMetric();

			// Close server
			this._server.close(() => {
				this.log('info', 'SSE transport stopped');
				resolve();
			});
		});
	}
}

/**
 * Create an SSE transport with given options.
 *
 * @param options - Transport configuration
 * @returns A configured SSE transport
 *
 * @example
 * ```typescript
 * const transport = createSseTransport({ port: 3000 });
 * await transport.connect(mcpServer);
 * ```
 */
export function createSseTransport(options: SseTransportOptions = {}): SseTransport {
	return new SseTransport(options);
}
