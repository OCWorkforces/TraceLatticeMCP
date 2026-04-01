/**
 * History and branch management for sequential thinking.
 *
 * This module provides the `HistoryManager` class which manages thought history,
 * branching, and optional persistence with per-session state isolation.
 *
 * @module HistoryManager
 */

import type { ThoughtData } from './thought.js';
import type { Logger } from '../logger/StructuredLogger.js';
import { NullLogger } from '../logger/NullLogger.js';
import type { PersistenceBackend } from '../persistence/PersistenceBackend.js';
import type { IHistoryManager } from './IHistoryManager.js';
import type { IMetrics } from '../contracts/index.js';

/**
 * Absolute maximum history size. Cannot be overridden by configuration.
 * Prevents unbounded memory growth from misconfiguration.
 * At ~2KB per thought, 10K thoughts ≈ ~20MB — reasonable for server-side.
 * @constant
 */
export const ABSOLUTE_MAX_HISTORY_SIZE = 10_000;

/**
 * Interface for emitting persistence error events.
 * Compatible with EventEmitter's emit method signature.
 */
export interface PersistenceEventEmitter {
	emit(event: 'persistenceError', payload: { operation: string; error: Error }): boolean;
}

/** Internal state container for a single session's data. */
interface SessionState {
	thought_history: ThoughtData[];
	branches: Record<string, ThoughtData[]>;
	availableMcpTools: string[] | undefined;
	availableSkills: string[] | undefined;
	writeBuffer: ThoughtData[];
	lastAccessedAt: number;
}

/**
 * Configuration options for creating a `HistoryManager` instance.
 *
 * @example
 * ```typescript
 * const config: HistoryManagerConfig = {
 *   maxHistorySize: 500,
 *   maxBranches: 25,
 *   maxBranchSize: 50,
 *   logger: new StructuredLogger(),
 *   persistence: filePersistence
 * };
 * ```
 */
export interface HistoryManagerConfig {
	/**
	 * Maximum number of thoughts to keep in main history.
	 * @default 1000
	 */
	maxHistorySize?: number;

	/**
	 * Maximum number of branches to maintain.
	 * @default 50
	 */
	maxBranches?: number;

	/**
	 * Maximum size of each branch.
	 * @default 100
	 */
	maxBranchSize?: number;

	/** Optional logger for diagnostics. */
	logger?: Logger;

	/** Optional persistence backend for saving/loading history. */
	persistence?: PersistenceBackend | null;
	metrics?: IMetrics;

	/**
	 * Maximum number of thoughts to buffer before flushing to persistence.
	 * @default 100
	 */
	persistenceBufferSize?: number;

	/**
	 * Interval in milliseconds between periodic persistence flushes.
	 * @default 1000
	 */
	persistenceFlushInterval?: number;

	/**
	 * Maximum number of retries for failed persistence flushes.
	 * @default 3
	 */
	persistenceMaxRetries?: number;

	/**
	 * Event emitter for persistence error events.
	 * When provided, persistenceError events are emitted on persistent failures.
	 */
	eventEmitter?: PersistenceEventEmitter;
}

/**
 * Manages thought history and branching for sequential thinking.
 *
 * This class is the central component for managing the state of sequential thinking
 * operations. It handles thought storage, branch management, and optional persistence
 * for state recovery. State is isolated per session via a `Map<string, SessionState>`.
 *
 * @remarks
 * **History Management:**
 * - Thoughts are stored in a linear history array per session
 * - Auto-trimming occurs when `maxHistorySize` is exceeded
 * - Oldest thoughts are removed first (FIFO eviction)
 *
 * **Session Isolation:**
 * - Each session maintains its own thought history, branches, and cached tools/skills
 * - Sessions are identified by optional `session_id` on ThoughtData
 * - Default (undefined) session_id maps to `__global__`
 * - TTL-based cleanup prevents unbounded memory growth
 * - LRU eviction when MAX_SESSIONS exceeded
 *
 * **Branch Management:**
 * - Branches allow exploring alternative reasoning paths
 * - Each branch has its own thought array within a session
 * - Branches are created when `branch_from_thought` and `branch_id` are set
 * - Branch count and size are limited by `maxBranches` and `maxBranchSize`
 *
 * **Persistence:**
 * - Optional persistence backend for saving/loading state
 * - Persists thoughts and branches asynchronously (fire-and-forget)
 * - Does not block on persistence failures
 *
 * @example
 * ```typescript
 * const manager = new HistoryManager({
 *   maxHistorySize: 500,
 *   maxBranches: 25,
 *   logger: new StructuredLogger({ context: 'History' })
 * });
 *
 * // Add a thought
 * manager.addThought({
 *   thought: 'I need to analyze the problem',
 *   thought_number: 1,
 *   total_thoughts: 5,
 *   next_thought_needed: true
 * });
 *
 * // Get history
 * const history = manager.getHistory();
 * console.log(`Thoughts: ${history.length}`);
 *
 * // Get branches
 * const branches = manager.getBranches();
 * console.log(`Branches: ${Object.keys(branches).length}`);
 *
 * // Clear all state
 * manager.clear();
 * ```
 */
