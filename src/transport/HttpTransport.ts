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
import { URL } from 'node:url';

/**
 * Allowed query parameter names (whitelist for security).
 */
const ALLOWED_QUERY_PARAMS = new Set(['session', 'sessionId', 'client', 'clientId']);

/**
 * Maximum session ID length.
 */
const MAX_SESSION_ID_LENGTH = 64;

/**
 * Session ID validation pattern (alphanumeric, hyphens, underscores).
 */
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Rate limit settings (requests per minute per IP).
 */
const RATE_LIMIT_REQUESTS = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Default maximum body size (10MB).
 */
const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Default request timeout (30 seconds).
 */
const DEFAULT_REQUEST_TIMEOUT = 30000;

export interface HttpTransportOptions {
	/**
	 * Port to listen on
	 * @default 9108
	 */
	port?: number;

	/**
	 * Host to bind to
	 * @default '127.0.0.1'
	 */
	host?: string;

	/**
	 * CORS origin to allow
	 * @default '*'
	 */
	corsOrigin?: string;

	/**
	 * Enable CORS preflight
	 * @default true
	 */
	enableCors?: boolean;

	/**
	 * Path for the messages endpoint
	 * @default '/mcp'
	 */
	path?: string;

	/**
	 * Enable rate limiting
	 * @default true
	 */
	enableRateLimit?: boolean;

	/**
	 * Max requests per minute per IP
	 * @default 100
	 */
	maxRequestsPerMinute?: number;

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
 * This transport uses standard HTTP request-response communication for MCP server
 * interactions, providing a stateless REST-like API interface.
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
export class HttpTransport {
	private _server: ReturnType<typeof createServer>;
	private _port: number;
	private _host: string;
	private _corsOrigin: string;
	private _enableCors: boolean;
	private _path: string;
	private _requestCount: number = 0;
	private _rateLimitEnabled: boolean;
	private _maxRequestsPerMinute: number;
	private _rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();
	private _bodySizeLimitEnabled: boolean;
	private _maxBodySize: number;
	private _requestTimeout: number;

	constructor(options: HttpTransportOptions = {}) {
		this._port = options.port ?? 9108;
		this._host = options.host ?? '127.0.0.1';
		this._corsOrigin = options.corsOrigin ?? '*';
		this._enableCors = options.enableCors ?? true;
		this._path = options.path ?? '/mcp';
		this._rateLimitEnabled = options.enableRateLimit ?? true;
		this._maxRequestsPerMinute = options.maxRequestsPerMinute ?? RATE_LIMIT_REQUESTS;
		this._bodySizeLimitEnabled = options.enableBodySizeLimit ?? true;
		this._maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
		this._requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;

		this._server = createServer((req, res) => this._handleRequest(req, res));
	}

	private _mcpServer: McpServer | null = null;

