/**
 * PersistenceBuffer — owns the periodic flush timer, retry/backoff logic, and
 * concurrent-flush guarding for HistoryManager's persistence write buffer.
 *
 * Extracted from HistoryManager. The session Map and write buffers remain
 * owned by HistoryManager (passed by reference) so public access patterns
 * (e.g. `manager._sessions`) are preserved.
 *
 * @module PersistenceBuffer
 */

import type { IEdgeStore } from '../contracts/interfaces.js';
import type { SessionId } from '../contracts/ids.js';
import { getErrorMessage } from '../errors.js';
import type { Logger } from '../logger/StructuredLogger.js';
import { NullLogger } from '../logger/NullLogger.js';
import type { PersistenceBackend } from '../contracts/PersistenceBackend.js';
import type { ThoughtData } from './thought.js';

/** Minimal session view: anything that owns a `writeBuffer`. */
export interface BufferedSession {
	writeBuffer: ThoughtData[];
}

/** Event emitter contract for persistence error events. */
export interface PersistenceEventEmitter {
	emit(event: 'persistenceError', payload: { operation: string; error: Error }): boolean;
}

/** Configuration options for PersistenceBuffer. */
export interface PersistenceBufferConfig<S extends BufferedSession> {
	persistence: PersistenceBackend;
	bufferSize: number;
	flushInterval: number;
	maxRetries: number;
	defaultSessionId: SessionId;
	/** Returns the live session map (called on each flush). */
	getSessions: () => Map<SessionId, S>;
	/** Returns the requeue target session (default-session buffer). */
	getDefaultSession: () => S;
	/** Optional EdgeStore for flushing edges alongside thoughts. */
	edgeStore?: IEdgeStore;
	/** Optional emitter for `persistenceError` events. */
	eventEmitter?: PersistenceEventEmitter | null;
	logger?: Logger;
}

/**
 * Manages buffered persistence writes with periodic flushing, exponential
 * backoff retries, concurrent-flush guarding, and edge store integration.
 */
export class PersistenceBuffer<S extends BufferedSession> {
	private readonly _persistence: PersistenceBackend;
	private readonly _bufferSize: number;
	private readonly _flushInterval: number;
	private readonly _maxRetries: number;
	private readonly _defaultSessionId: SessionId;
	private readonly _getSessions: () => Map<SessionId, S>;
	private readonly _getDefaultSession: () => S;
	private readonly _edgeStore?: IEdgeStore;
	private _eventEmitter: PersistenceEventEmitter | null;
	private readonly _logger: Logger;

	private _flushTimer: ReturnType<typeof setInterval> | null = null;
	private _isFlushing = false;
	private _flushRetryCount = 0;

	constructor(config: PersistenceBufferConfig<S>) {
		this._persistence = config.persistence;
		this._bufferSize = config.bufferSize;
		this._flushInterval = config.flushInterval;
		this._maxRetries = config.maxRetries;
		this._defaultSessionId = config.defaultSessionId;
		this._getSessions = config.getSessions;
		this._getDefaultSession = config.getDefaultSession;
		this._edgeStore = config.edgeStore;
		this._eventEmitter = config.eventEmitter ?? null;
		this._logger = config.logger ?? new NullLogger();
	}

	/** Returns the underlying flush timer (for test introspection). */
	public get timer(): ReturnType<typeof setInterval> | null {
		return this._flushTimer;
	}

	/** Returns true when a flush is in progress. */
	public get isFlushing(): boolean {
		return this._isFlushing;
	}

	/** Sets / replaces the persistence error event emitter. */
	public setEventEmitter(emitter: PersistenceEventEmitter | null): void {
		this._eventEmitter = emitter;
	}

	/**
	 * Buffers a thought into the given session's write buffer. Triggers an
	 * immediate flush when the buffer reaches `bufferSize`.
	 */
	public bufferThought(session: BufferedSession, thought: ThoughtData): void {
		// Backpressure: if buffer is full and flush is in progress, log warning
		if (session.writeBuffer.length >= this._bufferSize && this._isFlushing) {
			this._logger.info('Write buffer full and flush in progress, applying backpressure', {
				bufferSize: session.writeBuffer.length,
				maxSize: this._bufferSize,
			});
		}

		session.writeBuffer.push(thought);

		if (session.writeBuffer.length >= this._bufferSize) {
			void this.flush();
		}
	}

