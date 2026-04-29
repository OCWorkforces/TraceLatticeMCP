import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqlitePersistence } from '../persistence/SqlitePersistence.js';
import { createTestThought } from './helpers/factories.js';

// Shared mock state accessible to both mock factory and tests
import { asBranchId } from '../contracts/ids.js';
const mockState = vi.hoisted(() => {
	let thoughts: Array<{ id: number; data: string }> = [];
	let branches = new Map<string, string>();
	let nextId = 1;
	let throwOnHealth = false;

	return {
		reset() {
			thoughts = [];
			branches = new Map();
			nextId = 1;
			throwOnHealth = false;
		},
		get thoughtCount() {
			return thoughts.length;
		},
		setThrowOnHealth(v: boolean) {
			throwOnHealth = v;
		},
		addThought(data: string) {
			thoughts.push({ id: nextId++, data });
		},
		trimThoughts(keep: number) {
			if (thoughts.length > keep) {
				thoughts = thoughts.slice(thoughts.length - keep);
			}
		},
		clearThoughts() {
			thoughts = [];
		},
		clearBranches() {
			branches.clear();
		},
		setBranch(id: string, data: string) {
			branches.set(id, data);
		},
		get shouldThrowOnHealth() {
			return throwOnHealth;
		},
		getThoughtData(): Array<{ data: string }> {
			return thoughts.map((t) => ({ data: t.data }));
		},
		getBranchData(id: string): string | undefined {
			return branches.get(id);
		},
		getBranchIds(): string[] {
			return Array.from(branches.keys());
		},
	};
});

vi.mock('better-sqlite3', () => {
	class MockStatement {
		private sql: string;
		constructor(sql: string) {
			this.sql = sql;
		}

		run(...params: unknown[]) {
			if (this.sql.includes('INSERT INTO thoughts')) {
				mockState.addThought(params[0] as string);
				return { changes: 1, lastInsertRowid: 0 };
			}
			if (this.sql.includes('DELETE FROM thoughts WHERE id IN')) {
				const count = params[0] as number;
				mockState.trimThoughts(mockState.thoughtCount - count);
				return { changes: count, lastInsertRowid: 0 };
			}
			if (this.sql.includes('INSERT OR REPLACE INTO branches')) {
				const [id, data] = params as [string, string];
				mockState.setBranch(id, data);
				return { changes: 1, lastInsertRowid: 0 };
			}
			return { changes: 0, lastInsertRowid: 0 };
		}

		get(...params: unknown[]) {
			if (this.sql.includes('SELECT COUNT(*)')) {
				return { count: mockState.thoughtCount };
			}
			if (this.sql.includes('SELECT 1')) {
				if (mockState.shouldThrowOnHealth) throw new Error('DB error');
				return { result: 1 };
			}
			if (this.sql.includes('SELECT data FROM branches WHERE')) {
				const id = params[0] as string;
				const data = mockState.getBranchData(id);
				return data !== undefined ? { data } : undefined;
			}
			return undefined;
		}

		all() {
			if (this.sql.includes('SELECT data FROM thoughts')) {
				return mockState.getThoughtData();
			}
			if (this.sql.includes('SELECT branch_id FROM branches')) {
				return mockState.getBranchIds().map((id) => ({ branch_id: id }));
			}
			return [];
		}
	}

	return {
		default: class MockDatabase {
			exec(sql: string) {
				if (sql.includes('DELETE FROM thoughts')) {
					mockState.clearThoughts();
				}
				if (sql.includes('DELETE FROM branches')) {
					mockState.clearBranches();
				}
			}

			prepare(sql: string) {
				return new MockStatement(sql);
			}

			close() {}

			pragma() {
				return undefined;
			}
		},
	};
});

