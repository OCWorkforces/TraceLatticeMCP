/**
 * Edge type definitions for the thought DAG.
 *
 * Edges represent semantic relationships between thoughts. Endpoints reference
 * `thought.id` (ulid string) rather than `thought_number` to avoid ambiguity
 * across branches.
 *
 * @module core/graph/Edge
 */

/**
 * Kinds of relationships between thoughts in the DAG.
 *
 * Each kind represents a semantic relationship that the reasoning controller
 * can use for search policy decisions.
 */
export type EdgeKind =
	| 'sequence' // default chronological successor
	| 'branch' // thought branched from a parent
	| 'merge' // thought merged insights from multiple sources
	| 'verifies' // thought verifies a hypothesis
	| 'critiques' // thought critiques a hypothesis
	| 'derives_from' // thought synthesizes from multiple sources
	| 'tool_invocation' // tool_call → tool_observation link
	| 'revises'; // thought revises a prior thought

/**
 * A directed edge in the thought DAG.
 *
 * Endpoints use `thought.id` (ulid string), not `thought_number`,
 * to avoid ambiguity under branching.
 *
 * @example
 * ```typescript
 * const edge: Edge = {
 *   id: generateUlid(),
 *   from: parentThought.id,
 *   to: childThought.id,
 *   kind: 'sequence',
 *   sessionId: '__global__',
 *   createdAt: Date.now(),
 * };
 * ```
 */
export interface Edge {
	/** Unique edge identifier (ulid). */
	readonly id: string;
	/** Source thought id. */
	readonly from: string;
	/** Target thought id. */
	readonly to: string;
	/** Semantic relationship kind. */
	readonly kind: EdgeKind;
	/** Session this edge belongs to. */
	readonly sessionId: string;
	/** Creation timestamp (`Date.now()`). */
	readonly createdAt: number;
	/** Optional metadata for strategy-specific annotations. */
	readonly metadata?: Record<string, unknown>;
}
