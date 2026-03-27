/**
 * HTTP Transport implementation.
 *
 * This transport provides a stateless, REST-like API interface for MCP tool invocations
 * using standard HTTP request-response patterns.
 *
 * @example
 * ```typescript
 * const transport = new HttpTransport({
 *   port: 3000,
 *   host: 'localhost'
 * });
 * await transport.connect(server);
 * ```
 */

import type { McpServer } from 'tmcp';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { safeParse } from 'valibot';
import { JsonRpcRequestSchema } from '../schema.js';
import type { IMetrics } from '../contracts/index.js';
import { BaseTransport, type TransportOptions } from './BaseTransport.js';

export interface HttpTransportOptions extends TransportOptions {
	/**
	 * Path for messages endpoint
	 * @default '/messages'
	 */
	path?: string;
	metrics?: IMetrics;
	metricsProvider?: () => string;

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
 * HTTP Transport for MCP server.
 *
 * This transport provides a stateless, REST-like API interface for MCP tool invocations
 * using standard HTTP request-response patterns.
 *
 * @remarks
 * **Security Features:**
 * - Session ID validation (alphanumeric, max 64 chars)
 * - Query parameter sanitization (whitelist allowed keys)
 * - Rate limiting per IP (configurable, default 100 req/min)
 * - CORS origin validation
 * - Request body size limits (configurable, default 10MB)
 * - Request timeout (configurable, default 30s)
 *
 * **Rate Limiting:**
 * - Tracks requests per IP address within a time window
 * - Returns 429 Too Many Requests when limit exceeded
 * - Can be disabled via `enableRateLimit: false`
 *
 * **HTTP Status Code Mapping:**
 * - 200: Success (JSON-RPC response)
 * - 204: CORS Preflight (empty body)
 * - 400: Bad Request
 * - 403: Forbidden (invalid CORS)
 * - 404: Not Found
 * - 413: Payload Too Large
 * - 429: Too Many Requests
 * - 500: Internal Server Error
 * - 503: Server Not Ready
 */
export class HttpTransport extends BaseTransport {
	private _server: ReturnType<typeof createServer>;
	private _mcpServer: McpServer | null = null;
	private _requestTimeout: number;
	private _bodySizeLimitEnabled: boolean;
	private _maxBodySize: number;
	private _requestCount: number = 0;
	private _activeRequests: number = 0;
	private _path: string;
	private _metrics?: IMetrics;
	private _metricsProvider: (() => string) | null;

	constructor(options: HttpTransportOptions = {}) {
		super(options);

		this._requestTimeout = options.requestTimeout ?? 30000;
		this._bodySizeLimitEnabled = options.enableBodySizeLimit ?? true;
		this._maxBodySize = options.maxBodySize ?? 10 * 1024 * 1024;
		this._path = options.path ?? '/messages';
		this._metrics = options.metrics;
		this._metricsProvider = options.metricsProvider ?? null;
		this._server = createServer((req, res) => this._handleRequest(req, res));
	}

	/**
	 * Get number of active HTTP connections.
	 */
	get clientCount(): number {
		return this._activeRequests;
	}

	/**
	 * Connects MCP server to this transport.
	 */
	async connect(mcpServer: McpServer): Promise<void> {
		this._mcpServer = mcpServer;
		return new Promise((resolve) => {
			this._server.listen(this._port, this._host, () => {
				this.log('info', `HTTP transport listening on http://${this._host}:${this._port}`);
				resolve();
			});
		});
	}

	/**
	 * Handles incoming HTTP requests.
	 */
	private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const startTime = Date.now();
		const requestPath = req.url || '/';
		const requestMethod = req.method || 'GET';
		this._metrics?.counter('http_requests_total', 1, {}, 'Total HTTP transport requests');
		this._metrics?.counter('http_transport_requests_total', 1, { transport: 'http', method: requestMethod, path: requestPath }, 'Total HTTP requests by transport');
		res.once('finish', () => {
			const durationSeconds = (Date.now() - startTime) / 1000;
			this._metrics?.histogram('http_request_duration_seconds', durationSeconds, {});
			this._metrics?.histogram('http_transport_request_duration_seconds', durationSeconds, { transport: 'http', path: requestPath });
		});

