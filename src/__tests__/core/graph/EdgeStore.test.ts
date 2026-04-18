/**
 * Tests for the EdgeStore implementation.
 */

import { describe, it, expect } from 'vitest';
import { EdgeStore } from '../../../core/graph/EdgeStore.js';
import { generateUlid } from '../../../core/ids.js';
import { InvalidEdgeError } from '../../../errors.js';
import type { Edge } from '../../../core/graph/Edge.js';

function createTestEdge(
	overrides: Partial<Edge> & { from: string; to: string; sessionId: string }
): Edge {
	return {
		id: generateUlid(),
		kind: 'sequence',
		createdAt: Date.now(),
		...overrides,
	};
}

describe('EdgeStore', () => {
	describe('addEdge / getEdge', () => {
		it('addEdge stores edge retrievable via getEdge', () => {
			const store = new EdgeStore();
			const edge = createTestEdge({ from: 'a', to: 'b', sessionId: 's1' });
			store.addEdge(edge);
			expect(store.getEdge(edge.id)).toEqual(edge);
		});

		it('getEdge returns undefined for unknown id', () => {
			const store = new EdgeStore();
			expect(store.getEdge('does-not-exist')).toBeUndefined();
		});
	});

	describe('outgoing / incoming indexes', () => {
		it('addEdge stores edge in outgoing index', () => {
			const store = new EdgeStore();
			const edge = createTestEdge({ from: 'a', to: 'b', sessionId: 's1' });
			store.addEdge(edge);
			const outgoing = store.outgoing('s1', 'a');
			expect(outgoing).toHaveLength(1);
			expect(outgoing[0]).toEqual(edge);
		});

		it('addEdge stores edge in incoming index', () => {
			const store = new EdgeStore();
			const edge = createTestEdge({ from: 'a', to: 'b', sessionId: 's1' });
			store.addEdge(edge);
			const incoming = store.incoming('s1', 'b');
			expect(incoming).toHaveLength(1);
			expect(incoming[0]).toEqual(edge);
		});

		it('outgoing returns edges sorted by createdAt ascending', () => {
			const store = new EdgeStore();
			const e1 = createTestEdge({ from: 'a', to: 'b', sessionId: 's1', createdAt: 300 });
			const e2 = createTestEdge({ from: 'a', to: 'c', sessionId: 's1', createdAt: 100 });
			const e3 = createTestEdge({ from: 'a', to: 'd', sessionId: 's1', createdAt: 200 });
			store.addEdge(e1);
			store.addEdge(e2);
			store.addEdge(e3);
			const outgoing = store.outgoing('s1', 'a');
			expect(outgoing.map((e) => e.createdAt)).toEqual([100, 200, 300]);
		});

		it('incoming returns edges sorted by createdAt ascending', () => {
			const store = new EdgeStore();
			const e1 = createTestEdge({ from: 'a', to: 'z', sessionId: 's1', createdAt: 300 });
			const e2 = createTestEdge({ from: 'b', to: 'z', sessionId: 's1', createdAt: 100 });
			const e3 = createTestEdge({ from: 'c', to: 'z', sessionId: 's1', createdAt: 200 });
			store.addEdge(e1);
			store.addEdge(e2);
			store.addEdge(e3);
			const incoming = store.incoming('s1', 'z');
			expect(incoming.map((e) => e.createdAt)).toEqual([100, 200, 300]);
		});

		it('outgoing returns empty array for unknown session', () => {
			const store = new EdgeStore();
			expect(store.outgoing('nope', 'a')).toEqual([]);
		});

		it('incoming returns empty array for unknown session', () => {
			const store = new EdgeStore();
			expect(store.incoming('nope', 'a')).toEqual([]);
		});

		it('outgoing returns empty array for unknown source thought', () => {
			const store = new EdgeStore();
			store.addEdge(createTestEdge({ from: 'a', to: 'b', sessionId: 's1' }));
			expect(store.outgoing('s1', 'unknown')).toEqual([]);
		});
	});

	describe('validation', () => {
		it('addEdge rejects self-edge with InvalidEdgeError', () => {
			const store = new EdgeStore();
			const edge = createTestEdge({ from: 'a', to: 'a', sessionId: 's1' });
			expect(() => store.addEdge(edge)).toThrow(InvalidEdgeError);
			expect(() => store.addEdge(edge)).toThrow(/Self-edge not allowed/);
		});

		it('InvalidEdgeError has code INVALID_EDGE', () => {
			const store = new EdgeStore();
			try {
				store.addEdge(createTestEdge({ from: 'x', to: 'x', sessionId: 's1' }));
				expect.fail('expected throw');
			} catch (err) {
				expect(err).toBeInstanceOf(InvalidEdgeError);
				expect((err as InvalidEdgeError).code).toBe('INVALID_EDGE');
			}
		});
	});

	describe('deduplication', () => {
		it('addEdge dedupes identical (from, to, kind, sessionId) - no error, no duplicate', () => {
			const store = new EdgeStore();
			const first = createTestEdge({ from: 'a', to: 'b', sessionId: 's1', kind: 'sequence' });
			const second = createTestEdge({ from: 'a', to: 'b', sessionId: 's1', kind: 'sequence' });
			store.addEdge(first);
			store.addEdge(second);
			expect(store.size('s1')).toBe(1);
			// First wins; second's id is not present.
			expect(store.getEdge(first.id)).toEqual(first);
			expect(store.getEdge(second.id)).toBeUndefined();
			expect(store.outgoing('s1', 'a')).toHaveLength(1);
			expect(store.incoming('s1', 'b')).toHaveLength(1);
		});

		it('addEdge allows same (from, to) with different kind', () => {
			const store = new EdgeStore();
			const e1 = createTestEdge({ from: 'a', to: 'b', sessionId: 's1', kind: 'sequence' });
			const e2 = createTestEdge({ from: 'a', to: 'b', sessionId: 's1', kind: 'verifies' });
			store.addEdge(e1);
			store.addEdge(e2);
			expect(store.size('s1')).toBe(2);
			expect(store.outgoing('s1', 'a')).toHaveLength(2);
		});

		it('addEdge allows same (from, to, kind) in different sessions', () => {
			const store = new EdgeStore();
			const e1 = createTestEdge({ from: 'a', to: 'b', sessionId: 's1', kind: 'sequence' });
			const e2 = createTestEdge({ from: 'a', to: 'b', sessionId: 's2', kind: 'sequence' });
			store.addEdge(e1);
			store.addEdge(e2);
			expect(store.size('s1')).toBe(1);
			expect(store.size('s2')).toBe(1);
			expect(store.size()).toBe(2);
		});
	});

	describe('clearSession', () => {
		it('clearSession removes only that session\'s edges', () => {
			const store = new EdgeStore();
			store.addEdge(createTestEdge({ from: 'a', to: 'b', sessionId: 's1' }));
			store.addEdge(createTestEdge({ from: 'c', to: 'd', sessionId: 's1' }));
			store.clearSession('s1');
			expect(store.size('s1')).toBe(0);
			expect(store.outgoing('s1', 'a')).toEqual([]);
			expect(store.incoming('s1', 'b')).toEqual([]);
			expect(store.edgesForSession('s1')).toEqual([]);
		});

		it('clearSession does not affect other sessions', () => {
			const store = new EdgeStore();
			const keep = createTestEdge({ from: 'x', to: 'y', sessionId: 's2' });
			store.addEdge(createTestEdge({ from: 'a', to: 'b', sessionId: 's1' }));
			store.addEdge(keep);
			store.clearSession('s1');
			expect(store.size('s1')).toBe(0);
			expect(store.size('s2')).toBe(1);
			expect(store.getEdge(keep.id)).toEqual(keep);
		});

		it('clearSession on unknown session is a no-op', () => {
			const store = new EdgeStore();
			store.addEdge(createTestEdge({ from: 'a', to: 'b', sessionId: 's1' }));
			expect(() => store.clearSession('unknown')).not.toThrow();
			expect(store.size('s1')).toBe(1);
		});
	});

	describe('size', () => {
		it('size() with sessionId returns per-session count', () => {
			const store = new EdgeStore();
			store.addEdge(createTestEdge({ from: 'a', to: 'b', sessionId: 's1' }));
			store.addEdge(createTestEdge({ from: 'c', to: 'd', sessionId: 's1' }));
			store.addEdge(createTestEdge({ from: 'e', to: 'f', sessionId: 's2' }));
			expect(store.size('s1')).toBe(2);
			expect(store.size('s2')).toBe(1);
			expect(store.size('unknown')).toBe(0);
		});

		it('size() without sessionId returns total count', () => {
			const store = new EdgeStore();
			store.addEdge(createTestEdge({ from: 'a', to: 'b', sessionId: 's1' }));
			store.addEdge(createTestEdge({ from: 'c', to: 'd', sessionId: 's1' }));
			store.addEdge(createTestEdge({ from: 'e', to: 'f', sessionId: 's2' }));
			expect(store.size()).toBe(3);
		});

		it('size() returns 0 on empty store', () => {
			const store = new EdgeStore();
			expect(store.size()).toBe(0);
			expect(store.size('any')).toBe(0);
		});
	});

	describe('edgesForSession', () => {
		it('edgesForSession returns all edges sorted by createdAt', () => {
			const store = new EdgeStore();
			const e1 = createTestEdge({ from: 'a', to: 'b', sessionId: 's1', createdAt: 300 });
			const e2 = createTestEdge({ from: 'c', to: 'd', sessionId: 's1', createdAt: 100 });
			const e3 = createTestEdge({ from: 'e', to: 'f', sessionId: 's1', createdAt: 200 });
			store.addEdge(e1);
			store.addEdge(e2);
			store.addEdge(e3);
			const edges = store.edgesForSession('s1');
			expect(edges.map((e) => e.createdAt)).toEqual([100, 200, 300]);
		});

		it('edgesForSession returns empty array for unknown session', () => {
			const store = new EdgeStore();
			expect(store.edgesForSession('nope')).toEqual([]);
		});
	});
});
