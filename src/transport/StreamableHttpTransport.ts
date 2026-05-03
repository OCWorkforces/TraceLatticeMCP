/**
 * Streamable HTTP Transport implementation (MCP spec recommended transport).
 *
 * This transport implements the MCP Streamable HTTP specification, which replaces
 * the deprecated SSE transport as the recommended HTTP-based transport since March 2025.
 *
 * Key features:
 * - POST /mcp for JSON-RPC requests (main MCP endpoint)
 * - GET /mcp for optional SSE server-to-client notifications
 * - Session management via Mcp-Session-Id header
 * - Supports both stateful (session-based) and stateless (per-request) modes
 * - Health endpoints (/health, /ready)
 *
 * @example
 * ```typescript
 * const transport = new StreamableHttpTransport({
 *   port: 3000,
 *   host: 'localhost',
 *   stateful: true,
 * });
 * await transport.connect(server);
 * ```
 */

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { McpServer } from 'tmcp';
import { safeParse } from 'valibot';
import type { IMetrics } from '../contracts/interfaces.js';
import { getErrorMessage } from '../errors.js';
import { JsonRpcRequestSchema } from '../schema.js';
import { BaseTransport, type TransportOptions } from './BaseTransport.js';
import type { ITransport, TransportKind } from '../contracts/transport.js';
import { asSessionId, type SessionId } from '../contracts/ids.js';
import { readRequestBody } from './HttpHelpers.js';
import { runWithContext } from '../context/RequestContext.js';

/**
 * MCP Streamable HTTP transport options extending base TransportOptions.
 */
export interface StreamableHttpTransportOptions extends TransportOptions {
	/**
	 * Path for the MCP endpoint
	 * @default '/mcp'
	 */
	path?: string;

	/**
	 * Metrics collector for transport telemetry
	 */
	metrics?: IMetrics;

	/**
	 * Prometheus metrics provider function
	 */
	metricsProvider?: () => string;

	/**
	 * Enable stateful session-based mode.
	 * When true, sessions are tracked via Mcp-Session-Id header.
	 * When false, each request is processed independently (stateless).
	 * @default true
	 */
	stateful?: boolean;

	/**
	 * Custom session ID generator function.
	 * @default () => randomUUID()
	 */
	sessionIdGenerator?: () => string;

	/**
	 * Enable request body size limit
	 * @default true
	 */
	enableBodySizeLimit?: boolean;

	/**
	 * Maximum request body size in bytes
	 * @default 10485760 (10MB)
	 */
	maxBodySize?: number;

	/**
	 * Request timeout in milliseconds
	 * @default 30000 (30 seconds)
	 */
	requestTimeout?: number;
}

/**
 * Internal session state for stateful mode.
 */
interface SessionState {
	/** Unique session identifier */
	id: string;
	/** Timestamp when the session was created */
	createdAt: number;
	/** Timestamp of the last activity */
	lastActivityAt: number;
	/** Active SSE notification streams for this session */
	notificationStreams: Set<ServerResponse>;
}

/**
 * Streamable HTTP Transport for MCP server.
 *
 * This transport implements the MCP Streamable HTTP specification,
 * providing JSON-RPC over HTTP with optional session management
 * and server-to-client SSE notification streams.
 *
 * @remarks
 * **Security Features (inherited from BaseTransport):**
 * - Session ID validation (alphanumeric, max 64 chars)
 * - Query parameter sanitization (whitelist allowed keys)
 * - Rate limiting per IP (configurable, default 100 req/min)
 * - CORS origin validation
 * - Host header validation
 *
 * **MCP Streamable HTTP Spec Compliance:**
 * - POST /mcp — JSON-RPC method calls
 * - GET /mcp — SSE notification stream (server-to-client)
 * - Mcp-Session-Id header for session management
 * - Content-Type: application/json for JSON-RPC responses
 * - Content-Type: text/event-stream for SSE notification streams
 *
 * **HTTP Status Code Mapping:**
 * - 200: Success (JSON-RPC response or SSE stream)
 * - 202: Accepted (JSON-RPC notification, no response body)
 * - 204: CORS Preflight (empty body)
 * - 400: Bad Request (invalid JSON, invalid session ID)
 * - 403: Forbidden (invalid CORS, invalid host)
 * - 404: Not Found
 * - 405: Method Not Allowed
 * - 413: Payload Too Large
 * - 429: Too Many Requests
 * - 500: Internal Server Error
 * - 503: Server Not Ready / Shutting Down
 */
