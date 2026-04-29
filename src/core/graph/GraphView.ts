/**
 * GraphView — read-only graph traversal queries over an {@link IEdgeStore}.
 *
 * Provides BFS / topological / ancestor / descendant queries over the
 * thought DAG. All methods return arrays of thought ids (ulid strings),
 * never `ThoughtData` objects — the view is intentionally decoupled from
 * `HistoryManager` so it can be reused by strategies that work purely in
 * terms of graph structure.
 *
 * Construction is cheap (stores a reference to the underlying store).
 * Each query reads the latest store state — no caching, no snapshots.
 *
 * @module core/graph/GraphView
 */

import type { IEdgeStore } from '../../contracts/interfaces.js';
import type { SessionId } from '../../contracts/ids.js';
import { CycleDetectedError } from '../../errors.js';
import type { Edge } from './Edge.js';

/**
 * Read-only traversal queries over an {@link IEdgeStore}.
 *
 * @example
 * ```typescript
 * const store = new EdgeStore();
 * // ... populate store ...
 * const view = new GraphView(store);
 * const order = view.topological('s1');
 * ```
 */
export class GraphView {
	private readonly _store: IEdgeStore;

	/**
	 * Create a new GraphView backed by the given edge store.
	 *
	 * @param store - The edge store to query (held by reference, read-only access)
	 *
	 * @example
	 * ```typescript
	 * const view = new GraphView(edgeStore);
	 * ```
	 */
	constructor(store: IEdgeStore) {
		this._store = store;
	}

	/**
	 * Return all thought ids in the session, ordered by BFS from roots.
	 *
	 * Roots are nodes with no incoming edges. Within a layer, neighbours
	 * are visited in `outgoing` order (which the underlying store keeps
	 * sorted by `createdAt` ascending).
	 *
	 * @param sessionId - Session to query
	 * @returns Thought ids in chronological BFS order
	 *
	 * @example
	 * ```typescript
	 * const ids = view.chronological('s1');
	 * ```
	 */
	chronological(sessionId: SessionId): readonly string[] {
		const edges = this._store.edgesForSession(sessionId);
		if (edges.length === 0) {
			return [];
		}
		const { nodes, hasIncoming } = this._collectNodes(edges);
		const roots = this._findRoots(nodes, hasIncoming, edges);
		return this._bfsFromRoots(sessionId, roots);
	}

	/**
	 * Return all thought ids reachable from `rootThoughtId` via `'branch'`
	 * edges, including the root itself.
	 *
	 * Non-branch edges are ignored. Cycles (if any) do not cause infinite
	 * loops because each node is visited at most once.
	 *
	 * @param sessionId - Session to query
	 * @param rootThoughtId - The starting thought id (typically the branch root)
	 * @returns Thought ids forming the branch (includes root)
	 *
	 * @example
	 * ```typescript
	 * const branchIds = view.branchThoughts('s1', 'thought-root');
	 * ```
	 */
	branchThoughts(sessionId: SessionId, rootThoughtId: string): readonly string[] {
		const visited = new Set<string>([rootThoughtId]);
		const order: string[] = [rootThoughtId];
		const queue: string[] = [rootThoughtId];
		while (queue.length > 0) {
			const current = queue.shift()!;
			const out = this._store.outgoing(sessionId, current);
			for (const edge of out) {
				if (edge.kind !== 'branch') continue;
				if (visited.has(edge.to)) continue;
				visited.add(edge.to);
				order.push(edge.to);
				queue.push(edge.to);
			}
		}
		return order;
	}

	/**
	 * Return a topological ordering of all thought ids in the session
	 * using Kahn's algorithm.
	 *
	 * @param sessionId - Session to query
	 * @returns Thought ids in topological order
	 * @throws {CycleDetectedError} If the graph contains a cycle
	 *
	 * @example
	 * ```typescript
	 * const order = view.topological('s1');
	 * ```
	 */
	topological(sessionId: SessionId): readonly string[] {
		const edges = this._store.edgesForSession(sessionId);
		if (edges.length === 0) {
			return [];
		}
		const inDegree = this._buildInDegree(edges);
		const queue: string[] = [];
		for (const [node, deg] of inDegree) {
			if (deg === 0) queue.push(node);
		}
		const order: string[] = [];
		while (queue.length > 0) {
			const node = queue.shift()!;
			order.push(node);
			for (const edge of this._store.outgoing(sessionId, node)) {
				const next = (inDegree.get(edge.to) ?? 0) - 1;
				inDegree.set(edge.to, next);
				if (next === 0) queue.push(edge.to);
			}
		}
		if (order.length !== inDegree.size) {
			throw new CycleDetectedError(
				`Cycle detected in session '${sessionId}': topological sort incomplete (${order.length}/${inDegree.size})`
			);
		}
		return order;
	}

	/**
	 * Return all ancestors of `thoughtId` via incoming-edge BFS.
	 *
	 * The starting node is NOT included. Cycles do not cause infinite loops.
	 *
	 * @param sessionId - Session to query
	 * @param thoughtId - The thought to traverse from
	 * @param maxDepth - Optional maximum traversal depth (1 = direct parents only)
	 * @returns Ancestor thought ids in BFS order
	 *
	 * @example
	 * ```typescript
	 * const parents = view.ancestors('s1', 'thought-id', 1);
	 * ```
	 */
	ancestors(sessionId: SessionId, thoughtId: string, maxDepth?: number): readonly string[] {
		return this._bfsClosure(sessionId, thoughtId, maxDepth, 'incoming');
	}