		if (!this.validateHostHeader(req)) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'forbidden' }, 'Total HTTP request errors');
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32000, message: 'Forbidden - invalid host header' },
				})
			);
			return;
		}

		if (this.isShuttingDown()) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'shutting_down' }, 'Total HTTP request errors');
			res.writeHead(503, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32603, message: 'Server is shutting down' },
				})
			);
			return;
		}

		const clientIp = this.getClientIp(req);
		if (this.checkRateLimit(clientIp)) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'rate_limit' }, 'Total HTTP request errors');
			res.writeHead(429, {
				'Content-Type': 'application/json',
				'Retry-After': '60',
			});
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32000, message: 'Too many requests' },
				})
			);
			return;
		}

		if (!this.validateCorsOrigin(req)) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'forbidden' }, 'Total HTTP request errors');
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32000, message: 'Forbidden - invalid origin' },
				})
			);
			return;
		}

		this.setCorsHeaders(res);

		if (req.method === 'GET' && req.url === '/metrics') {
			if (!this._metricsProvider) {
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('Not Found');
				return;
			}

			res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
			res.end(this._metricsProvider());
			return;
		}

		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		// Handle health check (liveness)
		if (req.method === 'GET' && req.url === '/health') {
			const healthData: Record<string, unknown> = { status: 'healthy', requests: this._requestCount };
			if (this._healthChecker) {
				const liveness = this._healthChecker.checkLiveness();
				healthData.liveness = liveness;
			}
			res.writeHead(200, {
				'Content-Type': 'application/json',
			});
			res.end(JSON.stringify(healthData));
			return;
		}

		// Handle readiness check
		if (req.method === 'GET' && req.url === '/ready') {
			if (this._healthChecker) {
				const readiness = await this._healthChecker.checkReadiness();
				const statusCode = readiness.status === 'ok' ? 200 : 503;
				res.writeHead(statusCode, {
					'Content-Type': 'application/json',
				});
				res.end(JSON.stringify(readiness));
			} else {
				res.writeHead(200, {
					'Content-Type': 'application/json',
				});
				res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), components: {} }));
			}
			return;
		}

		if (req.method !== 'POST' || req.url !== this._path) {
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'not_found' }, 'Total HTTP request errors');
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32601, message: 'Not Found' },
				})
			);
			return;
		}

		this._requestCount++;
		this._activeRequests++;
		// Set up request timeout
		const timeout = setTimeout(() => {
			this._activeRequests--;
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'timeout' }, 'Total HTTP request errors');
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32603, message: 'Request timeout' },
				})
			);
		}, this._requestTimeout);

		try {
			// Read request body with size limit
			let body = '';
			let bodySize = 0;

			for await (const chunk of req) {
				bodySize += chunk.length;

				// Check body size limit
				if (this._bodySizeLimitEnabled && bodySize > this._maxBodySize) {
					clearTimeout(timeout);
					this._activeRequests--;
					this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'payload_too_large' }, 'Total HTTP request errors');
					res.writeHead(413, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Request body too large' }));
					return;
				}

				body += chunk.toString();
			}

			// Validate JSON
			let jsonRpcRequest;
			try {
				jsonRpcRequest = JSON.parse(body);
			} catch {
				clearTimeout(timeout);
				this._activeRequests--;
				this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'parse_error' }, 'Total HTTP request errors');
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						jsonrpc: '2.0',
						id: null,
						error: { code: -32700, message: 'Parse error' },
					})
				);
				return;
			}

			const parseResult = safeParse(JsonRpcRequestSchema, jsonRpcRequest);
			if (!parseResult.success) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'validation' }, 'Total HTTP request errors');
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

			// Check if MCP server is ready
			if (!this._mcpServer) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'server_not_ready' }, 'Total HTTP request errors');
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						jsonrpc: '2.0',
						id: jsonRpcRequest?.id ?? null,
						error: { code: -32603, message: 'Server not ready' },
					})
				);
				return;
			}

			// Process JSON-RPC request through MCP server
			const response = await this._mcpServer.receive(jsonRpcRequest, {
				sessionInfo: {},
			});

			clearTimeout(timeout);
			this._activeRequests--;

			if (response) {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			} else {
				// No response (notification)
				res.writeHead(204);
				res.end();
			}
		} catch (error) {
			clearTimeout(timeout);
			this._activeRequests--;
			this._metrics?.counter('http_request_errors_total', 1, { transport: 'http', error_type: 'internal_error' }, 'Total HTTP request errors');
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					jsonrpc: '2.0',
					id: null,
					error: {
						code: -32603,
						message: 'Internal error',
						data: error instanceof Error ? error.message : String(error),
					},
				})
			);
		}
	}

	/**
	 * Returns number of requests handled.
	 */
	get requestCount(): number {
		return this._requestCount;
	}

	/**
	 * Stops transport server.
	 */
	async stop(): Promise<void> {
		this._isShuttingDown = true;
		this._stopRateLimitCleanup();

		return new Promise((resolve) => {
			// Close server
			this._server.close(() => {
				this.log('info', 'HTTP transport stopped');
				resolve();
			});
		});
	}
}

/**
 * Create an HTTP transport with given options.
 *
 * @param options - Transport configuration
 * @returns A configured HTTP transport
 *
 * @example
 * ```typescript
 * const transport = new HttpTransport({ port: 3000 });
 * await transport.connect(server);
 * ```
 */
export function createHttpTransport(options: HttpTransportOptions = {}): HttpTransport {
	return new HttpTransport(options);
}