export class StreamableHttpTransport extends BaseTransport implements ITransport {
	get kind(): TransportKind { return 'streamable-http'; }
	private _server: Server | null = null;
	private _mcpServer: McpServer | null = null;
	private _path: string;
	private _stateful: boolean;
	private _sessionIdGenerator: () => string;
	private _sessions: Map<SessionId, SessionState> = new Map();
	private _requestCount: number = 0;
	private _activeRequests: number = 0;
	private _bodySizeLimitEnabled: boolean;
	private _maxBodySize: number;
	private _requestTimeout: number;
	private _metrics?: IMetrics;
	private _metricsProvider: (() => string) | null;

	constructor(options: StreamableHttpTransportOptions = {}) {
		super(options);

		this._path = options.path ?? '/mcp';
		this._stateful = options.stateful ?? true;
		this._sessionIdGenerator = options.sessionIdGenerator ?? (() => randomUUID());
		this._bodySizeLimitEnabled = options.enableBodySizeLimit ?? true;
		this._maxBodySize = options.maxBodySize ?? 10 * 1024 * 1024;
		this._requestTimeout = options.requestTimeout ?? 30000;
		this._metrics = options.metrics;
		this._metricsProvider = options.metricsProvider ?? null;
	}

	private _requireServer(): Server {
		if (!this._server) {
			throw new Error('HTTP server not initialized. Did you call connect()?');
		}
		return this._server;
	}

	private _requireMcpServer(): McpServer {
		if (!this._mcpServer) {
			throw new Error('MCP server not initialized. Did you call connect()?');
		}
		return this._mcpServer;
	}

	/**
	 * Get number of active sessions (stateful) or active requests (stateless).
	 */
	get clientCount(): number {
		return this._stateful ? this._sessions.size : this._activeRequests;
	}

	/**
	 * Get the total number of requests handled.
	 */
	get requestCount(): number {
		return this._requestCount;
	}

	/**
	 * Connects MCP server to this transport and starts listening.
	 */
	async connect(mcpServer: McpServer): Promise<void> {
		this._mcpServer = mcpServer;
		this._server = createServer((req, res) => this._handleRequest(req, res));

		return new Promise((resolve) => {
			this._requireServer().listen(this._port, this._host, () => {
				this.log(
					'info',
					`Streamable HTTP transport listening on http://${this._host}:${this._port}`
				);
				resolve();
			});
		});
	}

	/**
	 * Route and handle incoming HTTP requests.
	 */
	private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const startTime = Date.now();
		this._metrics?.counter('streamable_http_requests_total', 1, {}, 'Total Streamable HTTP transport requests');
		res.once('finish', () => {
			const durationSeconds = (Date.now() - startTime) / 1000;
			this._metrics?.histogram('streamable_http_request_duration_seconds', durationSeconds, {});
		});

		// Host validation
		if (!this.validateHostHeader(req)) {
			this._sendJsonRpcError(res, 403, -32000, 'Forbidden - invalid host header');
			return;
		}

		// Shutdown check
		if (this.isShuttingDown) {
			this._sendJsonRpcError(res, 503, -32603, 'Server is shutting down');
			return;
		}

		// Rate limiting
		const clientIp = this.getClientIp(req);
		if (this.checkRateLimit(clientIp)) {
			res.setHeader('Retry-After', '60');
			this._sendJsonRpcError(res, 429, -32000, 'Too many requests');
			return;
		}

		// CORS validation
		if (!this.validateCorsOrigin(req)) {
			this._sendJsonRpcError(res, 403, -32000, 'Forbidden - invalid origin');
			return;
		}