	/**
	 * Connect the MCP server to this transport.
	 *
	 * @param mcpServer - The MCP server instance
	 */
	async connect(mcpServer: McpServer): Promise<void> {
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
	 * Validate session ID format.
	 *
	 * @param sessionId - The session ID to validate
	 * @returns true if valid, false otherwise
	 * @private
	 */
	private _validateSessionId(sessionId: string): boolean {
		if (sessionId.length > MAX_SESSION_ID_LENGTH) {
			return false;
		}
		return SESSION_ID_PATTERN.test(sessionId);
	}

	/**
	 * Sanitize query parameters by removing any not in the whitelist.
	 *
	 * @param url - The URL object containing query parameters
	 * @returns A sanitized record of allowed query parameters
	 * @private
	 */
	private _sanitizeQueryParams(url: URL): Record<string, string> {
		const sanitized: Record<string, string> = {};

		for (const [key, value] of url.searchParams.entries()) {
			if (ALLOWED_QUERY_PARAMS.has(key)) {
				sanitized[key] = value;
			}
		}

		return sanitized;
	}

	/**
	 * Check rate limit for a given IP address.
	 *
	 * @param ip - The IP address to check
	 * @returns true if rate limit exceeded, false otherwise
	 * @private
	 */
	private _checkRateLimit(ip: string): boolean {
		if (!this._rateLimitEnabled) {
			return false;
		}

		const now = Date.now();
		const record = this._rateLimitMap.get(ip);

		if (!record || now > record.resetTime) {
			// Create new rate limit record
			this._rateLimitMap.set(ip, {
				count: 1,
				resetTime: now + RATE_LIMIT_WINDOW_MS,
			});
			return false;
		}

		if (record.count >= this._maxRequestsPerMinute) {
			return true; // Rate limit exceeded
		}

		record.count++;
		return false;
	}

	/**
	 * Get client IP address from request.
	 *
	 * @param req - The incoming request
	 * @returns The client IP address
	 * @private
	 */
	private _getClientIp(req: IncomingMessage): string {
		const forwardedFor = req.headers['x-forwarded-for'];
		if (forwardedFor && typeof forwardedFor === 'string') {
			return forwardedFor.split(',')[0].trim();
		}
		const remoteAddress = req.socket.remoteAddress;
		return remoteAddress || 'unknown';
	}

	/**
	 * Validate CORS origin from request headers.
	 *
	 * @param req - The incoming request
	 * @returns true if origin is valid, false otherwise
	 * @private
	 */
	private _validateCorsOrigin(req: IncomingMessage): boolean {
		// If corsOrigin is '*', allow all origins
		if (this._corsOrigin === '*') {
			return true;
		}

		const origin = req.headers.origin;
		if (!origin) {
			return true; // No origin header is acceptable
		}

		// Exact match
		if (this._corsOrigin === origin) {
			return true;
		}

		// Check if the configured origin is a wildcard pattern
		if (this._corsOrigin.includes('*')) {
			const pattern = this._corsOrigin.replace(/\*/g, '.*');
			const regex = new RegExp(`^${pattern}$`);
			return regex.test(origin);
		}

		return false;
	}

	/**
	 * Set CORS headers on response.
	 *
	 * @param res - The server response
	 * @private
	 */
	private _setCorsHeaders(res: ServerResponse): void {
		if (this._enableCors) {
			res.setHeader('Access-Control-Allow-Origin', this._corsOrigin);
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		}
	}

	/**
	 * Handle incoming HTTP requests
	 */
	private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		this._requestCount++;

		const url = new URL(req.url || '', `http://${req.headers.host}`);

		// Check rate limit first
		const clientIp = this._getClientIp(req);
		if (this._checkRateLimit(clientIp)) {
			res.writeHead(429, {
				'Content-Type': 'application/json',
				'Retry-After': '60',
			});
			res.end(JSON.stringify({ error: 'Too many requests' }));
			return;
		}

		// Validate CORS origin
		if (!this._validateCorsOrigin(req)) {
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Forbidden' }));
			return;
		}

		// Set CORS headers for all responses
		this._setCorsHeaders(res);

		// Sanitize query parameters
		const sanitizedParams = this._sanitizeQueryParams(url);

		// Validate session ID if present
		if (sanitizedParams.session || sanitizedParams.sessionId) {
			const sessionId = sanitizedParams.session || sanitizedParams.sessionId;
			if (!this._validateSessionId(sessionId)) {
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
	 * Handle incoming message (JSON-RPC method call)
	 */
	private async _handleMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
		// Set up request timeout
		const timeout = setTimeout(() => {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Request timeout' } }));
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
					res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Request body too large' } }));
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

			// Process the JSON-RPC request through the MCP server
			// The server.receive() method is the public API for handling JSON-RPC requests
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
	 * Get the number of requests handled
	 */
	get requestCount(): number {
		return this._requestCount;
	}

	/**
	 * Get the server URL
	 */
	get serverUrl(): string {
		return `http://${this._host}:${this._port}`;
	}

	/**
	 * Stop the transport server
	 */
	async stop(): Promise<void> {
		return new Promise((resolve) => {
			// Close the server
			this._server.close(() => {
				console.log('HTTP transport stopped');
				resolve();
			});
		});
	}
}

/**
 * Create an HTTP transport with the given options.
 *
 * @param options - Transport configuration
 * @returns A configured HTTP transport
 *
 * @example
 * ```typescript
 * const transport = createHttpTransport({ port: 3000 });
 * await transport.connect(mcpServer);
 * ```
 */
export function createHttpTransport(options: HttpTransportOptions = {}): HttpTransport {
	return new HttpTransport(options);
}
