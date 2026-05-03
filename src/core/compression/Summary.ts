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
import * as v from 'valibot';
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

/**
 * Valibot schema for runtime validation of {@link Summary} records loaded
 * from persistence. IDs are validated as bounded strings; the brand is
 * applied implicitly when consumers narrow the parsed value to `Summary`.
 */
export const SummarySchema = v.object({
	id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	branchId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
	rootThoughtId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	coveredIds: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
	coveredRange: v.pipe(
		v.array(v.number()),
		v.length(2),
	),
	topics: v.array(v.string()),
	aggregateConfidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	createdAt: v.number(),
	meta: v.optional(v.record(v.string(), v.unknown())),
}) satisfies v.GenericSchema<{
	id: string;
	sessionId: string;
	branchId?: string;
	rootThoughtId: string;
	coveredIds: string[];
	coveredRange: number[];
	topics: string[];
	aggregateConfidence: number;
	createdAt: number;
	meta?: Record<string, unknown>;
}>;
