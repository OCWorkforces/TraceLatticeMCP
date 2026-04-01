import { describe, it, expect, afterEach, vi } from 'vitest';
import { ABSOLUTE_MAX_HISTORY_SIZE, HistoryManager } from '../core/HistoryManager.js';
import type { PersistenceBackend } from '../persistence/PersistenceBackend.js';
import { createTestThought } from './helpers/index.js';
import { useFakeTimers, useRealTimers } from './helpers/index.js';
import type { Logger } from '../logger/StructuredLogger.js';
import type { ThoughtData } from '../core/thought.js';

/** Test-only interface to access private fields of HistoryManager. */
interface HistoryManagerTestAccess {
	_maxHistorySize: number;
}

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
			await vi.advanceTimersByTimeAsync(0);
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

	describe('session partitioning', () => {
		it('creates isolated sessions with different session_ids', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'session-a' }));
			manager.addThought(createTestThought({ thought_number: 2, session_id: 'session-b' }));

			expect(manager.getHistoryLength('session-a')).toBe(1);
			expect(manager.getHistoryLength('session-b')).toBe(1);
		});

		it('uses __global__ session when session_id is omitted', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1 }));

			expect(manager.getHistoryLength()).toBe(1);
			expect(manager.getHistoryLength('__global__')).toBe(1);
		});

		it('returns empty history for new session', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1 }));

			expect(manager.getHistoryLength('new-session')).toBe(0);
		});

		it('does not leak thoughts between sessions', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a', thought: 'A1' }));
			manager.addThought(createTestThought({ thought_number: 2, session_id: 'a', thought: 'A2' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b', thought: 'B1' }));

			const historyA = manager.getHistory('a');
			const historyB = manager.getHistory('b');

			expect(historyA).toHaveLength(2);
			expect(historyB).toHaveLength(1);
			expect(historyA[0]!.thought).toBe('A1');
			expect(historyB[0]!.thought).toBe('B1');
		});

		it('does not leak branches between sessions', () => {
			const manager = new HistoryManager();
			manager.addThought(
				createTestThought({
					thought_number: 1,
					session_id: 'a',
					branch_from_thought: 1,
					branch_id: 'branch-a',
				})
			);
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b' }));

			expect(manager.getBranchIds('a')).toContain('branch-a');
			expect(manager.getBranchIds('b')).toHaveLength(0);
		});

		it('tracks available_mcp_tools per session', () => {
			const manager = new HistoryManager();
			manager.addThought(
				createTestThought({
					thought_number: 1,
					session_id: 'a',
					available_mcp_tools: ['tool-a'],
				})
			);
			manager.addThought(
				createTestThought({
					thought_number: 1,
					session_id: 'b',
					available_mcp_tools: ['tool-b'],
				})
			);

			expect(manager.getAvailableMcpTools('a')).toEqual(['tool-a']);
			expect(manager.getAvailableMcpTools('b')).toEqual(['tool-b']);
		});

		it('tracks available_skills per session', () => {
			const manager = new HistoryManager();
			manager.addThought(
				createTestThought({
					thought_number: 1,
					session_id: 'a',
					available_skills: ['skill-a'],
				})
			);
			manager.addThought(
				createTestThought({
					thought_number: 1,
					session_id: 'b',
					available_skills: ['skill-b'],
				})
			);

			expect(manager.getAvailableSkills('a')).toEqual(['skill-a']);
			expect(manager.getAvailableSkills('b')).toEqual(['skill-b']);
		});

		it('clears only the target session on clear(sessionId)', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b' }));

			manager.clear('a');

			expect(manager.getHistoryLength('a')).toBe(0);
			expect(manager.getHistoryLength('b')).toBe(1);
		});

		it('clears all sessions on clear() without sessionId', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b' }));
			manager.addThought(createTestThought({ thought_number: 1 }));

			manager.clear();

			expect(manager.getHistoryLength('a')).toBe(0);
			expect(manager.getHistoryLength('b')).toBe(0);
			expect(manager.getHistoryLength()).toBe(0);
		});

		it('getSessionIds() returns all active session IDs', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b' }));

			const ids = manager.getSessionIds();
			expect(ids).toContain('a');
			expect(ids).toContain('b');
		});

		it('getSessionCount() returns correct count', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b' }));

			expect(manager.getSessionCount()).toBe(2);
		});
	});

	describe('session TTL eviction', () => {
		it('evicts sessions inactive longer than TTL', () => {
			useFakeTimers();
			const manager = new HistoryManager();

			manager.addThought(createTestThought({ thought_number: 1, session_id: 'old' }));
			expect(manager.getHistoryLength('old')).toBe(1);

			// Advance past TTL (30 minutes) + cleanup interval (5 minutes)
			vi.advanceTimersByTime(31 * 60 * 1000);

			// Trigger the 5-minute cleanup timer
			vi.advanceTimersByTime(5 * 60 * 1000);

			// The 'old' session should have been cleaned up
			expect(manager.getSessionIds()).not.toContain('old');
		});

		it('does not evict the __global__ session', () => {
			useFakeTimers();
			const manager = new HistoryManager();

			manager.addThought(createTestThought({ thought_number: 1 }));

			// Advance well past TTL + cleanup interval
			vi.advanceTimersByTime(36 * 60 * 1000);

			expect(manager.getHistoryLength()).toBe(1);
			expect(manager.getSessionIds()).toContain('__global__');
		});

		it('does not evict recently accessed sessions', () => {
			useFakeTimers();
			const manager = new HistoryManager();

			manager.addThought(createTestThought({ thought_number: 1, session_id: 'active' }));

			// Advance 20 minutes, then access the session
			vi.advanceTimersByTime(20 * 60 * 1000);
			manager.addThought(createTestThought({ thought_number: 2, session_id: 'active' }));

			// Advance another 20 minutes (40 total, but only 20 since last access)
			vi.advanceTimersByTime(20 * 60 * 1000);

			// Trigger cleanup
			vi.advanceTimersByTime(5 * 60 * 1000);

			expect(manager.getHistoryLength('active')).toBe(2);
		});
	});

	describe('session LRU eviction', () => {
		it('does not break when creating many sessions', () => {
			const manager = new HistoryManager();

			for (let i = 0; i < 10; i++) {
				manager.addThought(
					createTestThought({ thought_number: 1, session_id: `session-${i}` })
				);
			}

			expect(manager.getSessionCount()).toBe(10);
		});

		it('evicts oldest session when MAX_SESSIONS exceeded', () => {
			useFakeTimers();
			const manager = new HistoryManager();

			// MAX_SESSIONS is 100. Create 100 sessions.
			for (let i = 0; i < 100; i++) {
				manager.addThought(
					createTestThought({ thought_number: 1, session_id: `s-${i}` })
				);
				// Small time advance to ensure distinct lastAccessedAt
				vi.advanceTimersByTime(1);
			}

			expect(manager.getSessionCount()).toBe(100);

			// Creating the 101st session should evict the oldest (s-0)
			manager.addThought(
				createTestThought({ thought_number: 1, session_id: 'overflow' })
			);

			expect(manager.getSessionCount()).toBe(100);
			expect(manager.getSessionIds()).not.toContain('s-0');
			expect(manager.getSessionIds()).toContain('overflow');
		});
	});

	describe('session persistence', () => {
		it('buffers writes per session', () => {
			const persistence = new MockPersistence();
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 100,
				persistenceFlushInterval: 60000,
			});

			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b' }));

			expect(manager.getWriteBufferLength()).toBe(2);
		});

		it('flushes all session buffers on shutdown', async () => {
			const persistence = new MockPersistence();
			const manager = new HistoryManager({
				persistence,
				persistenceBufferSize: 100,
				persistenceFlushInterval: 60000,
			});

			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'b' }));

			await manager.shutdown();

			expect(manager.getWriteBufferLength()).toBe(0);
			expect(await persistence.loadHistory()).toHaveLength(2);
		});

		it('clearSession removes specific session data', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'x' }));
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'y' }));

			manager.clearSession('x');

			expect(manager.getHistoryLength('x')).toBe(0);
			expect(manager.getHistoryLength('y')).toBe(1);
		});
	});

	describe('backward compatibility', () => {
		it('all existing operations work without session_id', () => {
			const manager = new HistoryManager();

			manager.addThought(createTestThought({ thought_number: 1 }));
			manager.addThought(createTestThought({ thought_number: 2 }));

			expect(manager.getHistoryLength()).toBe(2);
			expect(manager.getHistory()).toHaveLength(2);
			expect(manager.getBranchIds()).toEqual([]);

			manager.clear();
			expect(manager.getHistoryLength()).toBe(0);
		});

		it('getBranch returns undefined for non-existent branch across sessions', () => {
			const manager = new HistoryManager();
			manager.addThought(createTestThought({ thought_number: 1, session_id: 'a' }));

			expect(manager.getBranch('non-existent', 'a')).toBeUndefined();
			expect(manager.getBranch('non-existent', 'b')).toBeUndefined();
		});

		it('getAvailableMcpTools returns undefined for fresh session', () => {
			const manager = new HistoryManager();

			expect(manager.getAvailableMcpTools('nonexistent')).toBeUndefined();
			expect(manager.getAvailableSkills('nonexistent')).toBeUndefined();
		});
	});
});

