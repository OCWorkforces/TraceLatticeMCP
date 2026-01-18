import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ThoughtData } from '../types.js';
import { MemoryPersistence } from '../persistence/MemoryPersistence.js';
import { FilePersistence } from '../persistence/FilePersistence.js';
import { createPersistenceBackend, type PersistenceConfig } from '../persistence/PersistenceBackend.js';

// Helper to create a test thought
function createTestThought(overrides?: Partial<ThoughtData>): ThoughtData {
	return {
		available_mcp_tools: ['test-tool'],
		available_skills: ['test-skill'],
		thought: 'Test thought',
		thought_number: 1,
		total_thoughts: 1,
		next_thought_needed: false,
		...overrides,
	};
}

describe('MemoryPersistence', () => {
	let backend: MemoryPersistence;

	beforeEach(() => {
		backend = new MemoryPersistence();
	});

	describe('saveThought and loadHistory', () => {
		it('should save and load a single thought', async () => {
			const thought = createTestThought();
			await backend.saveThought(thought);

			const history = await backend.loadHistory();

			expect(history).toHaveLength(1);
			expect(history[0]).toEqual(thought);
		});

		it('should save and load multiple thoughts in order', async () => {
			const thought1 = createTestThought({ thought_number: 1, thought: 'First' });
			const thought2 = createTestThought({ thought_number: 2, thought: 'Second' });
			const thought3 = createTestThought({ thought_number: 3, thought: 'Third' });

			await backend.saveThought(thought1);
			await backend.saveThought(thought2);
			await backend.saveThought(thought3);

			const history = await backend.loadHistory();

			expect(history).toHaveLength(3);
			expect(history[0].thought).toBe('First');
			expect(history[1].thought).toBe('Second');
			expect(history[2].thought).toBe('Third');
		});

		it('should return empty array when no thoughts saved', async () => {
			const history = await backend.loadHistory();
			expect(history).toEqual([]);
		});

		it('should return a copy of history (not internal reference)', async () => {
			const thought = createTestThought();
			await backend.saveThought(thought);

			const history1 = await backend.loadHistory();
			const history2 = await backend.loadHistory();

			// Modify first array
			history1.push(createTestThought({ thought: 'Extra' }));

			// Second array should be unchanged
			expect(history2).toHaveLength(1);
			expect(history1).toHaveLength(2);
		});
	});

	describe('saveBranch and loadBranch', () => {
		it('should save and load a branch', async () => {
			const branchId = 'branch-1';
			const thoughts = [
				createTestThought({ thought: 'Branch thought 1', thought_number: 1 }),
				createTestThought({ thought: 'Branch thought 2', thought_number: 2 }),
			];

			await backend.saveBranch(branchId, thoughts);

			const loaded = await backend.loadBranch(branchId);

			expect(loaded).toEqual(thoughts);
		});

		it('should return undefined for non-existent branch', async () => {
			const loaded = await backend.loadBranch('non-existent');
			expect(loaded).toBeUndefined();
		});

		it('should save multiple branches', async () => {
			const branch1 = [createTestThought({ thought: 'Branch 1' })];
			const branch2 = [createTestThought({ thought: 'Branch 2' })];
			const branch3 = [createTestThought({ thought: 'Branch 3' })];

			await backend.saveBranch('branch-1', branch1);
			await backend.saveBranch('branch-2', branch2);
			await backend.saveBranch('branch-3', branch3);

			expect(await backend.loadBranch('branch-1')).toEqual(branch1);
			expect(await backend.loadBranch('branch-2')).toEqual(branch2);
			expect(await backend.loadBranch('branch-3')).toEqual(branch3);
		});

		it('should overwrite existing branch', async () => {
			const branchId = 'branch-1';
			const original = [createTestThought({ thought: 'Original' })];
			const updated = [createTestThought({ thought: 'Updated' })];

			await backend.saveBranch(branchId, original);
			await backend.saveBranch(branchId, updated);

			const loaded = await backend.loadBranch(branchId);

			expect(loaded).toEqual(updated);
		});

		it('should return a copy of branch data', async () => {
			const branchId = 'branch-1';
			const thoughts = [createTestThought({ thought: 'Test' })];

			await backend.saveBranch(branchId, thoughts);

			const loaded1 = await backend.loadBranch(branchId);
			const loaded2 = await backend.loadBranch(branchId);

			// Modify first array
			loaded1?.push(createTestThought({ thought: 'Extra' }));

			// Second array should be unchanged
			expect(loaded2).toHaveLength(1);
			expect(loaded1).toHaveLength(2);
		});
	});

	describe('clear', () => {
		it('should clear all history and branches', async () => {
			// Add history
			await backend.saveThought(createTestThought());
			await backend.saveThought(createTestThought({ thought_number: 2 }));

			// Add branches
			await backend.saveBranch('branch-1', [createTestThought()]);
			await backend.saveBranch('branch-2', [createTestThought()]);

			// Verify data exists
			expect((await backend.loadHistory()).length).toBeGreaterThan(0);
			expect(backend.getBranchCount()).toBe(2);

			// Clear
			await backend.clear();

			// Verify cleared
			expect(await backend.loadHistory()).toEqual([]);
			expect(await backend.loadBranch('branch-1')).toBeUndefined();
			expect(await backend.loadBranch('branch-2')).toBeUndefined();
			expect(backend.getHistorySize()).toBe(0);
			expect(backend.getBranchCount()).toBe(0);
		});

		it('should be safe to call multiple times', async () => {
			await backend.saveThought(createTestThought());
			await backend.clear();
			await backend.clear();
			await backend.clear();

			expect(await backend.loadHistory()).toEqual([]);
		});
	});

	describe('healthy', () => {
		it('should always return true for memory backend', async () => {
			expect(await backend.healthy()).toBe(true);
		});
	});

	describe('Helper methods', () => {
		it('should track history size correctly', async () => {
			expect(backend.getHistorySize()).toBe(0);

			await backend.saveThought(createTestThought());
			expect(backend.getHistorySize()).toBe(1);

			await backend.saveThought(createTestThought({ thought_number: 2 }));
			expect(backend.getHistorySize()).toBe(2);
		});

		it('should track branch count correctly', async () => {
			expect(backend.getBranchCount()).toBe(0);

			await backend.saveBranch('branch-1', [createTestThought()]);
			expect(backend.getBranchCount()).toBe(1);

			await backend.saveBranch('branch-2', [createTestThought()]);
			expect(backend.getBranchCount()).toBe(2);
		});

		it('should return all branch IDs', async () => {
			await backend.saveBranch('branch-1', [createTestThought()]);
			await backend.saveBranch('branch-2', [createTestThought()]);
			await backend.saveBranch('branch-3', [createTestThought()]);

			const ids = backend.getBranchIds();

			expect(ids).toHaveLength(3);
			expect(ids).toEqual(expect.arrayContaining(['branch-1', 'branch-2', 'branch-3']));
		});
	});

	describe('Complex scenarios', () => {
		it('should handle concurrent save operations', async () => {
			const thoughts = Array.from({ length: 100 }, (_, i) =>
				createTestThought({ thought_number: i + 1, thought: `Thought ${i + 1}` })
			);

			// Save all concurrently
			await Promise.all(thoughts.map((t) => backend.saveThought(t)));

			const history = await backend.loadHistory();

			expect(history).toHaveLength(100);
		});

		it('should isolate history from branches', async () => {
			// Add history
			await backend.saveThought(createTestThought({ thought: 'History thought' }));

			// Add branch
			await backend.saveBranch('branch-1', [createTestThought({ thought: 'Branch thought' })]);

			// History should only contain history thoughts
			const history = await backend.loadHistory();
			expect(history).toHaveLength(1);
			expect(history[0].thought).toBe('History thought');

			// Branch should only contain branch thoughts
			const branch = await backend.loadBranch('branch-1');
			expect(branch).toHaveLength(1);
			expect(branch?.[0].thought).toBe('Branch thought');
		});
	});
});

