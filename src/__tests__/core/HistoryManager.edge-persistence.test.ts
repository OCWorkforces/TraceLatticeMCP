/**
 * Tests for edge persistence integration in HistoryManager.
 *
 * Covers:
 * - Flag OFF: edges never persisted
 * - Flag ON: edges flushed alongside thoughts on _flushBuffer()
 * - Flag ON: edges restored via loadFromPersistence()
 * - Flag ON: clear() purges EdgeStore as well
 * - Roundtrip: flush then load into a fresh HistoryManager
 */

import { describe, it, expect, vi } from 'vitest';
import { HistoryManager } from '../../core/HistoryManager.js';
import { EdgeStore } from '../../core/graph/EdgeStore.js';
import { MemoryPersistence } from '../../persistence/MemoryPersistence.js';
import { generateUlid } from '../../core/ids.js';
import { createTestThought } from '../helpers/factories.js';
import type { ThoughtData } from '../../core/thought.js';
import type { Edge } from '../../core/graph/Edge.js';

const GLOBAL = '__global__';

function makeThought(num: number, overrides?: Partial<ThoughtData>): ThoughtData {
	return createTestThought({
		id: generateUlid(),
		thought_number: num,
		total_thoughts: 10,
		thought: `t${num}`,
		...overrides,
	});
}

function setup(opts?: {
	dagEdges?: boolean;
	persistence?: MemoryPersistence;
	edgeStore?: EdgeStore;
}): {
	manager: HistoryManager;
	edgeStore: EdgeStore;
	persistence: MemoryPersistence;
} {
	const persistence = opts?.persistence ?? new MemoryPersistence();
	const edgeStore = opts?.edgeStore ?? new EdgeStore();
	const manager = new HistoryManager({
		edgeStore,
		dagEdges: opts?.dagEdges ?? true,
		persistence,
		persistenceFlushInterval: 60_000, // disable timer-driven flushes
		persistenceBufferSize: 1000,
	});
	return { manager, edgeStore, persistence };
}

describe('HistoryManager edge persistence', () => {
	it('does not call saveEdges when dagEdges flag is OFF', async () => {
		const persistence = new MemoryPersistence();
		const saveEdgesSpy = vi.spyOn(persistence, 'saveEdges');
		const { manager } = setup({ dagEdges: false, persistence });

		manager.addThought(makeThought(1));
		manager.addThought(makeThought(2));
		manager.addThought(makeThought(3));

		await manager._flushBuffer();

		expect(saveEdgesSpy).not.toHaveBeenCalled();
		await manager.shutdown();
	});

	it('flushes edges to persistence when flag is ON', async () => {
		const persistence = new MemoryPersistence();
		const saveEdgesSpy = vi.spyOn(persistence, 'saveEdges');
		const { manager } = setup({ persistence });

		manager.addThought(makeThought(1));
		manager.addThought(makeThought(2));
		manager.addThought(makeThought(3));

		await manager._flushBuffer();

		expect(saveEdgesSpy).toHaveBeenCalledTimes(1);
		const [sessionId, edges] = saveEdgesSpy.mock.calls[0]!;
		expect(sessionId).toBe(GLOBAL);
		expect(edges.length).toBe(2);
		expect(edges.every((e: Edge) => e.kind === 'sequence')).toBe(true);

		const persisted = await persistence.loadEdges(GLOBAL);
		expect(persisted).toHaveLength(2);
		await manager.shutdown();
	});

	it('loads edges into EdgeStore on loadFromPersistence', async () => {
		const persistence = new MemoryPersistence();
		const seedEdges: Edge[] = [
			{
				id: generateUlid(),
				from: 'thought-a',
				to: 'thought-b',
				kind: 'sequence',
				sessionId: GLOBAL,
				createdAt: 100,
			},
			{
				id: generateUlid(),
				from: 'thought-b',
				to: 'thought-c',
				kind: 'derives_from',
				sessionId: GLOBAL,
				createdAt: 200,
			},
		];
		await persistence.saveEdges(GLOBAL, seedEdges);

		const edgeStore = new EdgeStore();
		const manager = new HistoryManager({
			edgeStore,
			dagEdges: true,
			persistence,
			persistenceFlushInterval: 60_000,
		});

		await manager.loadFromPersistence();

		expect(edgeStore.size(GLOBAL)).toBe(2);
		const loaded = edgeStore.edgesForSession(GLOBAL);
		expect(loaded.map((e) => e.kind).sort()).toEqual(['derives_from', 'sequence']);
		await manager.shutdown();
	});

	it('clear() purges edges from the EdgeStore', async () => {
		const { manager, edgeStore } = setup();

		manager.addThought(makeThought(1));
		manager.addThought(makeThought(2));
		manager.addThought(makeThought(3));

		expect(edgeStore.size(GLOBAL)).toBeGreaterThan(0);

		manager.clear();

		expect(edgeStore.size(GLOBAL)).toBe(0);
		await manager.shutdown();
	});

	it('roundtrips: flush in one manager then load into a fresh manager', async () => {
		const persistence = new MemoryPersistence();
		const { manager } = setup({ persistence });

		manager.addThought(makeThought(1));
		manager.addThought(makeThought(2));
		manager.addThought(makeThought(3));
		manager.addThought(makeThought(4));

		await manager._flushBuffer();
		await manager.shutdown();

		// Spin up a fresh manager with the same persistence backend
		const freshEdgeStore = new EdgeStore();
		const fresh = new HistoryManager({
			edgeStore: freshEdgeStore,
			dagEdges: true,
			persistence,
			persistenceFlushInterval: 60_000,
		});

		await fresh.loadFromPersistence();

		expect(freshEdgeStore.size(GLOBAL)).toBe(3);
		const loaded = freshEdgeStore.edgesForSession(GLOBAL);
		expect(loaded.every((e) => e.kind === 'sequence')).toBe(true);
		await fresh.shutdown();
	});
});
