import { describe, it, expect, afterEach, vi } from 'vitest';
import { HistoryManager } from '../core/HistoryManager.js';
import type { PersistenceBackend } from '../persistence/PersistenceBackend.js';
import { createTestThought } from './helpers/index.js';
import { useFakeTimers, useRealTimers } from './helpers/index.js';
import type { ThoughtData } from '../core/thought.js';

class MockPersistence implements PersistenceBackend {
	private _history: ThoughtData[] = [];
	private _branches: Record<string, ThoughtData[]> = {};
	saveThoughtFailCount = 0;
	healthyResult = true;
	clearFail = false;
	saveBranchFailCount = 0;

	async saveThought(thought: ThoughtData): Promise<void> {
		if (this.saveThoughtFailCount > 0) {
			this.saveThoughtFailCount--;
			throw new Error('Persistence save failed');
		}
		this._history.push(thought);
	}

	async loadHistory(): Promise<ThoughtData[]> {
		return [...this._history];
	}

	async saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void> {
		if (this.saveBranchFailCount > 0) {
			this.saveBranchFailCount--;
			throw new Error('Branch save failed');
		}
		this._branches[branchId] = thoughts;
	}

	async loadBranch(branchId: string): Promise<ThoughtData[] | undefined> {
		return this._branches[branchId] ? [...this._branches[branchId]] : undefined;
	}

	async listBranches(): Promise<string[]> {
		return Object.keys(this._branches);
	}

	async clear(): Promise<void> {
		if (this.clearFail) {
			throw new Error('Clear failed');
		}
		this._history = [];
		this._branches = {};
	}

	async healthy(): Promise<boolean> {
		return this.healthyResult;
	}

	async close(): Promise<void> {}
}

