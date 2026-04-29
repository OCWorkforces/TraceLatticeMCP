/**
 * Reasoning Strategy contract — defines how a strategy observes reasoning state
 * and decides the next action (continue, branch, terminate, suspend).
 *
 * Strategies are pluggable policies that drive higher-level reasoning control
 * flow on top of the sequential thinking pipeline. They are pure (no I/O) and
 * receive a snapshot of session state via {@link StrategyContext}.
 *
 * @module contracts/strategy
 */

import type { SessionId } from './ids.js';
import type { ThoughtData } from '../core/thought.js';
import type { ReasoningStats } from '../core/reasoning.js';
import type { GraphView } from '../core/graph/GraphView.js';


/**
 * Read-only snapshot of session state passed to a reasoning strategy.
 *
 * All fields are immutable references. Strategies MUST NOT mutate the
 * history, graph, or stats — doing so will corrupt downstream consumers.
 *
 * @example
 * ```ts
 * const ctx: StrategyContext = {
 *   sessionId: 'sess_42',
 *   history: hm.getHistory('sess_42'),
 *   graph: new GraphView(edgeStore, 'sess_42'),
 *   stats: evaluator.computeStats(history),
 *   currentThought: latestThought,
 * };
 * const decision = strategy.decide(ctx);
 * ```
 */
export interface StrategyContext {
	/** Session identifier this context belongs to. */
	readonly sessionId: SessionId;
	/** Chronological list of thoughts recorded in this session. */
	readonly history: readonly ThoughtData[];
	/** Read-only graph view for traversal (ancestors, descendants, etc.). Undefined when DAG edges are disabled. */
	readonly graph: GraphView | undefined;
	/** Aggregated reasoning analytics for the session. */
	readonly stats: ReasoningStats;
	/** The thought that just triggered the strategy decision. */
	readonly currentThought: ThoughtData;
}

/**
 * Discriminated union describing the action a strategy wants to take.
 *
 * - `continue`  — keep the current chain; optionally hint at next direction.
 * - `branch`    — fork a new branch from a prior thought.
 * - `terminate` — stop the reasoning chain; reason is required.
 * - `suspend`   — pause the chain; may be resumed after `resumeAfter` ms.
 *
 * @example
 * ```ts
 * const d: StrategyDecision = { action: 'branch', branchId: 'alt-1', fromThought: 3 };
 * if (d.action === 'branch') console.log(d.branchId);
 * ```
 */
export type StrategyDecision =
	| { action: 'continue'; reason?: string; nextHint?: string }
	| { action: 'branch'; branchId: string; fromThought: number; reason?: string }
	| { action: 'terminate'; reason: string }
	| { action: 'suspend'; reason: string; resumeAfter?: number };

/**
 * Pluggable reasoning strategy interface.
 *
 * Implementations are stateless with respect to global state — all input
 * comes from the {@link StrategyContext}. Strategies are registered via DI
 * and selected by name (e.g. `tot`, `cot`, `react`).
 *
 * @example
 * ```ts
 * class GreedyStrategy implements IReasoningStrategy {
 *   readonly name = 'greedy';
 *   decide(ctx: StrategyContext): StrategyDecision {
 *     return { action: 'continue' };
 *   }
 *   shouldBranch(_ctx: StrategyContext): boolean { return false; }
 *   shouldTerminate(ctx: StrategyContext): boolean {
 *     return ctx.history.length >= 50;
 *   }
 * }
 * ```
 */
export interface IReasoningStrategy {
	/** Stable identifier (used for DI lookup and metrics labels). */
	readonly name: string;
	/** Compute the next action given the current state snapshot. */
	decide(ctx: StrategyContext): StrategyDecision;
	/** Predicate: should the chain branch right now? */
	shouldBranch(ctx: StrategyContext): boolean;
	/** Predicate: should the chain terminate right now? */
	shouldTerminate(ctx: StrategyContext): boolean;
}
