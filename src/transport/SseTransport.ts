/**
 * SSE (Server-Sent Events) Transport implementation.
 *
 * This transport allows multiple concurrent connections over HTTP using Server-Sent Events,
 * enabling multi-user scenarios and horizontal scaling.
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

export interface SseTransportOptions {
	/**
	 * Port to listen on
	 * @default 3000
	 */
	port?: number;

	/**
	 * Host to bind to
	 * @default 'localhost'
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
	 * Path for the SSE endpoint
	 * @default '/sse'
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
export class SseTransport {
	private _server: ReturnType<typeof createServer>;
	private _port: number;
	private _host: string;
	private _corsOrigin: string;
	private _enableCors: boolean;
	private _path: string;
	private _clients: Set<ServerResponse> = new Set();
	private _messageQueue: Map<string, any[]> = new Map();
	private _rateLimitEnabled: boolean;
	private _maxRequestsPerMinute: number;
	private _rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();

	constructor(options: SseTransportOptions = {}) {
		this._port = options.port ?? 3000;
		this._host = options.host ?? 'localhost';
		this._corsOrigin = options.corsOrigin ?? '*';
		this._enableCors = options.enableCors ?? true;
		this._path = options.path ?? '/sse';
		this._rateLimitEnabled = options.enableRateLimit ?? true;
		this._maxRequestsPerMinute = options.maxRequestsPerMinute ?? RATE_LIMIT_REQUESTS;

		this._server = createServer((req, res) => this._handleRequest(req, res));
	}

	/**
	 * Connect the MCP server to this transport.
	 *
	 * @param mcpServer - The MCP server instance
	 */
	async connect(mcpServer: McpServer): Promise<void> {
		this._mcpServer = mcpServer;

		return new Promise((resolve) => {
			this._server.listen(this._port, this._host, () => {
				console.log(`SSE transport listening on http://${this._host}:${this._port}`);
				resolve();
			});
		});
	}

	private _mcpServer: McpServer | null = null;

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
	 * Handle incoming HTTP requests
	 */
	private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
			res.end(JSON.stringify({ error: 'Forbidden - invalid origin' }));
			return;
		}

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
			res.writeHead(204, {
				'Access-Control-Allow-Origin': this._corsOrigin,
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			});
			res.end();
			return;
		}

		// Handle SSE endpoint
		if (url.pathname === this._path && req.method === 'GET') {
			this._handleSseConnection(req, res);
			return;
		}

		// Handle message endpoint (for receiving messages from clients)
		if (url.pathname === `${this._path}/message` && req.method === 'POST') {
			await this._handleMessage(req, res);
			return;
		}

		// Handle health check
		if (url.pathname === '/health') {
			res.writeHead(200, {
				'Access-Control-Allow-Origin': this._corsOrigin,
				'Content-Type': 'application/json',
			});
			res.end(JSON.stringify({ status: 'healthy', clients: this._clients.size }));
			return;
		}

		// 404 for unknown paths
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not Found');
	}

	/**
	 * Handle new SSE connection
	 */
	private _handleSseConnection(req: IncomingMessage, res: ServerResponse): void {
		// Set SSE headers
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': this._corsOrigin,
		});

		// Send initial connection event
		this._sendSseEvent(res, 'connected', { timestamp: Date.now() });

		// Add to clients
		this._clients.add(res);

		// Handle client disconnect
		req.on('close', () => {
			this._clients.delete(res);
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
	private async _handleMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
		let body = '';

		for await (const chunk of req) {
			body += chunk.toString();
		}

		try {
			JSON.parse(body); // Validate JSON

			// Process the message through the MCP server
			if (this._mcpServer) {
				// This would normally call the MCP server's tool handler
				// For now, we'll just acknowledge
				res.writeHead(200, {
					'Access-Control-Allow-Origin': this._corsOrigin,
					'Content-Type': 'application/json',
				});
				res.end(JSON.stringify({ success: true }));
			} else {
				res.writeHead(503, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Server not ready' }));
			}
		} catch (error) {
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
		}
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
		return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get the number of connected clients
	 */
	get clientCount(): number {
		return this._clients.size;
	}

	/**
	 * Stop the transport server
	 */
	async stop(): Promise<void> {
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

			// Close the server
			this._server.close(() => {
				console.log('SSE transport stopped');
				resolve();
			});
		});
	}
}

/**
 * Create an SSE transport with the given options.
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
