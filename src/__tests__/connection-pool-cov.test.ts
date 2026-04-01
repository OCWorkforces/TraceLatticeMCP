import { describe, it, expect, vi } from 'vitest';
import { ConnectionPool, createConnectionPool } from '../pool/ConnectionPool.js';
import type { ThoughtData } from '../core/thought.js';

const createMockServer = () => ({
	processThought: vi.fn().mockResolvedValue({
		content: [{ type: 'text', text: 'Test response' }],
	}),
	stop: vi.fn().mockResolvedValue(undefined),
});

const createMockServerFactory = () => vi.fn().mockImplementation(async () => createMockServer());

describe('ConnectionPool additional coverage', () => {
	describe('Session timeout', () => {
		it('should close session on timeout via auto cleanup', async () => {
			vi.useFakeTimers();

			const pool = new ConnectionPool({
				maxSessions: 5,
				sessionTimeout: 1000, // 1 second
				autoCleanup: true,
				cleanupInterval: 500,
				serverFactory: createMockServerFactory(),
			});

			const sessionId = await pool.createSession();
			expect(pool.getSessionInfo(sessionId)?.isActive).toBe(true);

			// Advance past timeout + cleanup interval so cleanup removes the session
			await vi.advanceTimersByTimeAsync(1500);

			// Session should be removed by cleanup
			expect(pool.getSessionInfo(sessionId)).toBeUndefined();

			await pool.terminate();
			vi.useRealTimers();
		});

		it('should reset timeout on activity', async () => {
			vi.useFakeTimers();

			const pool = new ConnectionPool({
				maxSessions: 5,
				sessionTimeout: 2000,
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});

			const sessionId = await pool.createSession();

			// Advance 1500ms (almost timeout)
			vi.advanceTimersByTime(1500);

			// Process a thought (resets timeout)
			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};
			await pool.process(sessionId, thought);

			// Advance another 1500ms - should still be active because timeout was reset
			vi.advanceTimersByTime(1500);

			expect(pool.getSessionInfo(sessionId)?.isActive).toBe(true);

			await pool.terminate();
			vi.useRealTimers();
		});

		it('should reject process on inactive session', async () => {
			const pool = new ConnectionPool({
				maxSessions: 5,
				sessionTimeout: 1000,
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});

			const sessionId = await pool.createSession();

			// Close the session
			await pool.closeSession(sessionId);

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			// Process should fail because session is closed
			// Note: SessionNotFoundError is for sessions not in pool
			// SessionNotActiveError is for inactive sessions
			await expect(pool.process(sessionId, thought)).rejects.toThrow();

			await pool.terminate();
		})
	});

	describe('auto cleanup', () => {
		it('should clean up timed-out sessions automatically', async () => {
			vi.useFakeTimers();

			const pool = new ConnectionPool({
				maxSessions: 5,
				sessionTimeout: 1000,
				autoCleanup: true,
				cleanupInterval: 500,
				serverFactory: createMockServerFactory(),
			});

			await pool.createSession();
			expect(pool.getStats().totalSessions).toBe(1);

			// Advance past timeout and cleanup interval
			vi.advanceTimersByTime(1500);

			// Session should be cleaned up
			expect(pool.getStats().totalSessions).toBe(0);

			await pool.terminate();
			vi.useRealTimers();
		})
	})

	describe('dispose', () => {
		it('should delegate to terminate', async () => {
			const pool = new ConnectionPool({
				maxSessions: 5,
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});

			await pool.createSession();
			expect(pool.isRunning()).toBe(true);

			await pool.dispose();
			expect(pool.isRunning()).toBe(false);
			expect(pool.getStats().totalSessions).toBe(0);
		})
	})

	describe('concurrent session creation', () => {
		it('should handle concurrent createSession calls', async () => {
			const pool = new ConnectionPool({
				maxSessions: 5,
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});

			const [id1, id2, id3] = await Promise.all([
				pool.createSession(),
				pool.createSession(),
				pool.createSession(),
			]);

			expect(id1).not.toBe(id2);
			expect(id2).not.toBe(id3);
			expect(pool.getStats().totalSessions).toBe(3);

			await pool.terminate();
		})
	})

	describe('session isTimedOut', () => {
		it('should detect timed-out session via auto cleanup', async () => {
			vi.useFakeTimers();

			const pool = new ConnectionPool({
				maxSessions: 5,
				sessionTimeout: 100,
				autoCleanup: true,
				cleanupInterval: 50,
				serverFactory: createMockServerFactory(),
			});

			const sessionId = await pool.createSession();
			const session = pool.getSessionInfo(sessionId);

			// Not timed out yet
			expect(session?.isActive).toBe(true);

			// Wait past timeout + cleanup interval
			await vi.advanceTimersByTimeAsync(200);

			// Session should be cleaned up (removed from pool)
			expect(pool.getSessionInfo(sessionId)).toBeUndefined();

			await pool.terminate();
			vi.useRealTimers();
		});
	});

	describe('error handling in terminate', () => {
		it('should handle errors when closing sessions during terminate', async () => {
			const failingFactory = vi.fn().mockImplementation(async () => ({
				processThought: vi.fn().mockResolvedValue({
					content: [{ type: 'text', text: 'test' }],
				}),
				stop: vi.fn().mockRejectedValue(new Error('Stop failed')),
			}));

			const pool = new ConnectionPool({
				maxSessions: 5,
				autoCleanup: false,
				serverFactory: failingFactory,
			});

			await pool.createSession();

			// Should not throw even if stop fails
			await expect(pool.terminate()).resolves.toBeUndefined();
		})
	})

	describe('createConnectionPool factory', () => {
		it('should create pool with all options', () => {
			const pool = createConnectionPool({
				maxSessions: 50,
				sessionTimeout: 60000,
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});

			expect(pool).toBeInstanceOf(ConnectionPool);
			expect(pool.getStats().maxSessions).toBe(50);

			pool.terminate();
		})
	})
});
