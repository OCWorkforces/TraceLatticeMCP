/**
 * History and branch management for sequential thinking.
 *
 * This module provides the `HistoryManager` class which manages thought history,
 * branching, and optional persistence with per-session state isolation.
 *
 * Internally delegates to three focused collaborators:
 * - `EdgeEmitter` — DAG edge emission
 * - `PersistenceBuffer` — buffered persistence + retry/backoff
 * - `SessionManager` — session lifecycle (TTL/LRU eviction)
 *
 * @module HistoryManager
 */

import type { IMetrics } from '../contracts/interfaces.js';
import type { IEdgeStore } from '../contracts/interfaces.js';
import type { ISummaryStore } from '../contracts/summary.js';
import { ValidationError, SessionAccessDeniedError, getErrorMessage } from '../errors.js';
import { NullLogger } from '../logger/NullLogger.js';
import type { Logger } from '../logger/StructuredLogger.js';
import type { PersistenceBackend } from '../contracts/PersistenceBackend.js';
import {
	DehydrationPolicy,
	type DehydrationOptions,
	type HydratedEntry,
} from './compression/DehydrationPolicy.js';
import { EdgeEmitter } from './graph/EdgeEmitter.js';
import type { IHistoryManager } from './IHistoryManager.js';
import { PersistenceBuffer, type PersistenceEventEmitter } from './PersistenceBuffer.js';
import { SessionManager } from './SessionManager.js';
import type { ThoughtData } from './thought.js';
import { getOwner } from '../context/RequestContext.js';


/** Absolute maximum history size (~20MB at 2KB/thought). Cannot be overridden. */
export const ABSOLUTE_MAX_HISTORY_SIZE = 10_000;

interface SessionState {
	thought_history: ThoughtData[];
	branches: Record<string, ThoughtData[]>;
	availableMcpTools: string[] | undefined;
	availableSkills: string[] | undefined;
	writeBuffer: ThoughtData[];
	lastAccessedAt: number;
	registeredBranches: Set<string>;
	/** Owner identifier set on first owner-aware access. Immutable thereafter. */
	owner?: string;
}

export interface HistoryManagerConfig {
	/** Maximum number of thoughts to keep in main history. @default 1000 */
	maxHistorySize?: number;
	/** Maximum number of branches to maintain. @default 50 */
	maxBranches?: number;
	/** Maximum size of each branch. @default 100 */
	maxBranchSize?: number;
	logger?: Logger;
	persistence?: PersistenceBackend | null;
	metrics?: IMetrics;
	/** Maximum number of thoughts to buffer before flushing. @default 100 */
	persistenceBufferSize?: number;
	/** Periodic flush interval in ms. @default 1000 */
	persistenceFlushInterval?: number;
	/** Max retries for failed persistence flushes. @default 3 */
	persistenceMaxRetries?: number;
	eventEmitter?: PersistenceEventEmitter;
	edgeStore?: IEdgeStore;
	summaryStore?: ISummaryStore;
	/** Whether to emit DAG edges (gated independently of edgeStore). @default false */
	dagEdges?: boolean;
	/** Maximum sessions per owner (per-owner LRU bucket). @default 50 */
	maxSessionsPerOwner?: number;
}

/**
 * Manages thought history and branching for sequential thinking.
 *
 * Owns the per-session `Map<string, SessionState>`. Delegates DAG edge emission,
 * buffered persistence, and session TTL/LRU eviction to focused collaborators while
 * preserving test-coupled private member names (`_flushTimer`, `_startFlushTimer`,
 * `_flushBuffer`, `_sessions`).
 */
export class HistoryManager implements IHistoryManager {
	private static readonly DEFAULT_SESSION = '__global__';
	private static readonly SESSION_TTL_MS = 30 * 60 * 1000;
	private static readonly MAX_SESSIONS = 100;
	private _sessions: Map<string, SessionState> = new Map();
	private _maxHistorySize: number;
	private _maxBranches: number;
	private _maxBranchSize: number;
	private _logger: Logger;
	private _persistence: PersistenceBackend | null;
	private _persistenceEnabled: boolean;
	private _metrics?: IMetrics;

	private _edgeStore?: IEdgeStore;
	private _summaryStore?: ISummaryStore;
	private _dagEdges: boolean;

