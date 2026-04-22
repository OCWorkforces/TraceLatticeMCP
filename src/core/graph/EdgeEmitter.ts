/**
 * EdgeEmitter — emits DAG edges for thoughts based on their metadata.
 *
 * Stateless helper extracted from HistoryManager. Holds a reference to an
 * optional `IEdgeStore` and a feature flag (`dagEdges`) gating writes.
 *
 * @module EdgeEmitter
 */

import type { IEdgeStore } from '../../contracts/interfaces.js';
import { getErrorMessage } from '../../errors.js';
import type { Logger } from '../../logger/StructuredLogger.js';
import { NullLogger } from '../../logger/NullLogger.js';
import type { ThoughtData } from '../thought.js';
import type { Edge, EdgeKind } from './Edge.js';
import { generateEdgeId } from '../../contracts/ids.js';

/** Minimal session view needed for edge emission. */
export interface EdgeEmissionSession {
	thought_history: ThoughtData[];
	branches: Record<string, ThoughtData[]>;
}

/** Configuration options for EdgeEmitter. */
export interface EdgeEmitterConfig {
	edgeStore?: IEdgeStore;
	dagEdges?: boolean;
	defaultSessionId: string;
	logger?: Logger;
}

/**
 * Emits DAG edges for thought relationships when an `IEdgeStore` is configured
 * and the `dagEdges` feature flag is enabled. No-ops otherwise.
 */
export class EdgeEmitter {
	private readonly _edgeStore?: IEdgeStore;
	private readonly _dagEdges: boolean;
	private readonly _defaultSessionId: string;
	private readonly _logger: Logger;

	constructor(config: EdgeEmitterConfig) {
		this._edgeStore = config.edgeStore;
		this._dagEdges = config.dagEdges ?? true;
		this._defaultSessionId = config.defaultSessionId;
		this._logger = config.logger ?? new NullLogger();
	}

	/** Returns true when edge emission is active (store + flag both set). */
	public isEnabled(): boolean {
		return this._edgeStore !== undefined && this._dagEdges;
	}

	/**
	 * Emits DAG edges for a thought based on its metadata fields.
	 *
	 * Edge kinds (in priority order):
	 * - branch: branch_from_thought + branch_id → parent.id → current.id
	 * - merge: merge_from_thoughts → source.id → current.id (per source)
	 * - verifies: verification_target + thought_type=verification → current.id → target.id
	 * - critiques: verification_target + thought_type=critique → current.id → target.id
	 * - derives_from: synthesis_sources → source.id → current.id (per source)
	 * - revises: revises_thought → current.id → target.id
	 * - tool_invocation: tool_observation with _resumedFrom → tool_call.id → current.id
	 * - sequence: default chronological link from previous thought (if none of the above)
	 */
	public emitEdgesForThought(session: EdgeEmissionSession, thought: ThoughtData): void {
		if (!this._edgeStore || !this._dagEdges) return;
		if (!thought.id) return;

		const sessionId = thought.session_id ?? this._defaultSessionId;
		let emittedRelational = false;

		if (thought.branch_from_thought !== undefined && thought.branch_id) {
			const parentId = this.resolveThoughtId(session, thought.branch_from_thought);
			if (this._addEdgeIfValid(parentId, thought.id, 'branch', sessionId)) {
				emittedRelational = true;
			}
		}

		if (thought.merge_from_thoughts?.length) {
			for (const src of thought.merge_from_thoughts) {
				const srcId = this.resolveThoughtId(session, src);
				if (this._addEdgeIfValid(srcId, thought.id, 'merge', sessionId)) {
					emittedRelational = true;
				}
			}
		}

		if (thought.verification_target !== undefined && thought.thought_type === 'verification') {
			const targetId = this.resolveThoughtId(session, thought.verification_target);
			if (this._addEdgeIfValid(thought.id, targetId, 'verifies', sessionId)) {
				emittedRelational = true;
			}
		}

		if (thought.verification_target !== undefined && thought.thought_type === 'critique') {
			const targetId = this.resolveThoughtId(session, thought.verification_target);
			if (this._addEdgeIfValid(thought.id, targetId, 'critiques', sessionId)) {
				emittedRelational = true;
			}
		}

		if (thought.synthesis_sources?.length) {
			for (const src of thought.synthesis_sources) {
				const srcId = this.resolveThoughtId(session, src);
				if (this._addEdgeIfValid(srcId, thought.id, 'derives_from', sessionId)) {
					emittedRelational = true;
				}
			}
		}

		if (thought.revises_thought !== undefined) {
			const targetId = this.resolveThoughtId(session, thought.revises_thought);
			if (this._addEdgeIfValid(thought.id, targetId, 'revises', sessionId)) {
				emittedRelational = true;
			}
		}

		// tool_invocation edge: tool_call → tool_observation
		if (thought.thought_type === 'tool_observation' && thought._resumedFrom !== undefined) {
			const toolCallId = this.resolveThoughtId(session, thought._resumedFrom);
			const meta: Record<string, unknown> = {};
			if (thought.tool_name !== undefined) meta.tool_name = thought.tool_name;
			if (
				this._addEdgeIfValid(
					toolCallId,
					thought.id,
					'tool_invocation',
					sessionId,
					Object.keys(meta).length > 0 ? meta : undefined
				)
			) {
				emittedRelational = true;
			}
		}

		if (!emittedRelational) {
			// Default: chronological sequence from previous thought (the one before current).
			// current was just pushed, so prev is at length - 2.
			const history = session.thought_history;
			if (history.length >= 2) {
				const prev = history[history.length - 2]!;
				if (prev.id) {
					this._addEdgeIfValid(prev.id, thought.id, 'sequence', sessionId);
				}
			}
		}
	}

	/**
	 * Resolves a thought_number to its stable id within the given session.
	 * Searches main history first, then branches.
	 *
	 * @returns The thought's id if found and non-empty, undefined otherwise
	 */
	public resolveThoughtId(
		session: EdgeEmissionSession,
		thoughtNumber: number
	): string | undefined {
		for (const t of session.thought_history) {
			if (t.thought_number === thoughtNumber && typeof t.id === 'string' && t.id.length > 0) {
				return t.id;
			}
		}
		for (const branchThoughts of Object.values(session.branches)) {
			for (const t of branchThoughts) {
				if (t.thought_number === thoughtNumber && typeof t.id === 'string' && t.id.length > 0) {
					return t.id;
				}
			}
		}
		return undefined;
	}

	/**
	 * Adds an edge to the edge store if both endpoints are non-empty strings.
	 * Returns true if added, false if skipped (missing endpoint).
	 * Failures (e.g. self-edge) are caught and logged.
	 */
	private _addEdgeIfValid(
		from: string | undefined,
		to: string | undefined,
		kind: EdgeKind,
		sessionId: string,
		metadata?: Record<string, unknown>
	): boolean {
		if (!from || !to) {
			this._logger.debug('Skipping edge: unresolved endpoint', {
				kind,
				from: from ?? null,
				to: to ?? null,
			});
			return false;
		}
		const edge: Edge = {
			id: generateEdgeId(),
			from: from as Edge['from'],
			to: to as Edge['to'],
			kind,
			sessionId: sessionId as Edge['sessionId'],
			createdAt: Date.now(),
			...(metadata !== undefined ? { metadata } : {}),
		};
		try {
			this._edgeStore!.addEdge(edge);
			return true;
		} catch (err) {
			this._logger.info('Failed to add DAG edge', {
				kind,
				error: getErrorMessage(err),
			});
			return false;
		}
	}
}
