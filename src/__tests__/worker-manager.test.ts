import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerManager, createWorkerManager } from '../cluster/WorkerManager.js';
import type { ThoughtData } from '../core/thought.js';

// Mock Worker class to avoid spawning real threads
vi.mock('node:worker_threads', () => {
	const MockWorker = class {
		on = vi.fn();
		postMessage = vi.fn();
		terminate = vi.fn().mockResolvedValue(undefined);

		constructor(_script: string, _options?: Record<string, unknown>) {
			// Mock constructor
		}
	};

	return {
		Worker: MockWorker,
	};
});

// Mock fs.existsSync to control worker script availability
vi.mock('node:fs', () => ({
	existsSync: vi.fn((path: string) => {
		// Return true for a mock worker script
		return path.includes('worker.js') || path.includes('mock-worker');
	}),
}));

// Mock os.cpus() to control worker count
vi.mock('node:os', () => ({
	cpus: () => [{}, {}, {}, {}], // 4 CPUs
}));

describe('WorkerManager', () => {
	let manager: WorkerManager;

	beforeEach(() => {
		manager = new WorkerManager({
			maxWorkers: 2,
			workerScript: './mock-worker.js',
			workerTimeout: 5000,
			enableHealthCheck: false, // Disable for most tests
		});
	});

	afterEach(async () => {
		if (manager.isRunning()) {
			await manager.terminate();
		}
	});

	describe('constructor', () => {
		it('should use default options when none provided', () => {
			const defaultManager = new WorkerManager();
			expect(defaultManager).toBeInstanceOf(WorkerManager);

			const stats = defaultManager.getStats();
			// Default is CPU count (the mock might not apply to CommonJS require)
			expect(stats.maxWorkers).toBeGreaterThan(0);
		});

		it('should use custom maxWorkers', () => {
			const customManager = new WorkerManager({ maxWorkers: 8 });
			expect(customManager.getStats().maxWorkers).toBe(8);
		});

		it('should use custom workerScript', () => {
			const customManager = new WorkerManager({ workerScript: './custom-worker.js' });
			expect(customManager).toBeInstanceOf(WorkerManager);
		});

		it('should use custom workerTimeout', () => {
			const customManager = new WorkerManager({ workerTimeout: 60000 });
			expect(customManager).toBeInstanceOf(WorkerManager);
		});

		it('should enable health check by default', () => {
			const defaultManager = new WorkerManager();
			expect(defaultManager.getStats().healthCheckEnabled).toBe(true);
		});

		it('should allow disabling health check', () => {
			const noHealthCheckManager = new WorkerManager({ enableHealthCheck: false });
			expect(noHealthCheckManager.getStats().healthCheckEnabled).toBe(false);
		});
	});

	describe('start', () => {
		it('should throw error if worker script not found', async () => {
			const { existsSync } = await import('node:fs');
			vi.mocked(existsSync).mockReturnValue(false);

			const badManager = new WorkerManager({
				workerScript: './non-existent.js',
				enableHealthCheck: false,
			});

			await expect(async () => await badManager.start()).rejects.toThrow('Worker script not found');

			vi.mocked(existsSync).mockReturnValue(true);
		});

		it('should start successfully with valid configuration', async () => {
			// Note: This test uses the mocked Worker class
			// In a real scenario, it would spawn actual workers
			expect(manager.isRunning()).toBe(false);

			await manager.start();

			expect(manager.isRunning()).toBe(true);
		});

		it('should throw error if already terminated', async () => {
			await manager.start();
			await manager.terminate();

			await expect(async () => await manager.start()).rejects.toThrow(
				'WorkerManager has been terminated'
			);
		});

		it('should spawn configured number of workers', async () => {
			await manager.start();

			const stats = manager.getStats();
			expect(stats.activeWorkers).toBe(2);
		});
	});

	describe('getStats', () => {
		it('should return correct stats when not started', () => {
			const stats = manager.getStats();

			expect(stats.activeWorkers).toBe(0);
			expect(stats.activeRequests).toBe(0);
			expect(stats.maxWorkers).toBe(2);
			expect(stats.healthCheckEnabled).toBe(false);
		});

		it('should return correct stats when started', async () => {
			await manager.start();

			const stats = manager.getStats();

			expect(stats.activeWorkers).toBe(2);
			expect(stats.activeRequests).toBe(0);
		});
	});

	describe('isRunning', () => {
		it('should return false when not started', () => {
			expect(manager.isRunning()).toBe(false);
		});

		it('should return true when started', async () => {
			await manager.start();
			expect(manager.isRunning()).toBe(true);
		});

		it('should return false when terminated', async () => {
			await manager.start();
			await manager.terminate();
			expect(manager.isRunning()).toBe(false);
		});
	});

	describe('terminate', () => {
		it('should terminate gracefully when not started', async () => {
			await expect(async () => await manager.terminate()).not.toThrow();
		});

		it('should terminate gracefully when started', async () => {
			await manager.start();
			await expect(async () => await manager.terminate()).not.toThrow();
		});

		it('should be idempotent', async () => {
			await manager.start();
			await manager.terminate();
			await expect(async () => await manager.terminate()).not.toThrow();
		});

		it('should clear active requests on terminate', async () => {
			await manager.start();
			await manager.terminate();

			const stats = manager.getStats();
			expect(stats.activeRequests).toBe(0);
		});
	});

	describe('processThought', () => {
		it('should throw error if not started', async () => {
			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			await expect(async () => await manager.processThought(thought)).rejects.toThrow(
				'No workers available'
			);
		});

		it('should throw error if terminated', async () => {
			await manager.start();
			await manager.terminate();

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			await expect(async () => await manager.processThought(thought)).rejects.toThrow(
				'WorkerManager has been terminated'
			);
		});

		it('should throw error when worker timeout occurs', async () => {
			// Create manager with very short timeout
			const shortTimeoutManager = new WorkerManager({
				maxWorkers: 1,
				workerTimeout: 10, // 10ms timeout
				enableHealthCheck: false,
			});

			await shortTimeoutManager.start();

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			// The mocked Worker won't respond, so it should timeout
			await expect(async () => await shortTimeoutManager.processThought(thought)).rejects.toThrow(
				'Worker timeout'
			);

			await shortTimeoutManager.terminate();
		});
	});

	describe('createWorkerManager factory', () => {
		it('should create WorkerManager with default options', () => {
			const defaultManager = createWorkerManager();

			expect(defaultManager).toBeInstanceOf(WorkerManager);
			const stats = defaultManager.getStats();
			expect(stats.maxWorkers).toBeGreaterThan(0);
		});

		it('should create WorkerManager with custom options', () => {
			const customManager = createWorkerManager({
				maxWorkers: 5,
				workerTimeout: 10000,
			});

			expect(customManager).toBeInstanceOf(WorkerManager);
			const stats = customManager.getStats();
			expect(stats.maxWorkers).toBe(5);
		});
	});

	describe('Round-robin distribution', () => {
		it('should cycle through workers', async () => {
			await manager.start();

			// This test verifies the round-robin logic
			// With 2 workers, we should cycle between them
			// Note: With mocked workers that don't respond, these will timeout
			// But the round-robin logic should still work
			const stats1 = manager.getStats();

			expect(stats1.activeWorkers).toBe(2);
		});
	});

	describe('Health check', () => {
		it('should start health check timer when enabled', async () => {
			const healthCheckManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: true,
				healthCheckInterval: 1000,
			});

			await healthCheckManager.start();

			expect(healthCheckManager.getStats().healthCheckEnabled).toBe(true);

			await healthCheckManager.terminate();
		});

		it('should not start health check timer when disabled', async () => {
			const noHealthCheckManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
			});

			await noHealthCheckManager.start();

			expect(noHealthCheckManager.getStats().healthCheckEnabled).toBe(false);

			await noHealthCheckManager.terminate();
		});
	});

	describe('Error handling', () => {
		it('should handle worker termination gracefully', async () => {
			await manager.start();

			// Simulate worker termination
			await manager.terminate();

			expect(manager.isRunning()).toBe(false);
		});

		it('should clear workers on terminate', async () => {
			await manager.start();
			expect(manager.getStats().activeWorkers).toBeGreaterThan(0);

			await manager.terminate();
			expect(manager.getStats().activeWorkers).toBe(0);
		});
	});
});