export class HistoryManager implements IHistoryManager {
	/** Default session key for backward-compatible global state. */
	private static readonly DEFAULT_SESSION = '__global__';

	/** TTL for inactive sessions in milliseconds (default: 30 minutes). */
	private static readonly SESSION_TTL_MS = 30 * 60 * 1000;

	/** Maximum number of concurrent sessions before eviction. */
	private static readonly MAX_SESSIONS = 100;

	/** Session state storage. */
	private _sessions: Map<string, SessionState> = new Map();

	/** Timer for periodic session cleanup. */
	private _sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;

	/** Maximum history size before auto-trimming. */
	private _maxHistorySize: number;

	/** Maximum number of branches before cleanup. */
	private _maxBranches: number;

	/** Maximum size of each branch. */
	private _maxBranchSize: number;

	/** Logger for diagnostics. */
	private _logger: Logger;

	/** Persistence backend for saving/loading state. */
	private _persistence: PersistenceBackend | null;

	/** Whether persistence is enabled. */
	private _persistenceEnabled: boolean;

	private _metrics?: IMetrics;

	/** Timer for periodic buffer flushes. */
	private _flushTimer: ReturnType<typeof setInterval> | null = null;

	/** Guard to prevent concurrent flushes. */
	private _isFlushing: boolean = false;

	/** Tracks consecutive flush failures for backoff. */
	private _flushRetryCount: number = 0;

	/** Maximum buffer size before triggering immediate flush. */
	private _persistenceBufferSize: number;

	/** Interval in milliseconds between periodic flushes. */
	private _persistenceFlushInterval: number;

	/** Maximum number of retries for failed flushes. */
	private _persistenceMaxRetries: number;

	/** Event emitter for persistence error events. */
	private _eventEmitter: PersistenceEventEmitter | null;

	/**
	 * Creates a new HistoryManager instance.
	 *
	 * @param config - Configuration options for the history manager
	 *
	 * @example
	 * ```typescript
	 * const manager = new HistoryManager({
	 *   maxHistorySize: 500,
	 *   maxBranches: 25,
	 *   logger: new StructuredLogger(),
	 *   persistence: filePersistence
	 * });
	 * ```
	 */
	constructor(config: HistoryManagerConfig = {}) {
		this._logger = config.logger ?? new NullLogger();
		const requestedMaxSize = config.maxHistorySize ?? 1000;
		this._maxHistorySize = Math.min(requestedMaxSize, ABSOLUTE_MAX_HISTORY_SIZE);
		if (requestedMaxSize > ABSOLUTE_MAX_HISTORY_SIZE) {
			this._logger.warn('maxHistorySize exceeds absolute maximum, capped', {
				requested: requestedMaxSize,
				applied: ABSOLUTE_MAX_HISTORY_SIZE,
			});
		}
		this._maxBranches = config.maxBranches || 50;
		this._maxBranchSize = config.maxBranchSize || 100;
		this._persistence = config.persistence ?? null;
		this._persistenceEnabled = this._persistence !== null;
		this._metrics = config.metrics;
		this._persistenceBufferSize = config.persistenceBufferSize ?? 100;
		this._persistenceFlushInterval = config.persistenceFlushInterval ?? 1000;
		this._persistenceMaxRetries = config.persistenceMaxRetries ?? 3;
		this._eventEmitter = config.eventEmitter ?? null;

		// Start the periodic flush timer if persistence is enabled
		if (this._persistenceEnabled) {
			this._startFlushTimer();
		}

		// Start the periodic session cleanup timer
		this._startSessionCleanupTimer();
	}