		this.setCorsHeaders(res);

		// CORS preflight
		if (req.method === 'OPTIONS') {
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
			res.writeHead(204);
			res.end();
			return;
		}

		// Parse URL path
		const urlPath = req.url?.split('?')[0] ?? '/';

		// Metrics endpoint
		if (req.method === 'GET' && urlPath === '/metrics') {
			this._handleMetrics(res);
			return;
		}

		// Health check (liveness)
		if (req.method === 'GET' && urlPath === '/health') {
			this._handleHealthCheck(res);
			return;
		}

		// Readiness check
		if (req.method === 'GET' && urlPath === '/ready') {
			await this._handleReadinessCheck(res);
			return;
		}

		// MCP endpoint routing
		if (urlPath === this._path) {
			if (req.method === 'POST') {
				await this._handleMcpPost(req, res);
				return;
			}
			if (req.method === 'GET') {
				this._handleMcpGet(req, res);
				return;
			}
			res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET, POST' });
			res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Method not allowed' } }));
			return;
		}

		// 404 for unknown paths
		this._sendJsonRpcError(res, 404, -32601, 'Not Found');
	}

	/**
	 * Send a JSON-RPC error response.
	 */
	private _sendJsonRpcError(res: ServerResponse, statusCode: number, code: number, message: string, id: unknown = null, extra?: Record<string, unknown>): void {
		const error: Record<string, unknown> = { code, message };
		if (extra) {
			Object.assign(error, extra);
		}
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ jsonrpc: '2.0', id, error }));
	}

	/**
	 * Handle POST /mcp — JSON-RPC method calls.
	 *
	 * Per the MCP Streamable HTTP spec:
	 * - Accepts JSON-RPC request bodies
	 * - Returns Mcp-Session-Id header for new sessions (stateful mode)
	 * - Validates Mcp-Session-Id for existing sessions (stateful mode)
	 * - Content-Type: application/json for responses
	 */
	private async _handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
		this._requestCount++;
		this._activeRequests++;

		const timeout = setTimeout(() => {
			this._activeRequests--;
			this._sendJsonRpcError(res, 500, -32603, 'Request timeout');
		}, this._requestTimeout);

		try {
			// Read request body with size limit
			const body = await readRequestBody(req, this._bodySizeLimitEnabled ? this._maxBodySize : 0);
			if (body === null) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._sendJsonRpcError(res, 413, -32000, 'Request body too large');
				return;
			}

			// Parse JSON
			let rawBody: unknown;
			try {
				rawBody = JSON.parse(body) as unknown;
			} catch {
				clearTimeout(timeout);
				this._activeRequests--;
				this._sendJsonRpcError(res, 200, -32700, 'Parse error');
				return;
			}

			// Validate JSON-RPC schema
			const parseResult = safeParse(JsonRpcRequestSchema, rawBody);
			const rawId = (rawBody && typeof rawBody === 'object' && 'id' in rawBody) ? (rawBody as { id?: unknown }).id ?? null : null;
			if (!parseResult.success) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._sendJsonRpcError(res, 200, -32600, 'Invalid Request', rawId as string | number | null, { data: parseResult.issues });
				return;
			}
			const jsonRpcRequest = parseResult.output;

			// Session management (stateful mode)
			let sessionId: string | undefined;
			if (this._stateful) {
				const sessionResult = this._resolveSession(req, res);
				if (sessionResult === false) {
					clearTimeout(timeout);
					this._activeRequests--;
					return;
				}
				sessionId = sessionResult;
			}

			// Check if MCP server is ready
			if (!this._mcpServer) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._sendJsonRpcError(res, 503, -32603, 'Server not ready', jsonRpcRequest?.id ?? null);
				return;
			}

			// Process JSON-RPC request through MCP server
			// Process JSON-RPC request through MCP server with owner context
			const owner = this._stateful ? (sessionId ?? randomUUID()) : randomUUID();
			const response = await runWithContext(
				{ requestId: randomUUID(), owner },
				() => this._requireMcpServer().receive(jsonRpcRequest as Parameters<McpServer['receive']>[0], { sessionInfo: {} })
			);
			clearTimeout(timeout);
			this._activeRequests--;

			// Send response with session header if applicable
			const responseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
			if (sessionId) responseHeaders['Mcp-Session-Id'] = sessionId;

			if (response) {
				res.writeHead(200, responseHeaders);
				res.end(JSON.stringify(response));
			} else {
				if (sessionId) res.setHeader('Mcp-Session-Id', sessionId);
				res.writeHead(202);
				res.end();
			}
		} catch (error) {
			clearTimeout(timeout);
			this._activeRequests--;
			this._sendJsonRpcError(res, 200, -32603, 'Internal error', null, {
				data: getErrorMessage(error),
			});
		}
	}


	/**
	 * Handle GET /mcp — Optional SSE notification stream.
	 *
	 * Per the MCP Streamable HTTP spec, clients may open a GET request
	 * to receive server-initiated notifications as SSE events.
	 * Requires a valid Mcp-Session-Id in stateful mode.
	 */
	private _handleMcpGet(req: IncomingMessage, res: ServerResponse): void {
		if (!this._stateful) {
			// SSE notification streams require stateful mode
			res.writeHead(405, {
				'Content-Type': 'application/json',
				Allow: 'POST',
			});
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32601, message: 'GET not supported in stateless mode' },
				})
			);
			return;
		}

		// Require Mcp-Session-Id for GET requests
		const sessionId = this._getSessionIdFromHeader(req);
		if (!sessionId) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32600, message: 'Missing Mcp-Session-Id header' },
				})
			);
			return;
		}

		const session = this._sessions.get(asSessionId(sessionId));
		if (!session) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32001, message: 'Session not found' },
				})
			);
			return;
		}

		// Set SSE headers
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'Mcp-Session-Id': sessionId,
		});

		// Send initial connected event
		this._sendSseEvent(res, 'connected', {
			sessionId,
			timestamp: Date.now(),
		});

		// Track this notification stream
		session.notificationStreams.add(res);
		session.lastActivityAt = Date.now();
		this._updateSessionMetrics();

		// Handle client disconnect
		req.on('close', () => {
			session.notificationStreams.delete(res);
			this._updateSessionMetrics();
		});
	}

	/**
	 * Resolve or create a session for a stateful request.
	 *
	 * @returns Session ID string on success, or `false` if the response was already sent (error).
	 */
	private _resolveSession(req: IncomingMessage, res: ServerResponse): string | false {
		const headerSessionId = this._getSessionIdFromHeader(req);

		if (headerSessionId) {
			// Validate format
			if (!this.validateSessionId(headerSessionId)) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						jsonrpc: '2.0',
						id: null,
						error: { code: -32600, message: 'Invalid Mcp-Session-Id format' },
					})
				);
				return false;
			}

			// Check if session exists
			const session = this._sessions.get(asSessionId(headerSessionId));
			if (session) {
				session.lastActivityAt = Date.now();
				return headerSessionId;
			}

			// Unknown session ID — per spec, return 404
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32001, message: 'Session not found' },
				})
			);
			return false;
		}

		// No session header — create new session
		const newSessionId = this._sessionIdGenerator();
		const sessionState: SessionState = {
			id: newSessionId,
			createdAt: Date.now(),
			lastActivityAt: Date.now(),
			notificationStreams: new Set(),
		};
		this._sessions.set(asSessionId(newSessionId), sessionState);
		this.log('info', `New session created: ${newSessionId}`);
		this._updateSessionMetrics();

		return newSessionId;
	}

	/**
	 * Extract Mcp-Session-Id from request headers.
	 */
	private _getSessionIdFromHeader(req: IncomingMessage): string | undefined {
		const value = req.headers['mcp-session-id'];
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
		return undefined;
	}


	/**
	 * Send an SSE event to a specific client response stream.
	 */
	private _sendSseEvent(res: ServerResponse, event: string, data: unknown): void {
		try {
			res.write(`event: ${event}\n`);
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		} catch {
			// Client disconnected — ignore
		}
	}

	/**
	 * Broadcast a notification to all SSE streams in a given session.
	 *
	 * @param sessionId - Target session ID
	 * @param event - SSE event name
	 * @param data - Event payload
	 */
	broadcastToSession(sessionId: string, event: string, data: unknown): void {
		const session = this._sessions.get(asSessionId(sessionId));
		if (!session) {
			return;
		}

		for (const stream of session.notificationStreams) {
			this._sendSseEvent(stream, event, data);
		}
	}

	/**
	 * Handle GET /metrics endpoint.
	 */
	private _handleMetrics(res: ServerResponse): void {
		if (!this._metricsProvider) {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not Found');
			return;
		}

		res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
		res.end(this._metricsProvider());
	}

	/**
	 * Handle GET /health — Liveness check.
	 */
	private _handleHealthCheck(res: ServerResponse): void {
		const healthData: Record<string, unknown> = {
			status: 'healthy',
			requests: this._requestCount,
			sessions: this._sessions.size,
			transport: 'streamable-http',
		};
		if (this._healthChecker) {
			const liveness = this._healthChecker.checkLiveness();
			healthData.liveness = liveness;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(healthData));
	}

	/**
	 * Handle GET /ready — Readiness check.
	 */
	private async _handleReadinessCheck(res: ServerResponse): Promise<void> {
		if (this._healthChecker) {
			const readiness = await this._healthChecker.checkReadiness();
			const statusCode = readiness.status === 'ok' ? 200 : 503;
			res.writeHead(statusCode, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(readiness));
		} else {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					status: 'ok',
					timestamp: new Date().toISOString(),
					components: {},
				})
			);
		}
	}

	/**
	 * Update session-related metrics.
	 */
	private _updateSessionMetrics(): void {
		this._metrics?.gauge(
			'streamable_http_active_sessions',
			this._sessions.size,
			{},
			'Active Streamable HTTP sessions'
		);

		let totalStreams = 0;
		for (const session of this._sessions.values()) {
			totalStreams += session.notificationStreams.size;
		}
		this._metrics?.gauge(
			'streamable_http_notification_streams',
			totalStreams,
			{},
			'Active SSE notification streams'
		);
	}

	/**
	 * Stop transport server with graceful shutdown.
	 *
	 * @param timeout - Maximum time to wait for in-flight requests (default: 30s)
	 */
	async stop(timeout?: number): Promise<void> {
		this._isShuttingDown = true;
		this._stopRateLimitCleanup();

		const shutdownTimeout = timeout ?? 30000;

		// Close all SSE notification streams
		for (const session of this._sessions.values()) {
			for (const stream of session.notificationStreams) {
				try {
					stream.end();
				} catch {
					// Ignore errors
				}
			}
			session.notificationStreams.clear();
		}
		this._sessions.clear();

		return new Promise((resolve) => {
			if (!this._server) {
				this.log('info', 'Streamable HTTP transport stopped (no server)');
				resolve();
				return;
			}

			// Force close after timeout
			const forceClose = setTimeout(() => {
				this.log('warn', 'Streamable HTTP transport force-closing after timeout');
				resolve();
			}, shutdownTimeout);

			this._server.close(() => {
				clearTimeout(forceClose);
				this.log('info', 'Streamable HTTP transport stopped');
				resolve();
			});
		});
	}
}

/**
 * Create a Streamable HTTP transport with given options.
 *
 * @param options - Transport configuration
 * @returns A configured Streamable HTTP transport
 *
 * @example
 * ```typescript
 * const transport = createStreamableHttpTransport({ port: 3000, stateful: true });
 * await transport.connect(server);
 * ```
 */
export function createStreamableHttpTransport(
	options: StreamableHttpTransportOptions = {}
): StreamableHttpTransport {
	return new StreamableHttpTransport(options);
}