	/**
	 * Starts the periodic flush timer. No-op if already started.
	 * The timer is unref'd so it does not block process exit.
	 */
	public startFlushTimer(): void {
		if (this._flushTimer !== null) return;
		this._flushTimer = setInterval(() => {
			void this.flush();
		}, this._flushInterval);
		if (this._flushTimer && typeof this._flushTimer === 'object' && 'unref' in this._flushTimer) {
			this._flushTimer.unref();
		}
	}

	/** Stops the periodic flush timer. */
	public stopFlushTimer(): void {
		if (this._flushTimer !== null) {
			clearInterval(this._flushTimer);
			this._flushTimer = null;
		}
	}

	/**
	 * Flushes the write buffer to the persistence backend.
	 *
	 * Collects all buffered thoughts across all sessions and saves them
	 * individually with retry logic. On persistent failure (all retries
	 * exhausted), emits a `persistenceError` event and re-queues failed items
	 * into the default session's buffer.
	 *
	 * Safe to call concurrently — duplicate calls are skipped.
	 */
	public async flush(): Promise<void> {
		if (this._isFlushing) return;

		// Collect all pending writes from all sessions
		const allPending: ThoughtData[] = [];
		for (const session of this._getSessions().values()) {
			if (session.writeBuffer.length > 0) {
				allPending.push(...session.writeBuffer.splice(0));
			}
		}

		if (allPending.length === 0) return;

		this._isFlushing = true;
		const failedItems: ThoughtData[] = [];

		try {
			for (const thought of allPending) {
				const saved = await this._flushSingleThought(thought);
				if (!saved) {
					failedItems.push(thought);
				}
			}

			this._handleFlushResult(failedItems, allPending.length);

			if (this._edgeStore) {
				await this._flushEdges();
			}
		} finally {
			this._isFlushing = false;
		}
	}

	/**
	 * Flushes edges for all known sessions to the persistence backend.
	 * No-op when EdgeStore is unavailable.
	 */
	private async _flushEdges(): Promise<void> {
		if (!this._edgeStore) return;
		const sessionKeys = new Set<SessionId>(this._getSessions().keys());
		sessionKeys.add(this._defaultSessionId);
		for (const sessionId of sessionKeys) {
			const edges = this._edgeStore.edgesForSession(sessionId);
			if (edges.length === 0) continue;
			try {
				await this._persistence.saveEdges(sessionId, edges);
			} catch (err) {
				this._logger.info('Failed to persist edges for session', {
					sessionId,
					error: getErrorMessage(err),
				});
			}
		}
	}

	/**
	 * Flushes a single thought to persistence with exponential backoff retry.
	 * @returns true if saved successfully, false otherwise
	 */
	private async _flushSingleThought(thought: ThoughtData): Promise<boolean> {
		const backoffDelays = [100, 500, 2000];

		for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
			try {
				await this._persistence.saveThought(thought);
				return true;
			} catch (err) {
				if (attempt < this._maxRetries) {
					const delay = backoffDelays[attempt] ?? backoffDelays[backoffDelays.length - 1]!;
					this._logger.info(`Persistence retry ${attempt + 1}/${this._maxRetries}`, {
						thoughtNumber: thought.thought_number,
						delay,
						error: getErrorMessage(err),
					});
					await this._delay(delay);
				} else {
					this._logger.info('All persistence retries exhausted for thought', {
						thoughtNumber: thought.thought_number,
						error: getErrorMessage(err),
					});
				}
			}
		}

		return false;
	}

	/**
	 * Handles the result of a flush operation, re-queuing failures into the
	 * default session's buffer and emitting a `persistenceError` event when
	 * any items failed.
	 */
	private _handleFlushResult(failedItems: ThoughtData[], totalCount: number): void {
		if (failedItems.length > 0) {
			const defaultSession = this._getDefaultSession();
			defaultSession.writeBuffer.unshift(...failedItems);
			this._flushRetryCount++;

			const error = new Error(
				`Failed to persist ${failedItems.length} thoughts after ${this._maxRetries} retries`
			);
			this._eventEmitter?.emit('persistenceError', {
				operation: 'flushBuffer',
				error,
			});

			this._logger.info('Flush completed with failures', {
				failed: failedItems.length,
				total: totalCount,
				consecutiveFailures: this._flushRetryCount,
			});
		} else {
			this._flushRetryCount = 0;
		}
	}

	/** Returns a promise that resolves after the specified delay. */
	private _delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
