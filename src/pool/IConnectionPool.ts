/**
 * Interface for the connection pool managing concurrent user sessions.
 *
 * This module provides the `IConnectionPool` interface which defines the
 * contract for connection pool implementations. This allows for decoupling
 * and testability for multi-user transports.
 *
 * @module IConnectionPool
 */

import type { ThoughtData } from '../core/thought.js';
import type { IDisposable } from '../types/disposable.js';
import type { ProcessResult, SessionInfo } from './ConnectionPool.js';

/**
 * Statistics describing the current state of the connection pool.
 */
export interface ConnectionPoolStats {
	totalSessions: number;
	activeSessions: number;
	maxSessions: number;
	cleanupEnabled: boolean;
	sessionTimeout: number;
}

/**
 * Interface for the connection pool.
 *
 * This interface defines the contract for managing multiple concurrent
 * user sessions, each with its own isolated server instance. Supports
 * dependency injection and mocking for testing purposes.
 *
 * @example
 * ```typescript
 * class MockPool implements IConnectionPool {
 *   async createSession(): Promise<string> { return 'mock'; }
 *   // ...
 * }
 * ```
 */
export interface IConnectionPool extends IDisposable {
	/**
	 * Create a new session.
	 *
	 * @returns The new session ID
	 * @throws PoolTerminatedError if the pool has been terminated
	 * @throws MaxSessionsReachedError if the maximum number of sessions is reached
	 */
	createSession(): Promise<string>;

	/**
	 * Process a thought in the specified session.
	 *
	 * @param sessionId - The session ID
	 * @param input - The thought data to process
	 * @returns The processing result
	 * @throws SessionNotFoundError if the session does not exist
	 */
	process(sessionId: string, input: ThoughtData): Promise<ProcessResult>;

	/**
	 * Close a session and release its resources.
	 *
	 * @param sessionId - The session ID to close
	 * @throws SessionNotFoundError if the session does not exist
	 */
	closeSession(sessionId: string): Promise<void>;

	/**
	 * Get information about a session.
	 *
	 * @param sessionId - The session ID
	 * @returns Session info, or undefined if not found
	 */
	getSessionInfo(sessionId: string): SessionInfo | undefined;

	/**
	 * Get all active sessions.
	 *
	 * @returns Array of session information for currently active sessions
	 */
	getActiveSessions(): SessionInfo[];

	/**
	 * Get connection pool statistics.
	 *
	 * @returns A snapshot of the pool's statistics
	 */
	getStats(): ConnectionPoolStats;

	/**
	 * Close all sessions and stop the cleanup timer.
	 */
	terminate(): Promise<void>;

	/**
	 * Dispose of the connection pool, releasing all resources.
	 *
	 * Implements the {@link IDisposable} interface. Typically delegates
	 * to {@link IConnectionPool.terminate}.
	 */
	dispose(): Promise<void>;

	/**
	 * Check if the connection pool is active (not terminated).
	 *
	 * @returns true if the pool is still running
	 */
	isRunning(): boolean;
}