	/**
	 * Internal logging method.
	 * @param message - The message to log
	 * @param meta - Optional metadata
	 * @private
	 */
	private log(message: string, meta?: Record<string, unknown>): void {
		this._logger.info(message, meta);
	}

	/**
	 * Gets or creates the session state for a given session ID.
	 * Creates a new SessionState if one doesn't exist.
	 * Updates lastAccessedAt on every access.
	 *
	 * @param sessionId - Optional session ID (defaults to `__global__`)
	 * @returns The session state
	 * @private
	 */
	private _getSession(sessionId?: string): SessionState {
		const key = sessionId ?? HistoryManager.DEFAULT_SESSION;
		let session = this._sessions.get(key);
		if (!session) {
			session = {
				thought_history: [],
				branches: {},
				availableMcpTools: undefined,
				availableSkills: undefined,
				writeBuffer: [],
				lastAccessedAt: Date.now(),
			};
			this._sessions.set(key, session);
			this._evictExcessSessions();
		}
		session.lastAccessedAt = Date.now();
		return session;
	}

	/**
	 * Adds a thought to the history.
	 *
	 * The thought is appended to the session's history array. If history exceeds
	 * `maxHistorySize`, the oldest thoughts are removed. If the thought
	 * has `branch_from_thought` and `branch_id` set, it's also added to
	 * the appropriate branch. The thought is persisted asynchronously if
	 * persistence is enabled.
	 *
	 * @param thought - The thought data to add
	 *
	 * @example
	 * ```typescript
	 * manager.addThought({
	 *   thought: 'I should read the README file',
	 *   thought_number: 1,
	 *   total_thoughts: 3,
	 *   next_thought_needed: true
	 * });
	 * ```
	 */
	public addThought(thought: ThoughtData): void {
		const session = this._getSession(thought.session_id);
		this._metrics?.counter(
			'thought_requests_total',
			1,
			{},
			'Total thought requests added to history'
		);

		session.thought_history.push(thought);

		// Cache available_mcp_tools/available_skills for cross-call persistence
		if (thought.available_mcp_tools) {
			session.availableMcpTools = thought.available_mcp_tools;
		}
		if (thought.available_skills) {
			session.availableSkills = thought.available_skills;
		}

		if (session.thought_history.length > this._maxHistorySize) {
			session.thought_history = session.thought_history.slice(-this._maxHistorySize);
			this.log(`History trimmed to ${this._maxHistorySize} items`, {
				maxSize: this._maxHistorySize,
			});
		}

		if (thought.branch_from_thought && thought.branch_id) {
			this._addToSessionBranch(session, thought.branch_id, thought);
		}

		// Track merge operations for analytics
		if (thought.merge_from_thoughts?.length || thought.merge_branch_ids?.length) {
			this._metrics?.counter(
				'thought_merge_operations_total',
				1,
				{},
				'Total merge operations (graph topology)'
			);
		}

		// Buffer thought for persistence instead of fire-and-forget
		this._bufferForPersistence(session, thought);
	}

	/**
	 * Buffers a thought for persistence if enabled.
	 * @param session - The session state to buffer into
	 * @param thought - The thought to buffer
	 * @private
	 */
	private _bufferForPersistence(session: SessionState, thought: ThoughtData): void {
		if (!this._persistenceEnabled || !this._persistence) return;

		// Backpressure: if buffer is full and flush is failing, log warning
		if (session.writeBuffer.length >= this._persistenceBufferSize && this._isFlushing) {
			this.log('Write buffer full and flush in progress, applying backpressure', {
				bufferSize: session.writeBuffer.length,
				maxSize: this._persistenceBufferSize,
			});
		}

		session.writeBuffer.push(thought);

		// Trigger immediate flush if buffer is at capacity
		if (session.writeBuffer.length >= this._persistenceBufferSize) {
			void this._flushBuffer();
		}
	}

