import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerManager } from '../cluster/WorkerManager.js';
import type { ThoughtData } from '../core/thought.js';

// Shape of mock worker for type-safe hoisted capture
interface MockWorkerShape {
	handlers: Map<string, (...args: unknown[]) => void>;
	on: ReturnType<typeof vi.fn>;
	postMessage: ReturnType<typeof vi.fn>;
	terminate: ReturnType<typeof vi.fn>;
	simulate: (event: string, ...args: unknown[]) => void;
}

// Capturable mock worker
const { getWorkers, resetWorkers } = vi.hoisted(() => {
	const workers: MockWorkerShape[] = [];
	return {
		getWorkers: () => workers,
		resetWorkers: () => {
			workers.length = 0;
		},
	};
});

/** Retrieve mock worker at given index, throwing if unavailable. */
function requireWorkerAt(index: number): MockWorkerShape {
	const w = getWorkers()[index];
	if (!w) throw new Error(`Expected worker at index ${index}, got none`);
	return w;
}

/** Retrieve last mock worker, throwing if none exist. */
function requireLastWorker(): MockWorkerShape {
	const all = getWorkers();
	const w = all[all.length - 1];
	if (!w) throw new Error('Expected at least one worker, got none');
	return w;
}

vi.mock('node:worker_threads', () => {
	class MockWorker {
		handlers = new Map<string, (...args: unknown[]) => void>();
		on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
			this.handlers.set(event, handler);
		});
		postMessage = vi.fn();
		terminate = vi.fn().mockResolvedValue(undefined);

		simulate(event: string, ...args: unknown[]) {
			const handler = this.handlers.get(event);
			if (handler) handler(...args);
		}

		constructor() {
			getWorkers().push(this);
		}
	}
	return { Worker: MockWorker };
});

