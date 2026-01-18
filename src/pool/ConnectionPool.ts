/**
 * Connection Pool for managing concurrent user sessions.
 *
 * This module provides session management for multi-user scenarios,
 * allowing multiple concurrent clients to each have isolated state.
 *
 * @example
 * ```typescript
 * const pool = new ConnectionPool({
 *   maxSessions: 100,
 *   sessionTimeout: 300000 // 5 minutes
 * });
 *
 * const sessionId = await pool.createSession();
 * await pool.process(sessionId, thought);
 * await pool.closeSession(sessionId);
 * ```
 */

import type { ThoughtData } from '../types.js';
import type { ToolAwareSequentialThinkingServer } from '../index.js';

export interface SessionOptions {
	/**
	 * Maximum number of concurrent sessions
	 * @default 100
	 */
	maxSessions?: number;

	/**
	 * Session timeout in milliseconds
	 * @default 300000 (5 minutes)
	 */
	sessionTimeout?: number;

	/**
	 * Whether to enable automatic session cleanup
	 * @default true
	 */
	autoCleanup?: boolean;

	/**
	 * Cleanup interval in milliseconds
	 * @default 60000 (1 minute)
	 */
	cleanupInterval?: number;
}

export interface SessionInfo {
	id: string;
	server: ToolAwareSequentialThinkingServer;
	createdAt: number;
	lastActivityAt: number;
	isActive: boolean;
}

export interface ProcessResult {
	content: Array<{
		type: string;
		text: string;
	}>;
	isError?: boolean;
}

/**
 * Represents a user session with its own server instance.
 */
export class Session {
	private _server: ToolAwareSequentialThinkingServer;
	private _id: string;
	private _createdAt: number;
	private _lastActivityAt: number;
	private _isActiveValue: boolean;
	private _timeout: number;
	private _cleanupTimer: NodeJS.Timeout | null = null;

	constructor(id: string, server: ToolAwareSequentialThinkingServer, timeout: number) {
		this._server = server;
		this._id = id;
		this._createdAt = Date.now();
		this._lastActivityAt = this._createdAt;
		this._isActiveValue = true;
		this._timeout = timeout;

		// Start session timeout timer
		this._startTimeout();
	}

	/**
	 * Check if the session is active.
	 */
	get isActive(): boolean {
		return this._isActiveValue;
	}

	/**
	 * Process a thought through this session's server instance.
	 */
	async process(input: ThoughtData): Promise<ProcessResult> {
		if (!this.isActive) {
			throw new Error('Session is not active');
		}

		// Update last activity
		this._lastActivityAt = Date.now();

		// Reset timeout timer
		this._resetTimeout();

		// Process the thought
		return this._server.processThought(input);
	}

	/**
	 * Get session information.
	 */
	getInfo(): SessionInfo {
		return {
			id: this._id,
			server: this._server,
			createdAt: this._createdAt,
			lastActivityAt: this._lastActivityAt,
			isActive: this.isActive,
		};
	}

	/**
	 * Check if the session has timed out.
	 */
	isTimedOut(): boolean {
		return Date.now() - this._lastActivityAt > this._timeout;
	}

	/**
	 * Close the session and stop the server.
	 */
	async close(): Promise<void> {
		this._isActiveValue = false;

		// Stop timeout timer
		if (this._cleanupTimer) {
			clearTimeout(this._cleanupTimer);
			this._cleanupTimer = null;
		}

		// Stop the server
		this._server.stop();
	}

	/**
	 * Start the session timeout timer.
	 */
	private _startTimeout(): void {
		if (this._cleanupTimer) {
			clearTimeout(this._cleanupTimer);
		}

		this._cleanupTimer = setTimeout(() => {
			if (this.isTimedOut()) {
				console.warn(`Session ${this._id} timed out, closing`);
				this.close().catch((err) => {
					console.error(`Error closing timed out session ${this._id}:`, err);
				});
			}
		}, this._timeout);
	}

	/**
	 * Reset the timeout timer after activity.
	 */
	private _resetTimeout(): void {
		this._startTimeout();
	}
}

/**
 * ConnectionPool manages multiple concurrent user sessions.
 *
 * Each session has its own server instance with isolated state,
 * allowing multiple users to interact with the system simultaneously.
 */
export class ConnectionPool {
	private _sessions: Map<string, Session> = new Map();
	private _maxSessions: number;
	private _sessionTimeout: number;
	private _autoCleanup: boolean;
	private _cleanupInterval: number;
	private _cleanupTimerId: number | null = null;
	private _terminated = false;

	constructor(options: SessionOptions = {}) {
		this._maxSessions = options.maxSessions ?? 100;
		this._sessionTimeout = options.sessionTimeout ?? 300000; // 5 minutes
		this._autoCleanup = options.autoCleanup ?? true;
		this._cleanupInterval = options.cleanupInterval ?? 60000; // 1 minute

		// Start automatic cleanup if enabled
		if (this._autoCleanup) {
			this._startCleanup();
		}
	}