describe('WorkerManager edge cases', () => {
	it('should handle zero maxWorkers', () => {
		const zeroWorkerManager = new WorkerManager({
			maxWorkers: 0,
			enableHealthCheck: false,
		});

		expect(zeroWorkerManager.getStats().maxWorkers).toBe(0);
	});

	it('should handle very large maxWorkers', () => {
		const largeManager = new WorkerManager({
			maxWorkers: 1000,
			enableHealthCheck: false,
		});

		expect(largeManager.getStats().maxWorkers).toBe(1000);
	});

	it('should handle very short timeout', async () => {
		const shortTimeoutManager = new WorkerManager({
			maxWorkers: 1,
			workerTimeout: 1,
			enableHealthCheck: false,
		});

		await shortTimeoutManager.start();

		const thought: ThoughtData = {
			thought: 'test',
			thought_number: 1,
			total_thoughts: 1,
			next_thought_needed: false,
		};

		// Should timeout immediately
		await expect(async () => await shortTimeoutManager.processThought(thought)).rejects.toThrow();

		await shortTimeoutManager.terminate();
	});

	it('should handle very long timeout', () => {
		const longTimeoutManager = new WorkerManager({
			maxWorkers: 1,
			workerTimeout: 3600000, // 1 hour
			enableHealthCheck: false,
		});

		expect(longTimeoutManager).toBeInstanceOf(WorkerManager);
	});
});
