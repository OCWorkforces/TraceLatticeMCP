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

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { McpServer } from 'tmcp';
import { safeParse } from 'valibot';
import type { IMetrics } from '../contracts/interfaces.js';
import { getErrorMessage } from '../errors.js';
import { JsonRpcRequestSchema } from '../schema.js';
import { BaseTransport, type TransportOptions } from './BaseTransport.js';
import type { ITransport, TransportKind } from '../contracts/transport.js';
import {
	readRequestBody,
	sendCorsPreflight,
	sendJsonRpcError,
	sendJsonRpcResponse,
} from './HttpHelpers.js';
import { runWithContext } from '../context/RequestContext.js';

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
export class HttpTransport extends BaseTransport implements ITransport {
	get kind(): TransportKind { return 'http'; }
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
	 * Track an error in metrics.
	 */
	private _trackError(errorType: string): void {
		this._metrics?.counter(
			'http_request_errors_total',
			1,
			{ transport: 'http', error_type: errorType },
			'Total HTTP request errors'
		);
	}

	/**
	 * Route and handle incoming HTTP requests.
	 *
	 * Performs security checks (host, shutdown, rate limit, CORS) then
	 * dispatches to the appropriate endpoint handler.
	 */
	private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const startTime = Date.now();
		const requestPath = req.url || '/';
		const requestMethod = req.method || 'GET';
		this._metrics?.counter('http_requests_total', 1, {}, 'Total HTTP transport requests');
		this._metrics?.counter(
			'http_transport_requests_total',
			1,
			{ transport: 'http', method: requestMethod, path: requestPath },
			'Total HTTP requests by transport'
		);
		res.once('finish', () => {
			const durationSeconds = (Date.now() - startTime) / 1000;
			this._metrics?.histogram('http_request_duration_seconds', durationSeconds, {});
			this._metrics?.histogram('http_transport_request_duration_seconds', durationSeconds, {
				transport: 'http',
				path: requestPath,
			});
		});

		// Security middleware chain
		if (!this.validateHostHeader(req)) {
			this._trackError('forbidden');
			sendJsonRpcError(res, 403, -32000, 'Forbidden - invalid host header');
			return;
		}

		if (this.isShuttingDown) {
			this._trackError('shutting_down');
			sendJsonRpcError(res, 503, -32603, 'Server is shutting down');
			return;
		}

		const clientIp = this.getClientIp(req);
		if (this.checkRateLimit(clientIp)) {
			this._trackError('rate_limit');
			res.setHeader('Retry-After', '60');
			sendJsonRpcError(res, 429, -32000, 'Too many requests');
			return;
		}

		if (!this.validateCorsOrigin(req)) {
			this._trackError('forbidden');
			sendJsonRpcError(res, 403, -32000, 'Forbidden - invalid origin');
			return;
		}

		this.setCorsHeaders(res);

		// Static endpoints
		if (req.method === 'GET' && req.url === '/metrics')
			return this.handleMetricsEndpoint(res, this._metricsProvider);
		if (req.method === 'OPTIONS') return sendCorsPreflight(res);
		if (req.method === 'GET' && req.url === '/health')
			return this.handleHealthEndpoint(res, { requests: this._requestCount });
		if (req.method === 'GET' && req.url === '/ready') return this.handleReadinessEndpoint(res);

		// MCP endpoint
		if (req.method === 'POST' && req.url === this._path) return this._handlePostRequest(req, res);

		// 404
		this._trackError('not_found');
		sendJsonRpcError(res, 404, -32601, 'Not Found');
	}

	/**
	 * Handle POST to the MCP messages endpoint.
	 *
	 * Reads the request body, validates JSON-RPC format, and delegates
	 * processing to the MCP server.
	 */
	private async _handlePostRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		this._requestCount++;
		this._activeRequests++;

		const timeout = setTimeout(() => {
			this._activeRequests--;
			this._trackError('timeout');
			sendJsonRpcError(res, 500, -32603, 'Request timeout');
		}, this._requestTimeout);

		try {
			const maxBodySize = this._bodySizeLimitEnabled ? this._maxBodySize : 0;
			const body = await readRequestBody(req, maxBodySize);

			if (body === null) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._trackError('payload_too_large');
				sendJsonRpcError(res, 413, -32000, 'Request body too large');
				return;
			}

			let jsonRpcRequest;
			try {
				jsonRpcRequest = JSON.parse(body);
			} catch {
				clearTimeout(timeout);
				this._activeRequests--;
				this._trackError('parse_error');
				sendJsonRpcError(res, 200, -32700, 'Parse error');
				return;
			}

			const parseResult = safeParse(JsonRpcRequestSchema, jsonRpcRequest);
			if (!parseResult.success) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._trackError('validation');
				sendJsonRpcError(
					res,
					200,
					-32600,
					'Invalid Request',
					jsonRpcRequest?.id ?? null,
					parseResult.issues
				);
				return;
			}

			if (!this._mcpServer) {
				clearTimeout(timeout);
				this._activeRequests--;
				this._trackError('server_not_ready');
				sendJsonRpcError(res, 200, -32603, 'Server not ready', jsonRpcRequest?.id ?? null);
				return;
			}

			const owner = randomUUID();
			const response = await runWithContext(
				{ requestId: randomUUID(), owner },
				() => this._mcpServer!.receive(jsonRpcRequest, {
					sessionInfo: {},
				})
			);

			clearTimeout(timeout);
			this._activeRequests--;

			if (response) {
				sendJsonRpcResponse(res, response);
			} else {
				res.writeHead(204);
				res.end();
			}
		} catch (error) {
			clearTimeout(timeout);
			this._activeRequests--;
			this._trackError('internal_error');
			sendJsonRpcError(
				res,
				200,
				-32603,
				'Internal error',
				null,
				getErrorMessage(error)
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