describe('ABSOLUTE_MAX_HISTORY_SIZE cap', () => {
	it('should export ABSOLUTE_MAX_HISTORY_SIZE as 10000', () => {
		expect(ABSOLUTE_MAX_HISTORY_SIZE).toBe(10_000);
	});

	it('should cap maxHistorySize to ABSOLUTE_MAX_HISTORY_SIZE when config exceeds it', () => {
		const manager = new HistoryManager({ maxHistorySize: 50_000 });
		expect((manager as unknown as HistoryManagerTestAccess)._maxHistorySize).toBe(10_000);
	});

	it('should not alter maxHistorySize when within cap', () => {
		const manager = new HistoryManager({ maxHistorySize: 500 });
		expect((manager as unknown as HistoryManagerTestAccess)._maxHistorySize).toBe(500);
	});

	it('should use default 1000 when no config provided', () => {
		const manager = new HistoryManager({});
		expect((manager as unknown as HistoryManagerTestAccess)._maxHistorySize).toBe(1_000);
	});

	it('should log warning when capping occurs', () => {
		const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(), getLevel: vi.fn() } as Logger;
		new HistoryManager({ maxHistorySize: 50_000, logger: mockLogger });
		expect(mockLogger.warn).toHaveBeenCalledWith(
			'maxHistorySize exceeds absolute maximum, capped',
			expect.objectContaining({ requested: 50_000, applied: 10_000 })
		);
	});
});