	private _eventEmitter: PersistenceEventEmitter | null;

	private readonly _edgeEmitter: EdgeEmitter;
	private _persistenceBuffer: PersistenceBuffer<SessionState> | null;
	private readonly _sessionManager: SessionManager<SessionState>;

	constructor(config: HistoryManagerConfig = {}) {
		this._logger = config.logger ?? new NullLogger();
		const requestedMaxSize = config.maxHistorySize ?? 10000;
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
		this._eventEmitter = config.eventEmitter ?? null;
		this._edgeStore = config.edgeStore;
		this._summaryStore = config.summaryStore;
		this._dagEdges = config.dagEdges ?? true;

		// Wire delegates
		this._edgeEmitter = new EdgeEmitter({
			edgeStore: this._edgeStore,
			dagEdges: this._dagEdges,
			defaultSessionId: HistoryManager.DEFAULT_SESSION,
			logger: this._logger,
		});

		this._sessionManager = new SessionManager<SessionState>({
			defaultSessionId: HistoryManager.DEFAULT_SESSION,
			sessionTtlMs: HistoryManager.SESSION_TTL_MS,
			cleanupIntervalMs: 5 * 60 * 1000,
			getMaxSessions: () => HistoryManager.MAX_SESSIONS,
			maxSessionsPerOwner: config.maxSessionsPerOwner ?? 50,
			logger: this._logger,
		});

		this._persistenceBuffer = null;
		if (this._persistenceEnabled && this._persistence) {
			this._persistenceBuffer = new PersistenceBuffer<SessionState>({
				persistence: this._persistence,
				bufferSize: config.persistenceBufferSize ?? 100,
				flushInterval: config.persistenceFlushInterval ?? 1000,
				maxRetries: config.persistenceMaxRetries ?? 3,
				defaultSessionId: HistoryManager.DEFAULT_SESSION,
				getSessions: () => this._sessions,
				getDefaultSession: () => this._getSession(),
				edgeStore: this._edgeStore,
				eventEmitter: this._eventEmitter,
				logger: this._logger,
			});
			this._startFlushTimer();
		}

		this._sessionManager.startCleanupTimer(this._sessions);
	}

	// Test-coupled accessors: these private member names must remain reachable
	// via `manager as unknown as { _flushTimer; _startFlushTimer }`.
	private get _flushTimer(): ReturnType<typeof setInterval> | null {
		return this._persistenceBuffer?.timer ?? null;
	}

	private _startFlushTimer(): void {
		this._persistenceBuffer?.startFlushTimer();
	}

	private _stopFlushTimer(): void {
		if (this._flushTimer === null) return;
		this._persistenceBuffer?.stopFlushTimer();
	}

	/** @internal Public for backward-compatible test coupling. */
	public async _flushBuffer(): Promise<void> {
		await this._persistenceBuffer?.flush();
	}

	/** EdgeStore instance, if configured. Used by ThoughtProcessor for StrategyContext. */
	public getEdgeStore(): IEdgeStore | undefined {
		return this._edgeStore;
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		this._logger.info(message, meta);
	}

	/** Reads owner from RequestContext (AsyncLocalStorage). Stdio path returns undefined. */
	private _getCurrentOwner(): string | undefined {
		return getOwner();
	}