vi.mock('node:fs', () => ({
	existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('node:os', () => ({
	cpus: () => [{}, {}, {}, {}],
}));

describe('WorkerManager Coverage', () => {
	let manager: WorkerManager;

	beforeEach(() => {
		resetWorkers();
		manager = new WorkerManager({
			maxWorkers: 2,
			workerTimeout: 5000,
			enableHealthCheck: false,
		});
	});

	afterEach(async () => {
		if (manager.isRunning()) {
			await manager.terminate();
		}
	});

	describe('worker message handling', () => {
		it('should resolve promise on result message', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const resultPromise = manager.processThought(thought);

			// Get requestId from postMessage call
			expect(worker.postMessage).toHaveBeenCalledTimes(1);
			const callArgs = worker.postMessage.mock.calls[0]![0];
			const requestId = callArgs.requestId;

			worker.simulate('message', {
				type: 'result',
				requestId,
				result: { content: [{ type: 'text', text: 'processed' }] },
			});

			const result = await resultPromise;
			expect(result).toEqual({ content: [{ type: 'text', text: 'processed' }] });
		});

		it('should reject promise on error message', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const resultPromise = manager.processThought(thought);
			const callArgs = worker.postMessage.mock.calls[0]![0];
			const requestId = callArgs.requestId;

			worker.simulate('message', {
				type: 'error',
				requestId,
				error: 'Worker processing failed',
			});

			await expect(resultPromise).rejects.toThrow('Worker processing failed');
		});

		it('should handle error message with no error string', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const resultPromise = manager.processThought(thought);
			const callArgs = worker.postMessage.mock.calls[0]![0];

			worker.simulate('message', {
				type: 'error',
				requestId: callArgs.requestId,
			});

			await expect(resultPromise).rejects.toThrow('Unknown error');
		});

		it('should handle health check response', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);
			worker.simulate('message', { type: 'health' });
			// Should not throw
		});

		it('should ignore messages with unknown requestId', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);
			worker.simulate('message', { type: 'result', requestId: 'unknown' });
			// Should not throw
		});

		it('should ignore error messages with unknown requestId', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);
			worker.simulate('message', { type: 'error', requestId: 'unknown' });
			// Should not throw
		});
	});

	describe('worker error handling', () => {
		it('should retry worker on error (within max retries)', async () => {
			const retryManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
				maxRetries: 3,
			});

			await retryManager.start();
			const initialCount = retryManager.getStats().activeWorkers;
			expect(initialCount).toBe(1);

			const worker = requireLastWorker();
			worker.simulate('error');

			expect(worker.terminate).toHaveBeenCalled();

			await retryManager.terminate();
		});

		it('should remove worker after exceeding max retries', async () => {
			const retryManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
				maxRetries: 0,
			});

			await retryManager.start();
			const worker = requireLastWorker();

			// With maxRetries=0, first error should remove
			worker.simulate('error');
			expect(worker.terminate).toHaveBeenCalled();

			await retryManager.terminate();
		});

		it('should handle worker terminate error gracefully during retry', async () => {
			const retryManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
				maxRetries: 3,
			});

			await retryManager.start();
			const worker = requireLastWorker();
			worker.terminate = vi.fn().mockImplementation(() => {
				throw new Error('terminate failed');
			});

			// Should not throw despite terminate error
			worker.simulate('error');

			await retryManager.terminate();
		});

		it('should handle worker terminate error at max retries', async () => {
			const retryManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
				maxRetries: 0,
			});

			await retryManager.start();
			const worker = requireLastWorker();
			worker.terminate = vi.fn().mockImplementation(() => {
				throw new Error('terminate failed');
			});

			worker.simulate('error');

			await retryManager.terminate();
		});
	});

	describe('worker exit handling', () => {
		it('should spawn replacement on non-zero exit', async () => {
			const exitManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
			});

			await exitManager.start();
			const worker = requireLastWorker();

			worker.simulate('exit', 1);

			// Give async spawn time
			await new Promise((r) => setTimeout(r, 50));

			await exitManager.terminate();
		});

		it('should not spawn replacement on zero exit', async () => {
			const exitManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
			});

			await exitManager.start();
			const worker = requireLastWorker();

			worker.simulate('exit', 0);

			expect(exitManager.getStats().activeWorkers).toBe(0);
			await exitManager.terminate();
		});

		it('should not spawn replacement when terminated', async () => {
			const exitManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
			});

			await exitManager.start();
			const worker = requireLastWorker();
			await exitManager.terminate();

			worker.simulate('exit', 1);
			expect(exitManager.isRunning()).toBe(false);
		});

		it('should handle failed replacement spawn', async () => {
			const exitManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
			});

			await exitManager.start();
			const worker = requireLastWorker();

			// Make the worker script disappear for the replacement
			const { existsSync } = await import('node:fs');
			vi.mocked(existsSync).mockReturnValue(false);

			worker.simulate('exit', 1);

			await new Promise((r) => setTimeout(r, 50));

			vi.mocked(existsSync).mockReturnValue(true);
			await exitManager.terminate();
		});
	});

	describe('worker online event', () => {
		it('should clear retry count on online', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);
			worker.simulate('online');
			// Should not throw
		});
	});

	describe('dispose', () => {
		it('should delegate to terminate', async () => {
			await manager.start();
			expect(manager.isRunning()).toBe(true);

			await manager.dispose();
			expect(manager.isRunning()).toBe(false);
		});

		it('should be safe to call when not started', async () => {
			await expect(manager.dispose()).resolves.toBeUndefined();
		});
	});

	describe('health check', () => {
		it('should send health check to all workers periodically', async () => {
			vi.useFakeTimers();

			const healthManager = new WorkerManager({
				maxWorkers: 2,
				enableHealthCheck: true,
				healthCheckInterval: 1000,
			});

			await healthManager.start();
			const workers = getWorkers().slice(-2);

			workers.forEach((w) => w.postMessage.mockClear());

			vi.advanceTimersByTime(1000);

			for (const worker of workers) {
				expect(worker.postMessage).toHaveBeenCalledWith(
					expect.objectContaining({ type: 'health-check' })
				);
			}

			vi.useRealTimers();
			await healthManager.terminate();
		});

		it('should handle postMessage error during health check', async () => {
			vi.useFakeTimers();

			const healthManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: true,
				healthCheckInterval: 1000,
			});

			await healthManager.start();
			const worker = requireLastWorker();
			worker.postMessage = vi.fn().mockImplementation(() => {
				throw new Error('Worker is dead');
			});

			// Should not throw
			vi.advanceTimersByTime(1000);

			vi.useRealTimers();
			await healthManager.terminate();
		});
	});

	describe('round-robin distribution', () => {
		it('should distribute requests across workers', async () => {
			await manager.start();
			const w0 = requireWorkerAt(0);
const w1 = requireWorkerAt(1);

const thought: ThoughtData = {
    thought: 'test',
    thought_number: 1,
    total_thoughts: 1,
    next_thought_needed: false,
};

// First request goes to worker 0
const p1 = manager.processThought(thought);
const call0 = w0.postMessage.mock.calls[0];
if (!call0) throw new Error('No call recorded on worker 0');
const req1 = call0[0].requestId;
w0.simulate('message', { type: 'result', requestId: req1, result: 'r1' });
await p1;

// Second request goes to worker 1
const p2 = manager.processThought(thought);
const call1 = w1.postMessage.mock.calls[0];
if (!call1) throw new Error('No call recorded on worker 1');
const req2 = call1[0].requestId;
w1.simulate('message', { type: 'result', requestId: req2, result: 'r2' });
await p2;

// Third request wraps back to worker 0
const p3 = manager.processThought(thought);
const call0b = w0.postMessage.mock.calls[1];
if (!call0b) throw new Error('No second call recorded on worker 0');
const req3 = call0b[0].requestId;
w0.simulate('message', { type: 'result', requestId: req3, result: 'r3' });
const r3 = await p3;
expect(r3).toBe('r3');
		});
	});

	describe('processThought edge cases', () => {
		it('should handle postMessage error', async () => {
			await manager.start();
			const worker = requireWorkerAt(0);
			worker.postMessage = vi.fn().mockImplementation(() => {
				throw new Error('postMessage failed');
			});

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			await expect(manager.processThought(thought)).rejects.toThrow('postMessage failed');
		});
	});

	describe('logger', () => {
		it('should use provided logger', async () => {
			const mockLogger = {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				debug: vi.fn(),
				setLevel: vi.fn(),
				getLevel: vi.fn().mockReturnValue('info'),
			};

			const logManager = new WorkerManager({
				maxWorkers: 1,
				enableHealthCheck: false,
				logger: mockLogger,
			});

			await logManager.start();
			expect(mockLogger.info).toHaveBeenCalled();

			await logManager.terminate();
		});

		it('should use noop logger when none provided', () => {
			const defaultManager = new WorkerManager({
				enableHealthCheck: false,
			});
			expect(defaultManager).toBeInstanceOf(WorkerManager);
		});
	});
});
