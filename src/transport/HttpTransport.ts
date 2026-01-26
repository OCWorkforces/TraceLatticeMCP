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
import { URL } from 'node:url';
import { safeParse } from 'valibot';
import { JsonRpcRequestSchema } from '../schema.js';
import { BaseTransport, type TransportOptions } from './BaseTransport.js';

/**
 * Default maximum body size (10MB).
 */
const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Default request timeout (30 seconds).
 */
const DEFAULT_REQUEST_TIMEOUT = 30000;

export interface HttpTransportOptions extends TransportOptions {
	/**
	 * Path for messages endpoint
	 * @default '/messages'
	 */
	path?: string;

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
	private _mcpServer: any;
	private _path: string;
	private _bodySizeLimitEnabled: boolean;
	private _maxBodySize: number;
	private _requestTimeout: number;
	private _requestCount: number = 0;

	constructor(options: HttpTransportOptions = {}) {
		super(options);
		this._path = options.path ?? '/messages';
		this._bodySizeLimitEnabled = options.enableBodySizeLimit ?? true;
		this._maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
		this._requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;

		this._server = createServer((req, res) => this._handleRequest(req, res));
	}

	/**
	 * Get number of active HTTP connections.
	 */
	get clientCount(): number {
		return this._requestCount;
	}

	/**
	 * Connects MCP server to this transport.
	 */
	async connect(mcpServer: unknown): Promise<void> {
		this._mcpServer = mcpServer;

		return new Promise((resolve, reject) => {
			this._server.listen(this._port, this._host, () => {
				console.log(`HTTP transport listening on http://${this._host}:${this._port}`);
				resolve();
			});

			this._server.on('error', (error: NodeJS.ErrnoException) => {
				if (error.code === 'EADDRINUSE') {
					reject(new Error(`Port ${this._port} is already in use`));
				} else {
					reject(error);
				}
			});
		});
	}

	/**
	 * Handles incoming HTTP requests.
	 */
	private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		this._requestCount++;

		const url = new URL(req.url || '', `http://${req.headers.host}`);

		// Check rate limit first
		const clientIp = this.getClientIp(req);
		if (this.checkRateLimit(clientIp)) {
			res.writeHead(429, {
				'Content-Type': 'application/json',
			});
			res.end(JSON.stringify({ error: 'Too many requests' }));
			return;
		}

		// Validate CORS origin
		if (!this.validateCorsOrigin(req)) {
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Forbidden' }));
			return;
		}

		// Set CORS headers for all responses
		this.setCorsHeaders(res);

		// Sanitize query parameters
		const sanitizedParams = this.sanitizeQueryParams(url);

		// Validate session ID if present
		if (sanitizedParams.session || sanitizedParams.sessionId) {
			const sessionId = sanitizedParams.session || sanitizedParams.sessionId;
			if (!this.validateSessionId(sessionId)) {
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

		// Handle messages endpoint (JSON-RPC method calls)
		if (url.pathname === this._path && req.method === 'POST') {
			await this._handleMessage(req, res);
			return;
		}

		// Handle health check
		if (url.pathname === '/health' && req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'healthy', requests: this._requestCount }));
			return;
		}

		// Handle root endpoint (server info)
		if (url.pathname === '/' && req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					name: 'MCP HTTP Transport',
					version: '1.0.0',
					status: 'running',
					endpoints: {
						messages: this._path,
						health: '/health',
					},
				})
			);
			return;
		}

		// 404 for unknown paths
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not Found');
	}

	/**
	 * Handles incoming message (JSON-RPC method call).
	 */
	private async _handleMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
		// Set up request timeout
		const timeout = setTimeout(() => {
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
		return new Promise((resolve) => {
			// Close server
			this._server.close(() => {
				console.log('HTTP transport stopped');
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
