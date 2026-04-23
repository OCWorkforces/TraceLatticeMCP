import { describe, it, expect, beforeEach } from 'vitest';
import { createTestThought } from './helpers/factories.js';
import { MemoryPersistence } from '../persistence/MemoryPersistence.js';

describe('MemoryPersistence', () => {
	let backend: MemoryPersistence;

	beforeEach(() => {
		backend = new MemoryPersistence();
	});

	describe('constructor', () => {
		it('should create with default options (unlimited)', () => {
			const mp = new MemoryPersistence();
			expect(mp.getHistorySize()).toBe(0);
			expect(mp.getBranchCount()).toBe(0);
		});

		it('should create with empty options object', () => {
			const mp = new MemoryPersistence({});
			expect(mp.getHistorySize()).toBe(0);
		});

		it('should accept a positive maxSize', async () => {
			const mp = new MemoryPersistence({ maxSize: 5 });
			// Save 3 — all should be retained
			for (let i = 0; i < 3; i++) {
				await mp.saveThought(createTestThought({ thought_number: i + 1 }));
			}
			expect(mp.getHistorySize()).toBe(3);
		});

		it('should treat maxSize of 0 as unlimited', async () => {
			const mp = new MemoryPersistence({ maxSize: 0 });
			for (let i = 0; i < 20; i++) {
				await mp.saveThought(createTestThought({ thought_number: i + 1 }));
			}
			expect(mp.getHistorySize()).toBe(20);
		});

		it('should treat undefined maxSize as unlimited', async () => {
			const mp = new MemoryPersistence({ maxSize: undefined });
			for (let i = 0; i < 15; i++) {
				await mp.saveThought(createTestThought({ thought_number: i + 1 }));
			}
			expect(mp.getHistorySize()).toBe(15);
		});

		it('should treat negative maxSize as unlimited', async () => {
			const mp = new MemoryPersistence({ maxSize: -5 });
			for (let i = 0; i < 10; i++) {
				await mp.saveThought(createTestThought({ thought_number: i + 1 }));
			}
			expect(mp.getHistorySize()).toBe(10);
		});
	});

	describe('saveThought', () => {
		it('should save a single thought', async () => {
			const thought = createTestThought({ thought: 'alpha' });
			await backend.saveThought(thought);

			const history = await backend.loadHistory();
			expect(history).toHaveLength(1);
			expect(history[0]).toEqual(thought);
		});

		it('should save multiple thoughts preserving order', async () => {
			await backend.saveThought(createTestThought({ thought_number: 1, thought: 'A' }));
			await backend.saveThought(createTestThought({ thought_number: 2, thought: 'B' }));
			await backend.saveThought(createTestThought({ thought_number: 3, thought: 'C' }));

			const history = await backend.loadHistory();
			expect(history).toHaveLength(3);
			expect(history.map((t) => t.thought)).toEqual(['A', 'B', 'C']);
		});

		it('should trim oldest thoughts when maxSize exceeded', async () => {
			const mp = new MemoryPersistence({ maxSize: 3 });

			for (let i = 1; i <= 5; i++) {
				await mp.saveThought(createTestThought({ thought_number: i, thought: `T${i}` }));
			}

			const history = await mp.loadHistory();
			expect(history).toHaveLength(3);
			// Should keep the last 3 (T3, T4, T5)
			expect(history[0]!.thought).toBe('T3');
			expect(history[1]!.thought).toBe('T4');
			expect(history[2]!.thought).toBe('T5');
		});

		it('should trim correctly with maxSize of 1', async () => {
			const mp = new MemoryPersistence({ maxSize: 1 });

			await mp.saveThought(createTestThought({ thought_number: 1, thought: 'first' }));
			await mp.saveThought(createTestThought({ thought_number: 2, thought: 'second' }));

			const history = await mp.loadHistory();
			expect(history).toHaveLength(1);
			expect(history[0]!.thought).toBe('second');
		});

		it('should not trim when exactly at maxSize', async () => {
			const mp = new MemoryPersistence({ maxSize: 3 });

			for (let i = 1; i <= 3; i++) {
				await mp.saveThought(createTestThought({ thought_number: i, thought: `T${i}` }));
			}

			const history = await mp.loadHistory();
			expect(history).toHaveLength(3);
			expect(history[0]!.thought).toBe('T1');
		});

		it('should not trim when no maxSize set', async () => {
			for (let i = 0; i < 100; i++) {
				await backend.saveThought(createTestThought({ thought_number: i + 1 }));
			}
			expect(backend.getHistorySize()).toBe(100);
		});
	});

	describe('loadHistory', () => {
		it('should return empty array when no thoughts saved', async () => {
			const history = await backend.loadHistory();
			expect(history).toEqual([]);
		});

		it('should return populated history', async () => {
			await backend.saveThought(createTestThought({ thought: 'one' }));
			await backend.saveThought(createTestThought({ thought: 'two' }));

			const history = await backend.loadHistory();
			expect(history).toHaveLength(2);
			expect(history[0]!.thought).toBe('one');
			expect(history[1]!.thought).toBe('two');
		});

		it('should return a copy (not internal reference)', async () => {
			await backend.saveThought(createTestThought({ thought: 'original' }));

			const history1 = await backend.loadHistory();
			const history2 = await backend.loadHistory();

			// Mutate first copy
			history1.push(createTestThought({ thought: 'injected' }));

			// Second copy unaffected
			expect(history2).toHaveLength(1);
			// Internal state unaffected
			expect(await backend.loadHistory()).toHaveLength(1);
		});
	});

	describe('saveBranch', () => {
		it('should save a branch', async () => {
			const thoughts = [
				createTestThought({ thought: 'branch-t1', thought_number: 1 }),
				createTestThought({ thought: 'branch-t2', thought_number: 2 }),
			];
			await backend.saveBranch('b1', thoughts);

			const loaded = await backend.loadBranch('b1');
			expect(loaded).toEqual(thoughts);
		});

		it('should overwrite an existing branch', async () => {
			const original = [createTestThought({ thought: 'old' })];
			const updated = [createTestThought({ thought: 'new' })];

			await backend.saveBranch('b1', original);
			await backend.saveBranch('b1', updated);

			const loaded = await backend.loadBranch('b1');
			expect(loaded).toEqual(updated);
			expect(backend.getBranchCount()).toBe(1);
		});

		it('should store a copy of thoughts (not reference)', async () => {
			const thoughts = [createTestThought({ thought: 'snap' })];
			await backend.saveBranch('b1', thoughts);

			// Mutate original array
			thoughts.push(createTestThought({ thought: 'extra' }));

			const loaded = await backend.loadBranch('b1');
			expect(loaded).toHaveLength(1);
		});
	});

	describe('loadBranch', () => {
		it('should load an existing branch', async () => {
			await backend.saveBranch('b1', [createTestThought({ thought: 'x' })]);
			const loaded = await backend.loadBranch('b1');
			expect(loaded).toBeDefined();
			expect(loaded).toHaveLength(1);
			expect(loaded![0]!.thought).toBe('x');
		});

		it('should return undefined for non-existent branch', async () => {
			const loaded = await backend.loadBranch('no-such-branch');
			expect(loaded).toBeUndefined();
		});

		it("should return a copy (mutations don't affect internal state)", async () => {
			await backend.saveBranch('b1', [createTestThought({ thought: 'data' })]);

			const loaded1 = await backend.loadBranch('b1');
			const loaded2 = await backend.loadBranch('b1');

			loaded1!.push(createTestThought({ thought: 'injected' }));

			expect(loaded2).toHaveLength(1);
			expect(await backend.loadBranch('b1')).toHaveLength(1);
		});
	});

	describe('listBranches', () => {
		it('should return empty array when no branches', async () => {
			const branches = await backend.listBranches();
			expect(branches).toEqual([]);
		});

		it('should return all branch IDs', async () => {
			await backend.saveBranch('alpha', [createTestThought()]);
			await backend.saveBranch('beta', [createTestThought()]);
			await backend.saveBranch('gamma', [createTestThought()]);

			const branches = await backend.listBranches();
			expect(branches).toHaveLength(3);
			expect(branches).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']));
		});

		it('should delegate to getBranchIds', async () => {
			await backend.saveBranch('x', [createTestThought()]);

			const listed = await backend.listBranches();
			const ids = backend.getBranchIds();

			expect(listed).toEqual(ids);
		});
	});

	describe('healthy', () => {
		it('should always return true', async () => {
			expect(await backend.healthy()).toBe(true);
		});

		it('should return true even after data operations', async () => {
			await backend.saveThought(createTestThought());
			await backend.saveBranch('b', [createTestThought()]);
			await backend.clear();
			expect(await backend.healthy()).toBe(true);
		});
	});

	describe('clear', () => {
		it('should clear all history and branches', async () => {
			await backend.saveThought(createTestThought());
			await backend.saveThought(createTestThought({ thought_number: 2 }));
			await backend.saveBranch('b1', [createTestThought()]);
			await backend.saveBranch('b2', [createTestThought()]);

			await backend.clear();

			expect(await backend.loadHistory()).toEqual([]);
			expect(await backend.loadBranch('b1')).toBeUndefined();
			expect(await backend.loadBranch('b2')).toBeUndefined();
			expect(backend.getHistorySize()).toBe(0);
			expect(backend.getBranchCount()).toBe(0);
			expect(backend.getBranchIds()).toEqual([]);
		});

		it('should be safe to call on empty backend', async () => {
			await backend.clear();
			expect(await backend.loadHistory()).toEqual([]);
		});

		it('should be safe to call multiple times', async () => {
			await backend.saveThought(createTestThought());
			await backend.clear();
			await backend.clear();
			await backend.clear();
			expect(backend.getHistorySize()).toBe(0);
		});

		it('should allow new data after clear', async () => {
			await backend.saveThought(createTestThought({ thought: 'before' }));
			await backend.clear();
			await backend.saveThought(createTestThought({ thought: 'after' }));

			const history = await backend.loadHistory();
			expect(history).toHaveLength(1);
			expect(history[0]!.thought).toBe('after');
		});
	});

	describe('close', () => {
		it('should be a no-op and resolve without error', async () => {
			await expect(backend.close()).resolves.toBeUndefined();
		});

		it('should not affect data', async () => {
			await backend.saveThought(createTestThought({ thought: 'persisted' }));
			await backend.close();

			const history = await backend.loadHistory();
			expect(history).toHaveLength(1);
			expect(history[0]!.thought).toBe('persisted');
		});
	});

	describe('getHistorySize', () => {
		it('should return 0 for empty backend', () => {
			expect(backend.getHistorySize()).toBe(0);
		});

		it('should track count after saves', async () => {
			await backend.saveThought(createTestThought());
			expect(backend.getHistorySize()).toBe(1);

			await backend.saveThought(createTestThought({ thought_number: 2 }));
			expect(backend.getHistorySize()).toBe(2);
		});

		it('should reflect trimming when maxSize set', async () => {
			const mp = new MemoryPersistence({ maxSize: 2 });

			await mp.saveThought(createTestThought({ thought_number: 1 }));
			await mp.saveThought(createTestThought({ thought_number: 2 }));
			expect(mp.getHistorySize()).toBe(2);

			await mp.saveThought(createTestThought({ thought_number: 3 }));
			expect(mp.getHistorySize()).toBe(2);
		});

		it('should return 0 after clear', async () => {
			await backend.saveThought(createTestThought());
			await backend.clear();
			expect(backend.getHistorySize()).toBe(0);
		});
	});

	describe('getBranchCount', () => {
		it('should return 0 when no branches', () => {
			expect(backend.getBranchCount()).toBe(0);
		});

		it('should track branch count', async () => {
			await backend.saveBranch('b1', [createTestThought()]);
			expect(backend.getBranchCount()).toBe(1);

			await backend.saveBranch('b2', [createTestThought()]);
			expect(backend.getBranchCount()).toBe(2);
		});

		it('should not increment on overwrite', async () => {
			await backend.saveBranch('b1', [createTestThought()]);
			await backend.saveBranch('b1', [createTestThought({ thought: 'updated' })]);
			expect(backend.getBranchCount()).toBe(1);
		});

		it('should return 0 after clear', async () => {
			await backend.saveBranch('b1', [createTestThought()]);
			await backend.clear();
			expect(backend.getBranchCount()).toBe(0);
		});
	});

	describe('getBranchIds', () => {
		it('should return empty array when no branches', () => {
			expect(backend.getBranchIds()).toEqual([]);
		});

		it('should return all branch IDs', async () => {
			await backend.saveBranch('first', [createTestThought()]);
			await backend.saveBranch('second', [createTestThought()]);

			const ids = backend.getBranchIds();
			expect(ids).toHaveLength(2);
			expect(ids).toEqual(expect.arrayContaining(['first', 'second']));
		});

		it('should not include duplicates on overwrite', async () => {
			await backend.saveBranch('same', [createTestThought()]);
			await backend.saveBranch('same', [createTestThought({ thought: 'v2' })]);

			expect(backend.getBranchIds()).toEqual(['same']);
		});

		it('should return empty after clear', async () => {
			await backend.saveBranch('b1', [createTestThought()]);
			await backend.clear();
			expect(backend.getBranchIds()).toEqual([]);
		});
	});

	describe('isolation', () => {
		it('should isolate history from branches', async () => {
			await backend.saveThought(createTestThought({ thought: 'history-only' }));
			await backend.saveBranch('b1', [createTestThought({ thought: 'branch-only' })]);

			const history = await backend.loadHistory();
			const branch = await backend.loadBranch('b1');

			expect(history).toHaveLength(1);
			expect(history[0]!.thought).toBe('history-only');
			expect(branch).toHaveLength(1);
			expect(branch![0]!.thought).toBe('branch-only');
		});

		it('should handle concurrent saves', async () => {
			const thoughts = Array.from({ length: 50 }, (_, i) =>
				createTestThought({ thought_number: i + 1, thought: `T${i + 1}` })
			);

			await Promise.all(thoughts.map((t) => backend.saveThought(t)));

			expect(backend.getHistorySize()).toBe(50);
		});
	});
});