	/**
	 * Adds a thought to a branch within a specific session.
	 * @param session - The session state
	 * @param branchId - The branch identifier
	 * @param thought - The thought data to add
	 * @private
	 */
	private _addToSessionBranch(session: SessionState, branchId: string, thought: ThoughtData): void {
		if (!session.branches[branchId]) {
			session.branches[branchId] = [];
		}
		this._trimSessionBranchSize(session, branchId);
		session.branches[branchId].push(thought);

		if (Object.keys(session.branches).length > this._maxBranches) {
			this._cleanupSessionBranches(session);
		}

		// Persist branch to backend if enabled
		if (this._persistenceEnabled && this._persistence) {
			this._persistence.saveBranch(branchId, session.branches[branchId]).catch((err) => {
				this.log('Failed to persist branch', {
					branchId,
					error: err instanceof Error ? err.message : String(err),
				});
			});
		}
	}

	/**
	 * Removes old branches when count exceeds maxBranches within a session.
	 * @param session - The session state
	 * @private
	 */
	private _cleanupSessionBranches(session: SessionState): void {
		const branchCount = Object.keys(session.branches).length;
		if (branchCount > this._maxBranches) {
			const branchesToRemove = Object.keys(session.branches).slice(
				0,
				branchCount - this._maxBranches
			);
			for (const branchId of branchesToRemove) {
				delete session.branches[branchId];
				this.log(`Removed old branch: ${branchId}`, { branchId });
			}
		}
	}

	/**
	 * Trims a branch to maxBranchSize within a session.
	 * @param session - The session state
	 * @param branchId - The branch identifier to trim
	 * @private
	 */
	private _trimSessionBranchSize(session: SessionState, branchId: string): void {
		if ((session.branches[branchId] ?? []).length > this._maxBranchSize) {
			const removed = session.branches[branchId]!.length - this._maxBranchSize;
			session.branches[branchId] = session.branches[branchId]!.slice(-this._maxBranchSize);
			this.log(`Trimmed branch '${branchId}': removed ${removed} old thoughts`, {
				branchId,
				removed,
			});
		}
	}

	/**
	 * Gets the complete thought history.
	 *
	 * @param sessionId - Optional session ID for session-scoped results
	 * @returns An array of all thoughts in chronological order
	 *
	 * @example
	 * ```typescript
	 * const history = manager.getHistory();
	 * history.forEach(thought => {
	 *   console.log(`${thought.thought_number}: ${thought.thought}`);
	 * });
	 * ```
	 */
	public getHistory(sessionId?: string): ThoughtData[] {
		return this._getSession(sessionId).thought_history;
	}

	/**
	 * Gets the current length of the thought history.
	 *
	 * @param sessionId - Optional session ID for session-scoped results
	 * @returns The number of thoughts in history
	 *
	 * @example
	 * ```typescript
	 * console.log(`Total thoughts: ${manager.getHistoryLength()}`);
	 * ```
	 */
	public getHistoryLength(sessionId?: string): number {
		return this._getSession(sessionId).thought_history.length;
	}

	/**
	 * Gets all branches.
	 *
	 * @param sessionId - Optional session ID for session-scoped results
	 * @returns A record mapping branch IDs to their thought arrays
	 *
	 * @example
	 * ```typescript
	 * const branches = manager.getBranches();
	 * for (const [branchId, thoughts] of Object.entries(branches)) {
	 *   console.log(`Branch ${branchId}: ${thoughts.length} thoughts`);
	 * }
	 * ```
	 */
	public getBranches(sessionId?: string): Record<string, ThoughtData[]> {
		return this._getSession(sessionId).branches;
	}

	/**
	 * Gets all branch IDs.
	 *
	 * @param sessionId - Optional session ID for session-scoped results
	 * @returns An array of branch identifiers
	 *
	 * @example
	 * ```typescript
	 * const branchIds = manager.getBranchIds();
	 * console.log(`Active branches: ${branchIds.join(', ')}`);
	 * ```
	 */
	public getBranchIds(sessionId?: string): string[] {
		return Object.keys(this._getSession(sessionId).branches);
	}