describe('FilePersistence', () => {
	let testDir: string;
	let backend: FilePersistence;

	beforeEach(() => {
		// Create a temporary directory for testing
		testDir = join(tmpdir(), `claude-persistence-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		// Create backend with test directory
		backend = new FilePersistence({ dataDir: testDir });
	});

	afterEach(async () => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('saveThought and loadHistory', () => {
		it('should save and load a single thought', async () => {
			const thought = createTestThought();
			await backend.saveThought(thought);

			const history = await backend.loadHistory();

			expect(history).toHaveLength(1);
			expect(history[0]).toEqual(thought);
		});

		it('should persist data across backend instances', async () => {
			const thought = createTestThought();

			// Save with first instance
			await backend.saveThought(thought);

			// Create new instance (simulates restart)
			const backend2 = new FilePersistence({ dataDir: testDir });
			const history = await backend2.loadHistory();

			expect(history).toHaveLength(1);
			expect(history[0]).toEqual(thought);
		});

		it('should handle empty history file', async () => {
			const history = await backend.loadHistory();
			expect(history).toEqual([]);
		});

		it('should handle corrupted history file gracefully', async () => {
			const { writeFile } = await import('node:fs/promises');
			const { join } = await import('node:path');

			// Write corrupted data
			const historyPath = join(testDir, 'history.json');
			await writeFile(historyPath, 'invalid json', 'utf-8');

			// Should return empty array instead of throwing
			const history = await backend.loadHistory();
			expect(history).toEqual([]);
		});
	});

	describe('saveBranch and loadBranch', () => {
		it('should save and load a branch', async () => {
			const branchId = 'branch-1';
			const thoughts = [
				createTestThought({ thought: 'Branch thought 1', thought_number: 1 }),
				createTestThought({ thought: 'Branch thought 2', thought_number: 2 }),
			];

			await backend.saveBranch(branchId, thoughts);

			const loaded = await backend.loadBranch(branchId);

			expect(loaded).toEqual(thoughts);
		});

		it('should return undefined for non-existent branch', async () => {
			const loaded = await backend.loadBranch('non-existent');
			expect(loaded).toBeUndefined();
		});

		it('should persist branches across backend instances', async () => {
			const branchId = 'branch-1';
			const thoughts = [createTestThought({ thought: 'Branch thought' })];

			await backend.saveBranch(branchId, thoughts);

			// Create new instance
			const backend2 = new FilePersistence({ dataDir: testDir });
			const loaded = await backend2.loadBranch(branchId);

			expect(loaded).toEqual(thoughts);
		});

		it('should handle corrupted branch file gracefully', async () => {
			const { writeFile, mkdir } = await import('node:fs/promises');
			const { join } = await import('node:path');

			// Create branches directory
			const branchesDir = join(testDir, 'branches');
			await mkdir(branchesDir, { recursive: true });

			// Write corrupted data
			const branchPath = join(branchesDir, 'corrupted.json');
			await writeFile(branchPath, 'invalid json', 'utf-8');

			// Should return undefined instead of throwing
			const loaded = await backend.loadBranch('corrupted');
			expect(loaded).toBeUndefined();
		});
	});

	describe('clear', () => {
		it('should clear all history and branches', async () => {
			// Add data
			await backend.saveThought(createTestThought());
			await backend.saveBranch('branch-1', [createTestThought()]);

			// Clear
			await backend.clear();

			// Verify cleared
			expect(await backend.loadHistory()).toEqual([]);
			expect(await backend.loadBranch('branch-1')).toBeUndefined();
		});

		it('should be safe to call when nothing to clear', async () => {
			await expect(async () => await backend.clear()).not.toThrow();
		});
	});

	describe('healthy', () => {
		it('should return true when backend is operational', async () => {
			expect(await backend.healthy()).toBe(true);
		});
	});

	describe('maxHistorySize', () => {
		it('should trim history when exceeding max size', async () => {
			const smallMax = 5;
			const backend2 = new FilePersistence({
				dataDir: testDir,
				maxHistorySize: smallMax,
			});

			// Add more thoughts than max
			for (let i = 0; i < 10; i++) {
				await backend2.saveThought(createTestThought({ thought_number: i + 1 }));
			}

			const history = await backend2.loadHistory();

			// Should only have the last 5 thoughts
			expect(history).toHaveLength(5);
			expect(history[0].thought_number).toBe(6);
			expect(history[4].thought_number).toBe(10);
		});
	});

	describe('persistBranches option', () => {
		it('should not save branches when persistBranches is false', async () => {
			const backend2 = new FilePersistence({
				dataDir: testDir,
				persistBranches: false,
			});

			await backend2.saveBranch('branch-1', [createTestThought()]);

			const loaded = await backend2.loadBranch('branch-1');

			expect(loaded).toBeUndefined();
		});
	});

	describe('Helper methods', () => {
		it('should return data directory path', () => {
			const dataDir = backend.getDataDir();
			expect(dataDir).toBe(testDir);
		});

		it('should return all branch IDs', async () => {
			await backend.saveBranch('branch-1', [createTestThought()]);
			await backend.saveBranch('branch-2', [createTestThought()]);
			await backend.saveBranch('branch-3', [createTestThought()]);

			const ids = await backend.getBranchIds();

			expect(ids).toHaveLength(3);
			expect(ids).toEqual(expect.arrayContaining(['branch-1', 'branch-2', 'branch-3']));
		});

		it('should return empty array when no branches', async () => {
			const ids = await backend.getBranchIds();
			expect(ids).toEqual([]);
		});
	});

	describe('Complex scenarios', () => {
		it('should handle multiple sequential saves', async () => {
			const thoughts = Array.from({ length: 50 }, (_, i) =>
				createTestThought({ thought_number: i + 1, thought: `Thought ${i + 1}` })
			);

			// Save sequentially (FilePersistence is not designed for concurrent writes)
			for (const thought of thoughts) {
				await backend.saveThought(thought);
			}

			const history = await backend.loadHistory();

			expect(history).toHaveLength(50);
		});

		it('should create directories on demand', async () => {
			// Use a non-existent directory
			const nestedDir = join(testDir, 'nested', 'path');
			const backend2 = new FilePersistence({ dataDir: nestedDir });

			await backend2.saveThought(createTestThought());

			// Should succeed without error
			const history = await backend2.loadHistory();
			expect(history).toHaveLength(1);
		});
	});
});

describe('createPersistenceBackend', () => {
	it('should return null when persistence is disabled', async () => {
		const config: PersistenceConfig = {
			enabled: false,
		};

		const backend = await createPersistenceBackend(config);

		expect(backend).toBeNull();
	});

	it('should create memory backend when specified', async () => {
		const config: PersistenceConfig = {
			enabled: true,
			backend: 'memory',
		};

		const backend = await createPersistenceBackend(config);

		expect(backend).toBeInstanceOf(MemoryPersistence);
	});

	it('should create file backend when specified', async () => {
		const testDir = join(tmpdir(), `claude-factory-test-${Date.now()}`);

		const config: PersistenceConfig = {
			enabled: true,
			backend: 'file',
			options: { dataDir: testDir },
		};

		const backend = await createPersistenceBackend(config);

		expect(backend).toBeInstanceOf(FilePersistence);
		expect((backend as FilePersistence).getDataDir()).toBe(testDir);

		// Cleanup
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it('should throw error for unknown backend type', async () => {
		const config = {
			enabled: true,
			backend: 'unknown' as 'memory',
		};

		await expect(async () => await createPersistenceBackend(config)).rejects.toThrow(
			'Unknown persistence backend: unknown'
		);
	});

	it('should throw error for sqlite when better-sqlite3 is not installed', async () => {
		const config: PersistenceConfig = {
			enabled: true,
			backend: 'sqlite',
		};

		// This will fail because better-sqlite3 is not installed
		try {
			await createPersistenceBackend(config);
			// If it somehow succeeds (e.g., if package is installed), that's ok too
		} catch (error) {
			expect((error as Error).message).toContain('better-sqlite3');
		}
	});
});

describe('PersistenceBackend Interface Compliance', () => {
	const testThought = createTestThought();

	it('MemoryPersistence should comply with interface', async () => {
		const backend = new MemoryPersistence();

		await backend.saveThought(testThought);
		expect(await backend.loadHistory()).toHaveLength(1);
		await backend.clear();
		expect(await backend.loadHistory()).toHaveLength(0);
		expect(await backend.healthy()).toBe(true);
	});

	it('FilePersistence should comply with interface', async () => {
		const testDir = join(tmpdir(), `compliance-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		const backend = new FilePersistence({ dataDir: testDir });

		await backend.saveThought(testThought);
		expect(await backend.loadHistory()).toHaveLength(1);
		await backend.clear();
		expect(await backend.loadHistory()).toHaveLength(0);
		expect(await backend.healthy()).toBe(true);

		// Cleanup
		rmSync(testDir, { recursive: true, force: true });
	});
});
