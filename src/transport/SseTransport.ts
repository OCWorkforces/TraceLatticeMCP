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
import { safeParse } from 'valibot';
import { JsonRpcRequestSchema } from '../schema.js';
import { BaseTransport, type TransportOptions } from './BaseTransport.js';

/**
 * SSE-specific transport options extending base TransportOptions.
 */
export interface SseTransportOptions extends TransportOptions {
	path?: string;
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
export class SseTransport extends BaseTransport {
	private _server: ReturnType<typeof createServer>;
	private _path: string;
	private _clients: Set<ServerResponse> = new Set();
	private _messageQueue: Map<string, unknown[]> = new Map();

	constructor(options: SseTransportOptions = {}) {
		super(options);
		this._path = options.path ?? '/sse';

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
		if (!this.validateHostHeader(req)) {
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Forbidden - invalid host header' }));
			return;
		}

		const url = new URL(req.url || '', `http://${req.headers.host}`);

		// Check rate limit first
		const clientIp = this.getClientIp(req);
		if (this.checkRateLimit(clientIp)) {
			res.writeHead(429, {
				'Content-Type': 'application/json',
				'Retry-After': '60',
			});
			res.end(JSON.stringify({ error: 'Too many requests' }));
			return;
		}

		// Validate CORS origin
		if (!this.validateCorsOrigin(req)) {
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
			Connection: 'keep-alive',
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
			const jsonRpcRequest = JSON.parse(body);
			const parseResult = safeParse(JsonRpcRequestSchema, jsonRpcRequest);
			if (!parseResult.success) {
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
				res.writeHead(503, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Server not ready' }));
			}
		} catch {
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
		return `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Get number of connected clients
	 */
	get clientCount(): number {
		return this._clients.size;
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