	/**
	 * Gets or creates session state; updates lastAccessedAt.
	 *
	 * Ownership semantics:
	 * - `owner === undefined` (stdio path): never rejects, never sets owner.
	 * - `owner !== undefined`: if session has a different owner, throws
	 *   `SessionAccessDeniedError`. If session was created without an owner
	 *   (e.g. by stdio), the owner is set on first owner-aware access.
	 */
	private _getSession(sessionId?: string, owner?: string): SessionState {
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
				registeredBranches: new Set<string>(),
				owner,
			};
			this._sessions.set(key, session);
			this._sessionManager.evictExcessSessions(this._sessions);
		} else if (owner !== undefined) {
			if (session.owner !== undefined && session.owner !== owner) {
				throw new SessionAccessDeniedError(key, session.owner, owner);
			}
			if (session.owner === undefined) {
				// First owner-aware access: bind owner. Acceptable promotion path
				// for sessions created by stdio that later receive an owner-bearing
				// access (single-user transition).
				session.owner = owner;
			}
		}
		session.lastAccessedAt = Date.now();
		return session;
	}

	/**
	 * Adds a thought to the history. Routes per-session, applies retraction for backtrack,
	 * caches tools/skills, trims, branches, emits DAG edges, and buffers for persistence.
	 */
	public addThought(thought: ThoughtData): void {
		const session = this._getSession(thought.session_id, this._getCurrentOwner());
		this._metrics?.counter(
			'thought_requests_total',
			1,
			{},
			'Total thought requests added to history'
		);

		session.thought_history.push(thought);

		// Logical retraction: when a backtrack thought is added, mark its target
		// as retracted (append-only — target remains in history).
		if (thought.thought_type === 'backtrack' && thought.backtrack_target !== undefined) {
			this._applyRetraction(session, thought.backtrack_target);
		}

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

		// Emit DAG edges (no-op unless edgeStore + dagEdges flag both enabled)
		this._edgeEmitter.emitEdgesForThought(session, thought);

		// Buffer thought for persistence (no-op when persistence disabled)
		if (this._persistenceBuffer) {
			this._persistenceBuffer.bufferThought(session, thought);
		}
	}

	/** Marks the thought as retracted within the session (append-only). */
	private _applyRetraction(session: SessionState, targetNumber: number): void {
		for (const t of session.thought_history) {
			if (t.thought_number === targetNumber) {
				t.retracted = true;
				return;
			}
		}
		for (const branchThoughts of Object.values(session.branches)) {
			for (const t of branchThoughts) {
				if (t.thought_number === targetNumber) {
					t.retracted = true;
					return;
				}
			}
		}
	}

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
					error: getErrorMessage(err),
				});
			});
		}
	}

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

	public getHistory(sessionId?: string): ThoughtData[] {
		return this._getSession(sessionId, this._getCurrentOwner()).thought_history;
	}

	/**
	 * Returns history with optional sliding-window dehydration. Non-mutating: when
	 * `dagEdges` is off OR no `ISummaryStore` is configured, returns same as getHistory.
	 */
	public getHistoryHydrated(
		sessionId?: string,
		opts?: DehydrationOptions
	): HydratedEntry[] {
		const history = this.getHistory(sessionId);
		if (!this._dagEdges || !this._summaryStore) {
			return history.slice();
		}
		const sid = sessionId ?? HistoryManager.DEFAULT_SESSION;
		const policy = new DehydrationPolicy(this._summaryStore);
		return policy.apply(history, sid, opts);
	}

	public getHistoryLength(sessionId?: string): number {
		return this._getSession(sessionId, this._getCurrentOwner()).thought_history.length;
	}

	public getBranches(sessionId?: string): Record<string, ThoughtData[]> {
		return this._getSession(sessionId, this._getCurrentOwner()).branches;
	}

	public getBranchIds(sessionId?: string): string[] {
		const session = this._getSession(sessionId, this._getCurrentOwner());
		const ids = new Set<string>(Object.keys(session.branches));
		for (const id of session.registeredBranches) ids.add(id);
		return Array.from(ids);
	}

	/** @throws {ValidationError} If branchId is empty or already exists. */
	public registerBranch(sessionId: string | undefined, branchId: string): void {
		if (typeof branchId !== 'string' || branchId.length === 0) {
			throw new ValidationError('branch_id', 'branch_id must be a non-empty string');
		}
		const session = this._getSession(sessionId, this._getCurrentOwner());
		if (branchId in session.branches || session.registeredBranches.has(branchId)) {
			throw new ValidationError('branch_id', `Branch already exists: ${branchId}`);
		}
		session.registeredBranches.add(branchId);
		this.log('Registered branch', { branchId, sessionId: sessionId ?? null });
	}

	public branchExists(sessionId: string | undefined, branchId: string): boolean {
		const session = this._getSession(sessionId, this._getCurrentOwner());
		return branchId in session.branches || session.registeredBranches.has(branchId);
	}

	public getAvailableMcpTools(sessionId?: string): string[] | undefined {
		return this._getSession(sessionId, this._getCurrentOwner()).availableMcpTools;
	}

	public getAvailableSkills(sessionId?: string): string[] | undefined {
		return this._getSession(sessionId, this._getCurrentOwner()).availableSkills;
	}

	public getBranch(branchId: string, sessionId?: string): ThoughtData[] | undefined {
		return this._getSession(sessionId, this._getCurrentOwner()).branches[branchId];
	}

	/** Clears history and branches. If sessionId provided, clears only that session. */
	public clear(sessionId?: string): void {
		// Clear edges from EdgeStore (before session map mutation so keys are still available)
		if (this._edgeStore) {
			if (sessionId !== undefined) {
				this._edgeStore.clearSession(sessionId);
			} else {
				for (const sid of this._sessions.keys()) {
					this._edgeStore.clearSession(sid);
				}
				// Also clear the default session in case no session entries exist yet
				this._edgeStore.clearSession(HistoryManager.DEFAULT_SESSION);
			}
		}

		if (sessionId !== undefined) {
			this._sessions.delete(sessionId);
			this.log('Session cleared', { sessionId });
		} else {
			this._sessions.clear();
			this.log('History cleared (all sessions)');
		}

		// Clear persisted data if enabled
		if (this._persistenceEnabled && this._persistence) {
			this._persistence.clear().catch((err) => {
				this.log('Failed to clear persisted data', {
					error: getErrorMessage(err),
				});
			});
		}
	}

	public clearSession(sessionId: string): void {
		this.clear(sessionId);
	}

	public getSessionIds(): string[] {
		return Array.from(this._sessions.keys());
	}

	public getSessionCount(): number {
		return this._sessions.size;
	}

	/** Loads history from persistence into the global session. Call at init. */
	public async loadFromPersistence(): Promise<void> {
		if (!this._persistenceEnabled || !this._persistence) {
			return;
		}

		try {
			const isHealthy = await this._persistence.healthy();
			if (!isHealthy) {
				this.log('Persistence backend not healthy, skipping load');
				return;
			}

			const globalSession = this._getSession();

			const history = await this._persistence.loadHistory();
			if (history.length > 0) {
				globalSession.thought_history = history.slice(-this._maxHistorySize);
				this.log(`Loaded ${globalSession.thought_history.length} thoughts from persistence`);
			}

			const branchIds = await this._persistence.listBranches();
			for (const branchId of branchIds) {
				const branchData = await this._persistence.loadBranch(branchId);
				if (branchData) {
					globalSession.branches[branchId] = branchData.slice(-this._maxBranchSize);
				}
			}
			this.log(`Loaded ${Object.keys(globalSession.branches).length} branches from persistence`);

			// Load edges if EdgeStore is configured — restore for ALL persisted sessions
			if (this._edgeStore) {
				try {
					const edgeSessions = await this._persistence.listEdgeSessions();
					let totalEdges = 0;
					for (const sessionId of edgeSessions) {
						const edges = await this._persistence.loadEdges(sessionId);
						for (const edge of edges) {
							try {
								this._edgeStore.addEdge(edge);
								totalEdges++;
							} catch (edgeErr) {
								this.log('Failed to restore edge', {
									edgeId: edge.id,
									sessionId,
									error: getErrorMessage(edgeErr),
								});
							}
						}
					}
					this.log(
						`Loaded ${totalEdges} edges across ${edgeSessions.length} sessions from persistence`,
					);
				} catch (edgeError) {
					this.log('Failed to load edges from persistence', {
						error: getErrorMessage(edgeError),
					});
				}
			}
		} catch (error) {
			this.log('Failed to load from persistence', {
				error: getErrorMessage(error),
			});
		}
	}

	public isPersistenceEnabled(): boolean {
		return this._persistenceEnabled;
	}

	public getPersistenceBackend(): PersistenceBackend | null {
		return this._persistence;
	}

	/** Sets the event emitter for persistence error events (post-construction wiring). */
	public setEventEmitter(emitter: PersistenceEventEmitter): void {
		this._eventEmitter = emitter;
		this._persistenceBuffer?.setEventEmitter(emitter);
	}

	/** Stops timers and flushes any remaining buffered writes. */
	public async shutdown(): Promise<void> {
		this._stopFlushTimer();
		this._sessionManager.stopCleanupTimer();
		await this._flushBuffer();
	}

	/** Total write buffer length across all sessions. */
	public getWriteBufferLength(): number {
		let total = 0;
		for (const session of this._sessions.values()) {
			total += session.writeBuffer.length;
		}
		return total;
	}
}