	/**
	 * Return all descendants of `thoughtId` via outgoing-edge BFS.
	 *
	 * The starting node is NOT included. Cycles do not cause infinite loops.
	 *
	 * @param sessionId - Session to query
	 * @param thoughtId - The thought to traverse from
	 * @param maxDepth - Optional maximum traversal depth (1 = direct children only)
	 * @returns Descendant thought ids in BFS order
	 *
	 * @example
	 * ```typescript
	 * const children = view.descendants('s1', 'thought-id');
	 * ```
	 */
	descendants(sessionId: SessionId, thoughtId: string, maxDepth?: number): readonly string[] {
		return this._bfsClosure(sessionId, thoughtId, maxDepth, 'outgoing');
	}

	/**
	 * Return all thought ids in the session that have no outgoing edges.
	 *
	 * @param sessionId - Session to query
	 * @returns Thought ids that are graph leaves
	 *
	 * @example
	 * ```typescript
	 * const tips = view.leaves('s1');
	 * ```
	 */
	leaves(sessionId: SessionId): readonly string[] {
		const edges = this._store.edgesForSession(sessionId);
		if (edges.length === 0) {
			return [];
		}
		const { nodes } = this._collectNodes(edges);
		const result: string[] = [];
		for (const node of nodes) {
			if (this._store.outgoing(sessionId, node).length === 0) {
				result.push(node);
			}
		}
		return result;
	}

	/**
	 * Collect every node id referenced by the edges and a set of nodes
	 * that have at least one incoming edge.
	 */
	private _collectNodes(edges: readonly Edge[]): {
		nodes: Set<string>;
		hasIncoming: Set<string>;
	} {
		const nodes = new Set<string>();
		const hasIncoming = new Set<string>();
		for (const edge of edges) {
			nodes.add(edge.from);
			nodes.add(edge.to);
			hasIncoming.add(edge.to);
		}
		return { nodes, hasIncoming };
	}

	/**
	 * Find roots (no incoming) ordered by the earliest outgoing edge
	 * `createdAt`. Nodes with no outgoing edges fall back to the order
	 * they appear among edges (already sorted by `createdAt`).
	 */
	private _findRoots(
		nodes: Set<string>,
		hasIncoming: Set<string>,
		edges: readonly Edge[]
	): string[] {
		const earliest = new Map<string, number>();
		for (const edge of edges) {
			if (!earliest.has(edge.from)) {
				earliest.set(edge.from, edge.createdAt);
			}
		}
		const roots: string[] = [];
		for (const node of nodes) {
			if (!hasIncoming.has(node)) roots.push(node);
		}
		roots.sort((a, b) => (earliest.get(a) ?? Infinity) - (earliest.get(b) ?? Infinity));
		return roots;
	}

	/**
	 * BFS from a list of root ids, visiting each node at most once.
	 */
	private _bfsFromRoots(sessionId: SessionId, roots: readonly string[]): readonly string[] {
		const visited = new Set<string>();
		const order: string[] = [];
		const queue: string[] = [];
		for (const root of roots) {
			if (visited.has(root)) continue;
			visited.add(root);
			order.push(root);
			queue.push(root);
		}
		while (queue.length > 0) {
			const node = queue.shift()!;
			for (const edge of this._store.outgoing(sessionId, node)) {
				if (visited.has(edge.to)) continue;
				visited.add(edge.to);
				order.push(edge.to);
				queue.push(edge.to);
			}
		}
		return order;
	}

	/**
	 * Build an in-degree map covering every node referenced by the edges.
	 */
	private _buildInDegree(edges: readonly Edge[]): Map<string, number> {
		const inDegree = new Map<string, number>();
		for (const edge of edges) {
			if (!inDegree.has(edge.from)) inDegree.set(edge.from, 0);
			inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
		}
		return inDegree;
	}

	/**
	 * Generic BFS closure in either direction. Excludes the start node
	 * from the result and respects an optional depth cap.
	 */
	private _bfsClosure(
		sessionId: SessionId,
		startId: string,
		maxDepth: number | undefined,
		direction: 'incoming' | 'outgoing'
	): readonly string[] {
		const cap = maxDepth ?? Number.POSITIVE_INFINITY;
		const visited = new Set<string>([startId]);
		const order: string[] = [];
		let frontier: string[] = [startId];
		let depth = 0;
		while (frontier.length > 0 && depth < cap) {
			const next: string[] = [];
			for (const node of frontier) {
				const edges =
					direction === 'outgoing'
						? this._store.outgoing(sessionId, node)
						: this._store.incoming(sessionId, node);
				for (const edge of edges) {
					const neighbour = direction === 'outgoing' ? edge.to : edge.from;
					if (visited.has(neighbour)) continue;
					visited.add(neighbour);
					order.push(neighbour);
					next.push(neighbour);
				}
			}
			frontier = next;
			depth++;
		}
		return order;
	}
}
