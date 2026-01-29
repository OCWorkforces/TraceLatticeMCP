/**
 * Base transport implementation.
 *
 * This class provides shared functionality for all transport implementations,
 * including session validation, rate limiting, CORS handling, and IP extraction.
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

import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { Logger, LogLevel } from '../logger/StructuredLogger.js';

/**
 * No-op logger that does nothing. Used when no logger is provided.
 */
class NoopLogger implements Logger {
	private _level: LogLevel = 'info';

	info(_message: string, _meta?: Record<string, unknown>): void {}
	warn(_message: string, _meta?: Record<string, unknown>): void {}
	error(_message: string, _meta?: Record<string, unknown>): void {}
	debug(_message: string, _meta?: Record<string, unknown>): void {}
	setLevel(level: LogLevel): void {
		this._level = level;
	}
	getLevel(): LogLevel {
		return this._level;
	}
}

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

export interface TransportOptions {
	port?: number;
	host?: string;
	corsOrigin?: string;
	enableCors?: boolean;
	enableRateLimit?: boolean;
	maxRequestsPerMinute?: number;
	logger?: Logger;
}

export abstract class BaseTransport {
	protected _port: number;
	protected _host: string;
	protected _corsOrigin: string;
	protected _enableCors: boolean;
	protected _rateLimitEnabled: boolean;
	protected _maxRequestsPerMinute: number;
	protected _rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();
	protected _wasHostExplicitlySet: boolean;
	/** Shutdown state for graceful shutdown. */
	protected _isShuttingDown: boolean = false;
	private _logger: Logger | NoopLogger;

	constructor(options: TransportOptions = {}) {
		this._port = options.port ?? 9108;
		this._host = options.host ?? '127.0.0.1';
		this._wasHostExplicitlySet = options.host !== undefined;
		this._corsOrigin = options.corsOrigin ?? '*';
		this._enableCors = options.enableCors ?? true;
		this._rateLimitEnabled = options.enableRateLimit ?? true;
		this._maxRequestsPerMinute = options.maxRequestsPerMinute ?? RATE_LIMIT_REQUESTS;
		this._isShuttingDown = false;
		this._logger = options.logger ?? new NoopLogger();
	}

	/**
	 * Get the server URL with localhost substitution for default host.
	 */
	get serverUrl(): string {
		const host =
			!this._wasHostExplicitlySet && this._host === '127.0.0.1' ? 'localhost' : this._host;
		return `http://${host}:${this._port}`;
	}

	/**
	 * Validate session ID format.
	 *
	 * @param sessionId - The session ID to validate
	 * @returns true if valid, false otherwise
	 */
	protected validateSessionId(sessionId: string): boolean {
		if (sessionId.length > MAX_SESSION_ID_LENGTH) {
			return false;
		}
		return SESSION_ID_PATTERN.test(sessionId);
	}

	/**
	 * Sanitize query parameters by removing any not in whitelist.
	 *
	 * @param url - The URL object containing query parameters
	 * @returns A sanitized record of allowed query parameters
	 */
	protected sanitizeQueryParams(url: URL): Record<string, string> {
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
	 */
	protected checkRateLimit(ip: string): boolean {
		if (!this._rateLimitEnabled) {
			return false;
		}

		const now = Date.now();
		const record = this._rateLimitMap.get(ip);

		if (!record || now > record.resetTime) {
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
	 */
	protected getClientIp(req: IncomingMessage): string {
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
	 */
	protected validateCorsOrigin(req: IncomingMessage): boolean {
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

		// Check if configured origin is a wildcard pattern
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
	 */
	protected setCorsHeaders(res: ServerResponse): void {
		if (this._enableCors) {
			res.setHeader('Access-Control-Allow-Origin', this._corsOrigin);
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		}
	}

	/**
	 * Log a message using the configured logger.
	 *
	 * @param level - Log level
	 * @param message - Message to log
	 * @param meta - Optional metadata
	 */
	protected log(
		level: 'info' | 'warn' | 'error',
		message: string,
		meta?: Record<string, unknown>
	): void {
		if (level === 'info') {
			this._logger.info(message, meta);
		} else if (level === 'warn') {
			this._logger.warn(message, meta);
		} else {
			this._logger.error(message, meta);
		}
	}

	/**
	 * Check if transport is shutting down.
	 * @returns true if in shutdown phase
	 */
	protected isShuttingDown(): boolean {
		return this._isShuttingDown;
	}

	/**
	 * Connect to MCP server.
	 */
	abstract connect(mcpServer: unknown): Promise<void>;

	/**
	 * Stop transport server with graceful shutdown.
	 *
	 * This method should:
	 * 1. Set shutdown flag to prevent new connections
	 * 2. Wait for in-flight requests to complete (configurable timeout)
	 * 3. Close server connections
	 * 4. Release resources
	 *
	 * @param timeout - Maximum time to wait for requests to drain (default: 30 seconds)
	 * @returns Promise that resolves when shutdown is complete
	 */
	abstract stop(timeout?: number): Promise<void>;

	/**
	 * Get number of clients connected.
	 */
	abstract get clientCount(): number;
}