describe('HistoryManager', () => {
	afterEach(() => {
		useRealTimers();
	});

	describe('Basic operations', () => {
		it('should add thoughts and track length', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1 }));
			manager.addThought(createTestThought({ thought_number: 2 }));

			expect(manager.getHistoryLength()).toBe(2);
			expect(manager.getHistory()).toHaveLength(2);
			expect(manager.getHistory()[1]!.thought_number).toBe(2);
		});

		it('should clear all state', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1 }));
			manager.clear();

			expect(manager.getHistoryLength()).toBe(0);
			expect(manager.getBranches()).toEqual({});
			expect(manager.getBranchIds()).toHaveLength(0);
		});

		it('should return empty branches record initially', () => {
			const manager = new HistoryManager();
			expect(manager.getBranches()).toEqual({});
			expect(manager.getBranchIds()).toEqual([]);
		});
	});

	describe('History trimming', () => {
		it('should trim history when maxHistorySize is exceeded', () => {
			const manager = new HistoryManager({ maxHistorySize: 3 });
			for (let i = 1; i <= 4; i++) {
				manager.addThought(createTestThought({ thought_number: i }));
			}

			expect(manager.getHistoryLength()).toBe(3);
			expect(manager.getHistory()[0]!.thought_number).toBe(2);
			expect(manager.getHistory()[2]!.thought_number).toBe(4);
		});

		it('should not trim when exactly at maxHistorySize', () => {
			const manager = new HistoryManager({ maxHistorySize: 3 });
			for (let i = 1; i <= 3; i++) {
				manager.addThought(createTestThought({ thought_number: i }));
			}

			expect(manager.getHistoryLength()).toBe(3);
			expect(manager.getHistory()[0]!.thought_number).toBe(1);
		});
	});

	describe('Branch management', () => {
		it('should create branch when branch_from_thought and branch_id are set', () => {
			const manager = new HistoryManager();
			manager.addThought(
				createTestThought({
					thought_number: 1,
					branch_from_thought: 1,
					branch_id: 'alt-1',
				})
			);

			expect(manager.getBranchIds()).toEqual(['alt-1']);
			expect(manager.getBranch('alt-1')).toHaveLength(1);
		});

		it('should add multiple thoughts to the same branch', () => {
			const manager = new HistoryManager();
			for (let i = 1; i <= 3; i++) {
				manager.addThought(
					createTestThought({
						thought_number: i,
						branch_from_thought: 1,
						branch_id: 'alt-1',
					})
				);
			}

			expect(manager.getBranch('alt-1')).toHaveLength(3);
		});

		it('should trim branch when maxBranchSize is exceeded', () => {
			const manager = new HistoryManager({ maxBranchSize: 2 });
			for (let i = 1; i <= 4; i++) {
				manager.addThought(
					createTestThought({
						thought_number: i,
						branch_from_thought: 1,
						branch_id: 'alt-1',
					})
				);
			}

			expect(manager.getBranch('alt-1')).toHaveLength(3);
			expect(manager.getBranch('alt-1')![0]!.thought_number).toBe(2);
		});

		it('should remove oldest branches when maxBranches is exceeded', () => {
			const manager = new HistoryManager({ maxBranches: 2 });
			manager.addThought(
				createTestThought({ thought_number: 1, branch_from_thought: 1, branch_id: 'branch-a' })
			);
			manager.addThought(
				createTestThought({ thought_number: 2, branch_from_thought: 1, branch_id: 'branch-b' })
			);
			manager.addThought(
				createTestThought({ thought_number: 3, branch_from_thought: 1, branch_id: 'branch-c' })
			);

			expect(manager.getBranchIds()).toHaveLength(2);
			expect(manager.getBranchIds()).not.toContain('branch-a');
			expect(manager.getBranchIds()).toContain('branch-c');
		});

		it('should return undefined for non-existent branch', () => {
			const manager = new HistoryManager();
			expect(manager.getBranch('non-existent')).toBeUndefined();
		});
	});

	describe('available_mcp_tools / available_skills caching', () => {
		it('should cache available_mcp_tools from added thoughts', () => {
			const manager = new HistoryManager();
			expect(manager.getAvailableMcpTools()).toBeUndefined();

			manager.addThought(createTestThought({ available_mcp_tools: ['Read', 'Grep'] }));
			expect(manager.getAvailableMcpTools()).toEqual(['Read', 'Grep']);
		});

		it('should update cached tools when new thought provides them', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ available_mcp_tools: ['Read'] }));
			manager.addThought(createTestThought({ available_mcp_tools: ['Read', 'Write', 'Grep'] }));

			expect(manager.getAvailableMcpTools()).toEqual(['Read', 'Write', 'Grep']);
		});

		it('should cache available_skills from added thoughts', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ available_skills: ['commit'] }));
			expect(manager.getAvailableSkills()).toEqual(['commit']);
		});

		it('should clear cached tools and skills on clear()', () => {
			const manager = new HistoryManager();
			manager.addThought(
				createTestThought({
					available_mcp_tools: ['Read'],
					available_skills: ['commit'],
				})
			);
			manager.clear();

			expect(manager.getAvailableMcpTools()).toBeUndefined();
			expect(manager.getAvailableSkills()).toBeUndefined();
		});
	});

	describe('Flush buffer pipeline', () => {
		it('should buffer thoughts and flush to persistence', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			const manager = new HistoryManager({
				persistence,
				persistenceFlushInterval: 1000,
				persistenceBufferSize: 100,
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			expect(await persistence.loadHistory()).toHaveLength(0);

			await vi.advanceTimersByTimeAsync(1000);
			await vi.waitFor(() => expect(manager.getWriteBufferLength()).toBe(0));
		});

		it('should trigger immediate flush when buffer reaches capacity', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 2,
				persistenceFlushInterval: 60000,
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			expect(manager.getWriteBufferLength()).toBe(1);

			manager.addThought(createTestThought({ thought_number: 2 }));
			await vi.waitFor(() => expect(manager.getWriteBufferLength()).toBe(0));
			expect(await persistence.loadHistory()).toHaveLength(2);
		});

		it('should skip flush when buffer is empty', async () => {
			const persistence = new MockPersistence();
			const manager = new HistoryManager({ persistence });

			await manager._flushBuffer();
			expect(await persistence.loadHistory()).toHaveLength(0);
		});

		it('should guard against concurrent flushes', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 100,
				persistenceFlushInterval: 60000,
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			const flush1 = manager._flushBuffer();
			const flush2 = manager._flushBuffer();

			await Promise.all([flush1, flush2]);
			expect(await persistence.loadHistory()).toHaveLength(1);
		});
	});

	describe('Flush retry with backoff', () => {
		it('should retry on persistence failure', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			persistence.saveThoughtFailCount = 1;
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 1,
				persistenceFlushInterval: 60000,
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			await vi.advanceTimersByTimeAsync(200);
			await vi.waitFor(() => expect(manager.getWriteBufferLength()).toBe(0));
			expect(await persistence.loadHistory()).toHaveLength(1);
		});

		it('should re-queue failed items after exhausting retries', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			persistence.saveThoughtFailCount = 999;
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 1,
				persistenceFlushInterval: 60000,
				persistenceMaxRetries: 1,
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			await vi.advanceTimersByTimeAsync(0);
			await vi.waitFor(() => expect(manager.getWriteBufferLength()).toBe(1));
			expect(await persistence.loadHistory()).toHaveLength(0);
		});

		it('should emit persistenceError event on exhausted retries', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			persistence.saveThoughtFailCount = 999;
			const events: Array<{ operation: string; error: Error }> = [];
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 1,
				persistenceFlushInterval: 60000,
				persistenceMaxRetries: 0,
			});

			manager.setEventEmitter({
				emit(_event, payload) {
					events.push(payload);
					return true;
				},
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			await vi.advanceTimersByTimeAsync(0);
			await vi.waitFor(() => expect(events).toHaveLength(1));

			expect(events[0]!.operation).toBe('flushBuffer');
			expect(events[0]!.error.message).toContain('Failed to persist');
		});
	});

	describe('Backpressure', () => {
		it('should not crash when buffer is full and flushing', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			persistence.saveThoughtFailCount = 999;
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 1,
				persistenceFlushInterval: 60000,
				persistenceMaxRetries: 0,
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			await vi.advanceTimersByTimeAsync(0);
			await vi.waitFor(() => expect(manager.getWriteBufferLength()).toBe(1));

			manager.addThought(createTestThought({ thought_number: 2 }));
			manager.addThought(createTestThought({ thought_number: 3 }));

			expect(manager.getHistoryLength()).toBe(3);
			expect(manager.getWriteBufferLength()).toBeGreaterThan(0);
		});
	});

	describe('Branch persistence', () => {
		it('should persist branches fire-and-forget', async () => {
			const persistence = new MockPersistence();
			const manager = new HistoryManager({ persistence });

			manager.addThought(
				createTestThought({
					thought_number: 1,
					branch_from_thought: 1,
					branch_id: 'branch-1',
				})
			);

			await new Promise((r) => setTimeout(r, 0));
			const loaded = await persistence.loadBranch('branch-1');
			expect(loaded).toBeDefined();
			expect(loaded).toHaveLength(1);
		});

		it('should not crash when branch persistence fails', async () => {
			const persistence = new MockPersistence();
			persistence.saveBranchFailCount = 999;
			const manager = new HistoryManager({ persistence });

			manager.addThought(
				createTestThought({
					thought_number: 1,
					branch_from_thought: 1,
					branch_id: 'branch-1',
				})
			);

			expect(manager.getBranch('branch-1')).toHaveLength(1);
		});
	});

	describe('loadFromPersistence', () => {
		it('should load history and branches from persistence', async () => {
			const persistence = new MockPersistence();
			await persistence.saveThought(createTestThought({ thought_number: 1 }));
			await persistence.saveBranch('branch-1', [createTestThought({ thought_number: 1 })]);

			const manager = new HistoryManager({ persistence });
			await manager.loadFromPersistence();

			expect(manager.getHistoryLength()).toBe(1);
			expect(manager.getBranchIds()).toContain('branch-1');
		});

		it('should skip load when persistence backend is unhealthy', async () => {
			const persistence = new MockPersistence();
			persistence.healthyResult = false;
			await persistence.saveThought(createTestThought({ thought_number: 1 }));

			const manager = new HistoryManager({ persistence });
			await manager.loadFromPersistence();
			expect(manager.getHistoryLength()).toBe(0);
		});

		it('should skip load when persistence is not enabled', async () => {
			const manager = new HistoryManager({ persistence: null });
			await manager.loadFromPersistence();
			expect(manager.getHistoryLength()).toBe(0);
		});

		it('should trim loaded history to maxHistorySize', async () => {
			const persistence = new MockPersistence();
			for (let i = 0; i < 10; i++) {
				await persistence.saveThought(createTestThought({ thought_number: i + 1 }));
			}

			const manager = new HistoryManager({ persistence, maxHistorySize: 5 });
			await manager.loadFromPersistence();

			expect(manager.getHistoryLength()).toBe(5);
			expect(manager.getHistory()[0]!.thought_number).toBe(6);
		});

		it('should handle load errors gracefully', async () => {
			const persistence = new MockPersistence();
			persistence.healthyResult = false;

			const manager = new HistoryManager({ persistence });
			await manager.loadFromPersistence();
			expect(manager.getHistoryLength()).toBe(0);
		});
	});

	describe('clear with persistence', () => {
		it('should clear persisted data when persistence is enabled', async () => {
			useFakeTimers();
			const persistence = new MockPersistence();
			const manager = new HistoryManager({ persistence });

			manager.addThought(createTestThought({ thought_number: 1 }));
			await vi.advanceTimersByTimeAsync(1100);
			expect(manager.getWriteBufferLength()).toBe(0);

			manager.clear();
			await vi.advanceTimersByTimeAsync(0);
			expect(await persistence.loadHistory()).toHaveLength(0);
		});

		it('should not crash when persistence clear fails', async () => {
			const persistence = new MockPersistence();
			persistence.clearFail = true;
			const manager = new HistoryManager({ persistence });

			manager.addThought(createTestThought({ thought_number: 1 }));
			manager.clear();
			expect(manager.getHistoryLength()).toBe(0);
		});
	});

	describe('shutdown', () => {
		it('should flush remaining buffer on shutdown', async () => {
			const persistence = new MockPersistence();
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 100,
				persistenceFlushInterval: 60000,
			});

			manager.addThought(createTestThought({ thought_number: 1 }));
			manager.addThought(createTestThought({ thought_number: 2 }));
			expect(manager.getWriteBufferLength()).toBe(2);

			await manager.shutdown();
			expect(manager.getWriteBufferLength()).toBe(0);
			expect(await persistence.loadHistory()).toHaveLength(2);
		});
	});

	describe('Utility methods', () => {
		it('should report persistence enabled state', () => {
			const withP = new HistoryManager({ persistence: new MockPersistence() });
			expect(withP.isPersistenceEnabled()).toBe(true);

			const withoutP = new HistoryManager({ persistence: null });
			expect(withoutP.isPersistenceEnabled()).toBe(false);
		});

		it('should expose the persistence backend', () => {
			const persistence = new MockPersistence();
			const manager = new HistoryManager({ persistence });
			expect(manager.getPersistenceBackend()).toBe(persistence);
		});

		it('should expose write buffer length for monitoring', () => {
			const manager = new HistoryManager({
				persistence: new MockPersistence(),
				persistenceBufferSize: 100,
				persistenceFlushInterval: 60000,
			});

			expect(manager.getWriteBufferLength()).toBe(0);
			manager.addThought(createTestThought({ thought_number: 1 }));
			expect(manager.getWriteBufferLength()).toBe(1);
		});
	});

	describe('merge topology tracking', () => {
		it('should store thoughts with merge metadata', () => {
			const manager = new HistoryManager();
			const thought = createTestThought({
				merge_from_thoughts: [1, 3],
				merge_branch_ids: ['branch-a', 'branch-b'],
			});
			manager.addThought(thought);

			const history = manager.getHistory();
			expect(history[history.length - 1]?.merge_from_thoughts).toEqual([1, 3]);
			expect(history[history.length - 1]?.merge_branch_ids).toEqual(['branch-a', 'branch-b']);
		});

		it('should store thoughts without merge metadata normally', () => {
			const manager = new HistoryManager();
			const thought = createTestThought();
			manager.addThought(thought);

			const history = manager.getHistory();
			expect(history[history.length - 1]?.merge_from_thoughts).toBeUndefined();
			expect(history[history.length - 1]?.merge_branch_ids).toBeUndefined();
		});
	});
});