	/**
	 * Create a new session.
	 *
	 * @returns The session ID
	 * @throws Error if max sessions reached
	 */
	async createSession(): Promise<string> {
		if (this._terminated) {
			throw new Error('ConnectionPool has been terminated');
		}

		if (this._sessions.size >= this._maxSessions) {
			throw new Error(
				`Max sessions (${this._maxSessions}) reached. Wait for a session to close or increase maxSessions.`
			);
		}

		// Generate unique session ID
		const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		// Create a new server instance for this session
		// Note: In production, you might want to reuse server instances or use a different strategy
		const { ToolAwareSequentialThinkingServer: Server } = await import('../index.js');
		const server = await Server.create({
			autoDiscover: true,
			lazyDiscovery: false,
			loadFromPersistence: true,
		});

		// Create session
		const session = new Session(sessionId, server, this._sessionTimeout);
		this._sessions.set(sessionId, session);

		console.log(`Created session ${sessionId} (${this._sessions.size}/${this._maxSessions} active sessions)`);
		return sessionId;
	}

	/**
	 * Process a thought in the specified session.
	 *
	 * @param sessionId - The session ID
	 * @param input - The thought data to process
	 * @returns Promise with the processing result
	 * @throws Error if session not found
	 */
	async process(sessionId: string, input: ThoughtData): Promise<ProcessResult> {
		const session = this._sessions.get(sessionId);

		if (!session) {
			throw new Error(`Session not found: ${sessionId}`);
		}

		return session.process(input);
	}

	/**
	 * Close a session and release resources.
	 *
	 * @param sessionId - The session ID to close
	 * @throws Error if session not found
	 */
	async closeSession(sessionId: string): Promise<void> {
		const session = this._sessions.get(sessionId);

		if (!session) {
			throw new Error(`Session not found: ${sessionId}`);
		}

		await session.close();
		this._sessions.delete(sessionId);

		console.log(`Closed session ${sessionId} (${this._sessions.size}/${this._maxSessions} active sessions)`);
	}

	/**
	 * Get information about a session.
	 *
	 * @param sessionId - The session ID
	 * @returns Session info or undefined if not found
	 */
	getSessionInfo(sessionId: string): SessionInfo | undefined {
		return this._sessions.get(sessionId)?.getInfo();
	}

	/**
	 * Get all active sessions.
	 *
	 * @returns Array of session information
	 */
	getActiveSessions(): SessionInfo[] {
		return Array.from(this._sessions.values())
			.filter((s) => s.isActive)
			.map((s) => s.getInfo());
	}

	/**
	 * Get connection pool statistics.
	 */
	getStats(): {
		totalSessions: number;
		activeSessions: number;
		maxSessions: number;
		cleanupEnabled: boolean;
		sessionTimeout: number;
	} {
		const activeSessions = this.getActiveSessions();

		return {
			totalSessions: this._sessions.size,
			activeSessions: activeSessions.length,
			maxSessions: this._maxSessions,
			cleanupEnabled: this._autoCleanup,
			sessionTimeout: this._sessionTimeout,
		};
	}

	/**
	 * Start the automatic cleanup timer.
	 */
	private _startCleanup(): void {
		if (this._cleanupTimerId !== null) {
			clearInterval(this._cleanupTimerId);
		}

		this._cleanupTimerId = setInterval(() => {
			this._cleanupTimedOutSessions();
		}, this._cleanupInterval) as unknown as number;
	}

	/**
	 * Remove timed-out sessions.
	 */
	private _cleanupTimedOutSessions(): void {
		let cleaned = 0;

		for (const [sessionId, session] of this._sessions.entries()) {
			if (session.isTimedOut()) {
				session.close().catch((err) => {
					console.error(`Error closing timed out session ${sessionId}:`, err);
				});
				this._sessions.delete(sessionId);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			console.log(`Cleaned ${cleaned} timed-out sessions (${this._sessions.size}/${this._maxSessions} active sessions)`);
		}
	}

	/**
	 * Close all sessions and stop the cleanup timer.
	 */
	async terminate(): Promise<void> {
		if (this._terminated) {
			return;
		}

		this._terminated = true;

		// Stop cleanup timer
		if (this._cleanupTimerId !== null) {
			clearInterval(this._cleanupTimerId);
			this._cleanupTimerId = null;
		}

		// Close all sessions
		const closePromises = Array.from(this._sessions.values()).map((session) =>
			session.close().catch((err) => {
				console.error(`Error closing session ${session.getInfo().id}:`, err);
			})
		);

		await Promise.all(closePromises);
		this._sessions.clear();

		console.log('ConnectionPool terminated');
	}

	/**
	 * Check if the connection pool is active.
	 */
	isRunning(): boolean {
		return !this._terminated;
	}
}

/**
 * Create a connection pool with the given options.
 *
 * @param options - Connection pool configuration
 * @returns A configured connection pool
 *
 * @example
 * ```typescript
 * const pool = createConnectionPool({
 *   maxSessions: 50,
 *   sessionTimeout: 300000
 * });
 * ```
 */
export function createConnectionPool(options?: SessionOptions): ConnectionPool {
	return new ConnectionPool(options);
}