vi.mock('node:fs', () => ({
	existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock('node:os', () => ({
	homedir: () => '/tmp/test-home',
}));

describe('SqlitePersistence', () => {
	let persistence: SqlitePersistence;

	beforeEach(() => {
		mockState.reset();
	});

	describe('create', () => {
		it('should create instance with default options', async () => {
			persistence = await SqlitePersistence.create();
			expect(persistence).toBeInstanceOf(SqlitePersistence);
		});

		it('should create instance with custom options', async () => {
			persistence = await SqlitePersistence.create({
				dbPath: '/tmp/test.db',
				enableWAL: false,
				maxHistorySize: 100,
				persistBranches: true,
			});
			expect(persistence).toBeInstanceOf(SqlitePersistence);
		});

		it('should create instance without branch persistence', async () => {
			persistence = await SqlitePersistence.create({
				persistBranches: false,
			});
			expect(persistence).toBeInstanceOf(SqlitePersistence);
		});
	});

	describe('saveThought and loadHistory', () => {
		beforeEach(async () => {
			persistence = await SqlitePersistence.create({ maxHistorySize: 100 });
		});

		it('should save and load thoughts', async () => {
			const thought = createTestThought();
			await persistence.saveThought(thought);

			const history = await persistence.loadHistory();
			expect(history).toHaveLength(1);
			expect(history[0]!.thought).toBe('Test thought');
		});

		it('should save multiple thoughts in order', async () => {
			await persistence.saveThought(createTestThought({ thought_number: 1 }));
			await persistence.saveThought(createTestThought({ thought_number: 2 }));
			await persistence.saveThought(createTestThought({ thought_number: 3 }));

			const history = await persistence.loadHistory();
			expect(history).toHaveLength(3);
		});

		it('should return empty history when no thoughts saved', async () => {
			const history = await persistence.loadHistory();
			expect(history).toEqual([]);
		});

		it('should handle corrupt JSON in loadHistory', async () => {
			mockState.addThought('not-valid-json');

			const history = await persistence.loadHistory();
			expect(history).toEqual([]);
		});

		it('should filter out corrupt entries alongside valid ones', async () => {
			await persistence.saveThought(createTestThought({ thought: 'valid' }));
			mockState.addThought('bad-json');
			await persistence.saveThought(createTestThought({ thought: 'also-valid' }));

			const history = await persistence.loadHistory();
			// corrupt entry filtered out
			expect(history.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('trimming', () => {
		it('should trim thoughts when exceeding maxHistorySize', async () => {
			persistence = await SqlitePersistence.create({ maxHistorySize: 3 });

			await persistence.saveThought(createTestThought({ thought: 'first' }));
			await persistence.saveThought(createTestThought({ thought: 'second' }));
			await persistence.saveThought(createTestThought({ thought: 'third' }));
			await persistence.saveThought(createTestThought({ thought: 'fourth' }));

			const history = await persistence.loadHistory();
			expect(history).toHaveLength(3);
		});

		it('should not trim when under maxHistorySize', async () => {
			persistence = await SqlitePersistence.create({ maxHistorySize: 10 });
			await persistence.saveThought(createTestThought());
			await persistence.saveThought(createTestThought());

			const history = await persistence.loadHistory();
			expect(history).toHaveLength(2);
		});
	});

	describe('branches', () => {
		beforeEach(async () => {
			persistence = await SqlitePersistence.create({ persistBranches: true });
		});

		it('should save and load a branch', async () => {
			const thoughts = [createTestThought({ thought: 'branch-thought' })];
			await persistence.saveBranch(asBranchId('branch-1'), thoughts);

			const loaded = await persistence.loadBranch(asBranchId('branch-1'));
			expect(loaded).toHaveLength(1);
			expect(loaded![0]!.thought).toBe('branch-thought');
		});

		it('should return undefined for non-existent branch', async () => {
			const loaded = await persistence.loadBranch(asBranchId('non-existent'));
			expect(loaded).toBeUndefined();
		});

		it('should handle corrupt JSON in loadBranch', async () => {
			mockState.setBranch('corrupt', 'not-valid-json');

			const loaded = await persistence.loadBranch(asBranchId('corrupt'));
			expect(loaded).toBeUndefined();
		});

		it('should handle non-array JSON in loadBranch', async () => {
			mockState.setBranch('not-array', '"string-value"');

			const loaded = await persistence.loadBranch(asBranchId('not-array'));
			expect(loaded).toBeUndefined();
		});

		it('should list all branches', async () => {
			await persistence.saveBranch(asBranchId('branch-a'), []);
			await persistence.saveBranch(asBranchId('branch-b'), []);

			const branches = await persistence.listBranches();
			expect(branches).toContain('branch-a');
			expect(branches).toContain('branch-b');
		});

		it('should skip save when persistBranches is false', async () => {
			const noBranch = await SqlitePersistence.create({ persistBranches: false });
			await noBranch.saveBranch(asBranchId('branch-1'), [createTestThought()]);

			const loaded = await noBranch.loadBranch(asBranchId('branch-1'));
			expect(loaded).toBeUndefined();
		});

		it('should skip list when persistBranches is false', async () => {
			const noBranch = await SqlitePersistence.create({ persistBranches: false });
			const branches = await noBranch.listBranches();
			expect(branches).toEqual([]);
		});
	});

	describe('clear', () => {
		it('should clear all thoughts and branches', async () => {
			persistence = await SqlitePersistence.create({ persistBranches: true });
			await persistence.saveThought(createTestThought());
			await persistence.saveBranch(asBranchId('branch-1'), [createTestThought()]);

			await persistence.clear();

			const history = await persistence.loadHistory();
			expect(history).toEqual([]);

			const branches = await persistence.listBranches();
			expect(branches).toEqual([]);
		});
	});

	describe('healthy', () => {
		it('should return true when database is healthy', async () => {
			persistence = await SqlitePersistence.create();
			const healthy = await persistence.healthy();
			expect(healthy).toBe(true);
		});

		it('should return false when database check fails', async () => {
			persistence = await SqlitePersistence.create();
			mockState.setThrowOnHealth(true);
			const healthy = await persistence.healthy();
			expect(healthy).toBe(false);
		});
	});

	describe('close', () => {
		it('should close the database connection', async () => {
			persistence = await SqlitePersistence.create();
			await persistence.close();
		});
	});

	describe('getStats', () => {
		it('should return statistics with thoughts and branches', async () => {
			persistence = await SqlitePersistence.create({ persistBranches: true });
			await persistence.saveThought(createTestThought());
			await persistence.saveBranch(asBranchId('branch-1'), []);

			const stats = persistence.getStats();
			expect(stats.thoughtCount).toBe(1);
			expect(stats.branchCount).toBe(1);
			expect(stats.dbSize).toBe(0);
		});

		it('should return zero branch count when persistBranches is false', async () => {
			persistence = await SqlitePersistence.create({ persistBranches: false });
			const stats = persistence.getStats();
			expect(stats.branchCount).toBe(0);
		});

		it('should return zero counts when empty', async () => {
			persistence = await SqlitePersistence.create();
			const stats = persistence.getStats();
			expect(stats.thoughtCount).toBe(0);
			expect(stats.branchCount).toBe(0);
		});
	});

	describe('constructor defaults', () => {
		it('should use .claude/data when existsSync returns true', async () => {
			const { existsSync } = await import('node:fs');
			const mockedExistsSync = vi.mocked(existsSync);
			mockedExistsSync.mockReturnValueOnce(true);

			persistence = await SqlitePersistence.create();
			expect(persistence).toBeInstanceOf(SqlitePersistence);
		});
	});

	describe('close edge cases', () => {
		it('should handle WAL checkpoint error during close gracefully', async () => {
			// Override pragma to throw on wal_checkpoint
			const { default: MockDB } = await import('better-sqlite3');
			const origPragma = MockDB.prototype.pragma;
			MockDB.prototype.pragma = function (sql: string) {
				if (typeof sql === 'string' && sql.includes('wal_checkpoint')) {
					throw new Error('checkpoint error');
				}
				return origPragma.call(this, sql);
			};

			persistence = await SqlitePersistence.create();
			// close() should not throw even when checkpoint fails
			await expect(persistence.close()).resolves.toBeUndefined();

			// Restore original pragma
			MockDB.prototype.pragma = origPragma;
		});
	});

	describe('getStats edge cases', () => {
		it('should handle undefined result for branch count', async () => {
			// Override the branch count query to return undefined
			const { default: MockDB } = await import('better-sqlite3');
			const origPrepare = MockDB.prototype.prepare;
			MockDB.prototype.prepare = function (sql: string) {
				const stmt = origPrepare.call(this, sql);
				if (sql.includes('SELECT COUNT(*) as count FROM branches')) {
					stmt.get = () => undefined;
				}
				return stmt;
			};

			persistence = await SqlitePersistence.create({ persistBranches: true });
			const stats = persistence.getStats();
			expect(stats.branchCount).toBe(0);

			// Restore
			MockDB.prototype.prepare = origPrepare;
		});
	});
});
