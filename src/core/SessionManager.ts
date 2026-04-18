/**
 * SessionManager — owns periodic session cleanup timer and TTL/LRU eviction logic.
 *
 * Extracted from HistoryManager. The session Map remains owned by HistoryManager
 * (passed by reference) so that public access patterns are preserved.
 *
 * @module SessionManager
 */

import type { Logger } from '../logger/StructuredLogger.js';
import { NullLogger } from '../logger/NullLogger.js';

/** Minimal session contract — anything with a `lastAccessedAt` timestamp. */
export interface SessionLike {
	lastAccessedAt: number;
}

/** Configuration options for SessionManager. */
export interface SessionManagerConfig {
	/** Default session key that must never be evicted. */
	defaultSessionId: string;
	/** TTL for inactive sessions in milliseconds. */
	sessionTtlMs: number;
	/** Periodic cleanup interval in milliseconds. */
	cleanupIntervalMs: number;
	/** Returns the current MAX_SESSIONS limit (callable so tests can mutate). */
	getMaxSessions: () => number;
	logger?: Logger;
}

/**
 * Manages session lifecycle: periodic stale-session cleanup and LRU eviction
 * when the session count exceeds the configured maximum.
 */
export class SessionManager<S extends SessionLike> {
	private readonly _defaultSessionId: string;
	private readonly _sessionTtlMs: number;
	private readonly _cleanupIntervalMs: number;
	private readonly _getMaxSessions: () => number;
	private readonly _logger: Logger;
	private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor(config: SessionManagerConfig) {
		this._defaultSessionId = config.defaultSessionId;
		this._sessionTtlMs = config.sessionTtlMs;
		this._cleanupIntervalMs = config.cleanupIntervalMs;
		this._getMaxSessions = config.getMaxSessions;
		this._logger = config.logger ?? new NullLogger();
	}

	/** Returns the underlying cleanup timer (for test introspection). */
	public get timer(): ReturnType<typeof setInterval> | null {
		return this._cleanupTimer;
	}

	/**
	 * Starts the periodic session cleanup timer. No-op if already started.
	 * The timer is unref'd so it does not block process exit.
	 */
	public startCleanupTimer(sessions: Map<string, S>): void {
		if (this._cleanupTimer !== null) return;
		this._cleanupTimer = setInterval(() => {
			this.cleanupStaleSessions(sessions);
		}, this._cleanupIntervalMs);
		if (
			this._cleanupTimer &&
			typeof this._cleanupTimer === 'object' &&
			'unref' in this._cleanupTimer
		) {
			this._cleanupTimer.unref();
		}
	}

	/** Stops the periodic session cleanup timer. */
	public stopCleanupTimer(): void {
		if (this._cleanupTimer !== null) {
			clearInterval(this._cleanupTimer);
			this._cleanupTimer = null;
		}
	}

	/**
	 * Evicts sessions that have been inactive longer than `sessionTtlMs`.
	 * The default session is never evicted.
	 */
	public cleanupStaleSessions(sessions: Map<string, S>): void {
		const now = Date.now();
		for (const [key, session] of sessions) {
			if (key === this._defaultSessionId) continue;
			if (now - session.lastAccessedAt > this._sessionTtlMs) {
				sessions.delete(key);
				this._logger.info('Evicted stale session', { sessionId: key });
			}
		}
	}

	/**
	 * Evicts oldest sessions when the configured maximum is exceeded (LRU).
	 * The default session is never evicted.
	 */
	public evictExcessSessions(sessions: Map<string, S>): void {
		const max = this._getMaxSessions();
		while (sessions.size > max) {
			let oldestKey: string | null = null;
			let oldestTime = Infinity;
			for (const [key, session] of sessions) {
				if (key === this._defaultSessionId) continue;
				if (session.lastAccessedAt < oldestTime) {
					oldestTime = session.lastAccessedAt;
					oldestKey = key;
				}
			}
			if (oldestKey !== null) {
				sessions.delete(oldestKey);
				this._logger.info('Evicted oldest session (LRU)', { sessionId: oldestKey });
			} else {
				break;
			}
		}
	}
}
