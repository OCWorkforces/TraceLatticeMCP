/**
 * Summary type — compressed representation of a contiguous subtree of thoughts.
 *
 * Summaries collapse a range of thoughts (typically an entire branch or an
 * older portion of the main chain) into a single record holding the union of
 * their identifiers, an extracted topic vector, and an aggregate confidence.
 * They are produced by the compression subsystem and consumed by reasoning
 * strategies that need bounded-context views over long sessions.
 *
 * @module core/compression/Summary
 */
import type { BranchId, SessionId, ThoughtId } from '../../contracts/ids.js';

/**
 * Immutable record describing a compressed group of thoughts.
 *
 * All fields are `readonly` to prevent post-creation mutation. Consumers
 * should treat instances as value objects.
 *
 * @example
 * ```ts
 * const summary: Summary = {
 *   id: '01HX...ulid',
 *   sessionId: 'sess_42',
 *   branchId: 'alt-1',
 *   rootThoughtId: 'thought-5',
 *   coveredIds: ['thought-5', 'thought-6', 'thought-7'],
 *   coveredRange: [5, 7],
 *   topics: ['cache', 'lookup', 'latency'],
 *   aggregateConfidence: 0.78,
 *   createdAt: Date.now(),
 * };
 * ```
 */
export interface Summary {
	/** Unique identifier (ulid). */
	readonly id: string;
	/** Session this summary belongs to. */
	readonly sessionId: SessionId;
	/** Optional branch id; `undefined` indicates main-chain compression. */
	readonly branchId?: BranchId;
	/** `id` of the thought that anchors the compressed subtree. */
	readonly rootThoughtId: ThoughtId;
	/** Thought ids included in this summary, in chronological order. */
	readonly coveredIds: readonly ThoughtId[];
	/** Inclusive `[min, max]` of `thought_number` values covered. */
	readonly coveredRange: readonly [number, number];
	/** Top-3 unigrams extracted from the covered thought texts. */
	readonly topics: readonly string[];
	/** Weighted-mean confidence of the covered thoughts (0-1). */
	readonly aggregateConfidence: number;
	/** Creation timestamp (`Date.now()`). */
	readonly createdAt: number;
	/** Free-form metadata for strategy-specific extensions. */
	readonly meta?: Record<string, unknown>;
}