	/**
	 * Gets the most recently available MCP tools from the session.
	 *
	 * @param sessionId - Optional session ID for session-scoped results
	 * @returns The last-seen array of MCP tool names, or undefined if never set
	 *
	 * @example
	 * ```typescript
	 * const tools = manager.getAvailableMcpTools();
	 * // ['Read', 'Grep', 'Glob'] or undefined
	 * ```
	 */
	public getAvailableMcpTools(sessionId?: string): string[] | undefined {
		return this._getSession(sessionId).availableMcpTools;
	}

	/**
	 * Gets the most recently available skills from the session.
	 *
	 * @param sessionId - Optional session ID for session-scoped results
	 * @returns The last-seen array of skill names, or undefined if never set
	 *
	 * @example
	 * ```typescript
	 * const skills = manager.getAvailableSkills();
	 * // ['commit', 'review-pr'] or undefined
	 * ```
	 */
	public getAvailableSkills(sessionId?: string): string[] | undefined {
		return this._getSession(sessionId).availableSkills;
	}

	/**
	 * Gets a specific branch by ID.
	 *
	 * @param branchId - The branch identifier
	 * @param sessionId - Optional session ID for session-scoped results
	 * @returns The branch's thought array, or undefined if not found
	 *
	 * @example
	 * ```typescript
	 * const branch = manager.getBranch('alternative-approach');
	 * if (branch) {
	 *   console.log(`Branch has ${branch.length} thoughts`);
	 * } else {
	 *   console.log('Branch not found');
	 * }
	 * ```
	 */
	public getBranch(branchId: string, sessionId?: string): ThoughtData[] | undefined {
		return this._getSession(sessionId).branches[branchId];
	}

	/**
	 * Clears history and branches.
	 * If sessionId is provided, clears only that session.
	 * If omitted, clears all sessions.
	 *
	 * @param sessionId - Optional session ID to clear
	 *
	 * @example
	 * ```typescript
	 * manager.clear();
	 * console.log('All history and branches cleared');
	 * ```
	 */
	public clear(sessionId?: string): void {
		if (sessionId !== undefined) {
			// Clear specific session
			this._sessions.delete(sessionId);
			this.log('Session cleared', { sessionId });
		} else {
			// Clear all sessions
			this._sessions.clear();
			this.log('History cleared (all sessions)');
		}

		// Clear persisted data if enabled
		if (this._persistenceEnabled && this._persistence) {
			this._persistence.clear().catch((err) => {
				this.log('Failed to clear persisted data', {
					error: err instanceof Error ? err.message : String(err),
				});
			});
		}
	}

	/** Clears state for a specific session. Alias for clear(sessionId). */
	public clearSession(sessionId: string): void {
		this.clear(sessionId);
	}

	/** Gets all active session IDs. */
	public getSessionIds(): string[] {
		return Array.from(this._sessions.keys());
	}

	/** Gets the number of active sessions. */
	public getSessionCount(): number {
		return this._sessions.size;
	}

	/**
	 * Loads history from the persistence backend.
	 *
	 * This should be called during initialization to restore previous state.
	 * Only loads if persistence is enabled and the backend is healthy.
	 * Loads into the global session.
	 *
	 * @returns Promise that resolves when loading is complete
	 *
	 * @example
	 * ```typescript
	 * await manager.loadFromPersistence();
	 * console.log(`Loaded ${manager.getHistoryLength()} thoughts`);
	 * ```
	 */
	public async loadFromPersistence(): Promise<void> {
		if (!this._persistenceEnabled || !this._persistence) {
			return;
		}

		try {
			// Check backend health
			const isHealthy = await this._persistence.healthy();
			if (!isHealthy) {
				this.log('Persistence backend not healthy, skipping load');
				return;
			}

			const globalSession = this._getSession();

			// Load history
			const history = await this._persistence.loadHistory();
			if (history.length > 0) {
				globalSession.thought_history = history.slice(-this._maxHistorySize);
				this.log(`Loaded ${globalSession.thought_history.length} thoughts from persistence`);
			}

			// Load branches
			const branchIds = await this._persistence.listBranches();
			for (const branchId of branchIds) {
				const branchData = await this._persistence.loadBranch(branchId);
				if (branchData) {
					globalSession.branches[branchId] = branchData.slice(-this._maxBranchSize);
				}
			}
			this.log(`Loaded ${Object.keys(globalSession.branches).length} branches from persistence`);
		} catch (error) {
			this.log('Failed to load from persistence', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Checks if persistence is enabled.
	 *
	 * @returns true if persistence is enabled, false otherwise
	 *
	 * @example
	 * ```typescript
	 * if (manager.isPersistenceEnabled()) {
	 *   console.log('Persistence is active');
	 * }
	 * ```
	 */
	public isPersistenceEnabled(): boolean {
		return this._persistenceEnabled;
	}

	/**
	 * Gets the persistence backend instance.
	 *
	 * @returns The persistence backend, or null if not configured
	 *
	 * @example
	 * ```typescript
	 * const backend = manager.getPersistenceBackend();
	 * if (backend) {
	 *   await backend.healthy();
	 * }
	 * ```
	 */
	public getPersistenceBackend(): PersistenceBackend | null {
		return this._persistence;
	}

	/**
	 * Sets the event emitter for persistence error events.
	 * This allows wiring up the event emitter after construction
	 * (e.g., when the server instance is the emitter).
	 *
	 * @param emitter - The event emitter to use for persistence error events
	 */
	public setEventEmitter(emitter: PersistenceEventEmitter): void {
		this._eventEmitter = emitter;
	}

	/**
	 * Gracefully shuts down the write buffer and session cleanup.
	 * Stops the periodic flush timer and session cleanup timer,
	 * then flushes any remaining buffered writes.
	 * Should be called during server shutdown before closing the persistence backend.
	 */
	public async shutdown(): Promise<void> {
		this._stopFlushTimer();
		this._stopSessionCleanupTimer();
		await this._flushBuffer();
	}

	/**
	 * Starts the periodic flush timer for the write buffer.
	 * @private
	 */
	private _startFlushTimer(): void {
		if (this._flushTimer !== null) {
			return;
		}
		this._flushTimer = setInterval(() => {
			void this._flushBuffer();
		}, this._persistenceFlushInterval);
		// Allow the process to exit even if the timer is still running
		if (this._flushTimer && typeof this._flushTimer === 'object' && 'unref' in this._flushTimer) {
			this._flushTimer.unref();
		}
	}

	/**
	 * Stops the periodic flush timer.
	 * @private
	 */
	private _stopFlushTimer(): void {
		if (this._flushTimer !== null) {
			clearInterval(this._flushTimer);
			this._flushTimer = null;
		}
	}

	/**
	 * Starts the periodic session cleanup timer.
	 * Runs every 5 minutes to evict sessions that exceeded TTL.
	 * @private
	 */
	private _startSessionCleanupTimer(): void {
		if (this._sessionCleanupTimer !== null) return;
		this._sessionCleanupTimer = setInterval(
			() => {
				this._cleanupStaleSessions();
			},
			5 * 60 * 1000
		);
		if (
			this._sessionCleanupTimer &&
			typeof this._sessionCleanupTimer === 'object' &&
			'unref' in this._sessionCleanupTimer
		) {
			this._sessionCleanupTimer.unref();
		}
	}

	/**
	 * Stops the periodic session cleanup timer.
	 * @private
	 */
	private _stopSessionCleanupTimer(): void {
		if (this._sessionCleanupTimer !== null) {
			clearInterval(this._sessionCleanupTimer);
			this._sessionCleanupTimer = null;
		}
	}

	/**
	 * Evicts sessions that have been inactive longer than SESSION_TTL_MS.
	 * The global session is never evicted.
	 * @private
	 */
	private _cleanupStaleSessions(): void {
		const now = Date.now();
		for (const [key, session] of this._sessions) {
			// Never evict the global session
			if (key === HistoryManager.DEFAULT_SESSION) continue;
			if (now - session.lastAccessedAt > HistoryManager.SESSION_TTL_MS) {
				this._sessions.delete(key);
				this.log('Evicted stale session', { sessionId: key });
			}
		}
	}

	/**
	 * Evicts oldest sessions when MAX_SESSIONS is exceeded (LRU).
	 * The global session is never evicted.
	 * @private
	 */
	private _evictExcessSessions(): void {
		while (this._sessions.size > HistoryManager.MAX_SESSIONS) {
			let oldestKey: string | null = null;
			let oldestTime = Infinity;
			for (const [key, session] of this._sessions) {
				if (key === HistoryManager.DEFAULT_SESSION) continue;
				if (session.lastAccessedAt < oldestTime) {
					oldestTime = session.lastAccessedAt;
					oldestKey = key;
				}
			}
			if (oldestKey !== null) {
				this._sessions.delete(oldestKey);
				this.log('Evicted oldest session (LRU)', { sessionId: oldestKey });
			} else {
				break;
			}
		}
	}

	/**
	 * Flushes the write buffer to the persistence backend.
	 *
	 * Collects all buffered thoughts across all sessions and saves them
	 * individually with retry logic. On persistent failure (all retries exhausted),
	 * emits a `persistenceError` event and re-queues failed items.
	 *
	 * This method is safe to call concurrently — duplicate calls are skipped.
	 * @internal
	 */
	public async _flushBuffer(): Promise<void> {
		if (this._isFlushing || !this._persistence) {
			return;
		}

		// Collect all pending writes from all sessions
		const allPending: ThoughtData[] = [];
		for (const session of this._sessions.values()) {
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
		} finally {
			this._isFlushing = false;
		}
	}

	/**
	 * Flushes a single thought to persistence with retry logic.
	 * @param thought - The thought to flush
	 * @returns true if saved successfully, false otherwise
	 * @private
	 */
	private async _flushSingleThought(thought: ThoughtData): Promise<boolean> {
		const backoffDelays = [100, 500, 2000];

		for (let attempt = 0; attempt <= this._persistenceMaxRetries; attempt++) {
			try {
				await this._persistence!.saveThought(thought);
				return true;
			} catch (err) {
				if (attempt < this._persistenceMaxRetries) {
					const delay = backoffDelays[attempt] ?? backoffDelays[backoffDelays.length - 1]!;
					this.log(`Persistence retry ${attempt + 1}/${this._persistenceMaxRetries}`, {
						thoughtNumber: thought.thought_number,
						delay,
						error: err instanceof Error ? err.message : String(err),
					});
					await this._delay(delay);
				} else {
					this.log('All persistence retries exhausted for thought', {
						thoughtNumber: thought.thought_number,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}

		return false;
	}

	/**
	 * Handles the result of a flush operation, re-queuing failures.
	 * @param failedItems - Thoughts that failed to persist
	 * @param totalCount - Total number of thoughts attempted
	 * @private
	 */
	private _handleFlushResult(failedItems: ThoughtData[], totalCount: number): void {
		if (failedItems.length > 0) {
			// Put failed items back in the global session's buffer
			const globalSession = this._getSession();
			globalSession.writeBuffer.unshift(...failedItems);
			this._flushRetryCount++;

			const error = new Error(
				`Failed to persist ${failedItems.length} thoughts after ${this._persistenceMaxRetries} retries`
			);
			this._eventEmitter?.emit('persistenceError', {
				operation: 'flushBuffer',
				error,
			});

			this.log('Flush completed with failures', {
				failed: failedItems.length,
				total: totalCount,
				consecutiveFailures: this._flushRetryCount,
			});
		} else {
			// Reset retry count on full success
			this._flushRetryCount = 0;
		}
	}

	/**
	 * Returns a promise that resolves after the specified delay.
	 * @param ms - Delay in milliseconds
	 * @private
	 */
	private _delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Gets the current write buffer length across all sessions.
	 * Useful for monitoring and testing.
	 */
	public getWriteBufferLength(): number {
		let total = 0;
		for (const session of this._sessions.values()) {
			total += session.writeBuffer.length;
		}
		return total;
	}
}
