import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionPool, createConnectionPool } from '../pool/ConnectionPool.js';
import type { ThoughtData } from '../core/thought.js';
import { asSessionId } from '../contracts/ids.js';

const createMockServer = () => ({
	processThought: vi.fn().mockResolvedValue({
		content: [{ type: 'text', text: 'Test response' }],
	}),
	stop: vi.fn().mockResolvedValue(undefined),
});

const createMockServerFactory = () => vi.fn().mockImplementation(async () => createMockServer());

describe('ConnectionPool', () => {
	let pool: ConnectionPool;

	beforeEach(() => {
		const serverFactory = createMockServerFactory();
		pool = new ConnectionPool({
			maxSessions: 5,
			sessionTimeout: 60000, // 1 minute
			autoCleanup: false, // Disable for most tests
			serverFactory,
		});
	});

	afterEach(async () => {
		if (pool.isRunning()) {
			await pool.terminate();
		}
	});

	describe('constructor', () => {
		it('should use default options when none provided', () => {
			const defaultPool = new ConnectionPool({ serverFactory: createMockServerFactory() });

			expect(defaultPool).toBeInstanceOf(ConnectionPool);

			const stats = defaultPool.getStats();
			expect(stats.maxSessions).toBe(100);
			expect(stats.sessionTimeout).toBe(300000);
			expect(stats.cleanupEnabled).toBe(true);

			// Cleanup for default pool
			defaultPool.terminate();
		});

		it('should use custom maxSessions', () => {
			const customPool = new ConnectionPool({
				maxSessions: 10,
				serverFactory: createMockServerFactory(),
			});
			expect(customPool.getStats().maxSessions).toBe(10);
			customPool.terminate();
		});

		it('should use custom sessionTimeout', () => {
			const customPool = new ConnectionPool({
				sessionTimeout: 120000,
				serverFactory: createMockServerFactory(),
			});
			expect(customPool.getStats().sessionTimeout).toBe(120000);
			customPool.terminate();
		});

		it('should allow disabling autoCleanup', () => {
			const noCleanupPool = new ConnectionPool({
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});
			expect(noCleanupPool.getStats().cleanupEnabled).toBe(false);
			noCleanupPool.terminate();
		});

		it('should require serverFactory to create sessions', async () => {
			const missingFactoryPool = new ConnectionPool({
				autoCleanup: false,
			});

			await expect(async () => await missingFactoryPool.createSession()).rejects.toThrow(
				'ConnectionPool requires a serverFactory option to create sessions'
			);

			await missingFactoryPool.terminate();
		});
	});

	describe('createSession', () => {
		it('should create a new session', async () => {
			const sessionId = await pool.createSession();

			expect(sessionId).toBeDefined();
			expect(typeof sessionId).toBe('string');
			expect(sessionId).toMatch(/^session_/);
		});

		it('should add session to pool', async () => {
			await pool.createSession();

			const stats = pool.getStats();
			expect(stats.totalSessions).toBe(1);
		});

		it('should throw error when max sessions reached', async () => {
			const smallPool = new ConnectionPool({
				maxSessions: 2,
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});

			await smallPool.createSession();
			await smallPool.createSession();

			await expect(async () => await smallPool.createSession()).rejects.toThrow(
				'Max sessions (2) reached'
			);

			await smallPool.terminate();
		});

		it('should throw error when terminated', async () => {
			await pool.terminate();

			await expect(async () => await pool.createSession()).rejects.toThrow(
				'ConnectionPool has been terminated'
			);
		});

		it('should create unique session IDs', async () => {
			const id1 = await pool.createSession();
			const id2 = await pool.createSession();

			expect(id1).not.toBe(id2);
		});
	});

	describe('process', () => {
		it('should process thought in existing session', async () => {
			const sessionId = await pool.createSession();

			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await pool.process(sessionId, thought);

			expect(result).toBeDefined();
			expect(result.content).toEqual([{ type: 'text', text: 'Test response' }]);
		});

		it('should throw error for non-existent session', async () => {
			const thought: ThoughtData = {
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			await expect(async () => await pool.process(asSessionId('non-existent'), thought)).rejects.toThrow(
				'Session not found'
			);
		});
	});

	describe('closeSession', () => {
		it('should close an existing session', async () => {
			const sessionId = await pool.createSession();

			expect(pool.getStats().totalSessions).toBe(1);

			await pool.closeSession(sessionId);

			expect(pool.getStats().totalSessions).toBe(0);
		});

		it('should throw error for non-existent session', async () => {
			await expect(async () => await pool.closeSession(asSessionId('non-existent'))).rejects.toThrow(
				'Session not found'
			);
		});

		it('should allow reusing session slot after closing', async () => {
			const smallPool = new ConnectionPool({
				maxSessions: 1,
				autoCleanup: false,
				serverFactory: createMockServerFactory(),
			});

			const id1 = await smallPool.createSession();
			await smallPool.closeSession(id1);

			const id2 = await smallPool.createSession();

			expect(id2).toBeDefined();
			expect(smallPool.getStats().totalSessions).toBe(1);

			await smallPool.terminate();
		});
	});

	describe('getSessionInfo', () => {
		it('should return info for existing session', async () => {
			const sessionId = await pool.createSession();

			const info = pool.getSessionInfo(sessionId);

			expect(info).toBeDefined();
			expect(info?.id).toBe(sessionId);
			expect(info?.isActive).toBe(true);
			expect(info?.createdAt).toBeDefined();
			expect(info?.lastActivityAt).toBeDefined();
		});

		it('should return undefined for non-existent session', () => {
			const info = pool.getSessionInfo(asSessionId('non-existent'));
			expect(info).toBeUndefined();
		});
	});

	describe('getActiveSessions', () => {
		it('should return all active sessions', async () => {
			await pool.createSession();
			await pool.createSession();
			await pool.createSession();

			const activeSessions = pool.getActiveSessions();

			expect(activeSessions).toHaveLength(3);
		});

		it('should return empty array when no sessions', () => {
			const activeSessions = pool.getActiveSessions();
			expect(activeSessions).toEqual([]);
		});

		it('should only include active sessions', async () => {
			const sessionId = await pool.createSession();

			let activeSessions = pool.getActiveSessions();
			expect(activeSessions).toHaveLength(1);

			// Close the session
			await pool.closeSession(sessionId);

			// Should be empty now
			activeSessions = pool.getActiveSessions();
			expect(activeSessions).toHaveLength(0);
		});
	});

	describe('getStats', () => {
		it('should return correct stats when empty', () => {
			const stats = pool.getStats();

			expect(stats.totalSessions).toBe(0);
			expect(stats.activeSessions).toBe(0);
			expect(stats.maxSessions).toBe(5);
			expect(stats.sessionTimeout).toBe(60000);
			expect(stats.cleanupEnabled).toBe(false);
		});

		it('should return correct stats with sessions', async () => {
			await pool.createSession();
			await pool.createSession();

			const stats = pool.getStats();

			expect(stats.totalSessions).toBe(2);
			expect(stats.activeSessions).toBe(2);
		});

		it('should track maxSessions correctly', () => {
			const customPool = new ConnectionPool({
				maxSessions: 50,
				serverFactory: createMockServerFactory(),
			});
			expect(customPool.getStats().maxSessions).toBe(50);
			customPool.terminate();
		});

		it('should track sessionTimeout correctly', () => {
			const customPool = new ConnectionPool({
				sessionTimeout: 120000,
				serverFactory: createMockServerFactory(),
			});
			expect(customPool.getStats().sessionTimeout).toBe(120000);
			customPool.terminate();
		});
	});

	describe('isRunning', () => {
		it('should return true when created', () => {
			expect(pool.isRunning()).toBe(true);
		});

		it('should return false when terminated', async () => {
			await pool.terminate();
			expect(pool.isRunning()).toBe(false);
		});
	});

	describe('terminate', () => {
		it('should terminate gracefully when empty', async () => {
			await expect(pool.terminate()).resolves.toBeUndefined();
		});

		it('should terminate gracefully with sessions', async () => {
			await pool.createSession();
			await pool.createSession();

			await expect(pool.terminate()).resolves.toBeUndefined();
		});

		it('should clear all sessions on terminate', async () => {
			await pool.createSession();
			await pool.createSession();

			expect(pool.getStats().totalSessions).toBe(2);

			await pool.terminate();

			expect(pool.getStats().totalSessions).toBe(0);
		});

		it('should be idempotent', async () => {
			await pool.terminate();
			await expect(pool.terminate()).resolves.toBeUndefined();
		});

		it('should prevent operations after terminate', async () => {
			await pool.terminate();

			await expect(async () => await pool.createSession()).rejects.toThrow(
				'ConnectionPool has been terminated'
			);
		});
	});

	describe('createConnectionPool factory', () => {
		it('should create ConnectionPool with default options', () => {
			const defaultPool = createConnectionPool({
				serverFactory: createMockServerFactory(),
			});

			expect(defaultPool).toBeInstanceOf(ConnectionPool);

			const stats = defaultPool.getStats();
			expect(stats.maxSessions).toBe(100);

			defaultPool.terminate();
		});

		it('should create ConnectionPool with custom options', () => {
			const customPool = createConnectionPool({
				maxSessions: 25,
				sessionTimeout: 60000,
				serverFactory: createMockServerFactory(),
			});

			expect(customPool).toBeInstanceOf(ConnectionPool);

			const stats = customPool.getStats();
			expect(stats.maxSessions).toBe(25);
			expect(stats.sessionTimeout).toBe(60000);

			customPool.terminate();
		});
	});
});

describe('ConnectionPool edge cases', () => {
	it('should handle zero maxSessions', async () => {
		const zeroPool = new ConnectionPool({
			maxSessions: 0,
			autoCleanup: false,
			serverFactory: createMockServerFactory(),
		});

		await expect(async () => await zeroPool.createSession()).rejects.toThrow(
			'Max sessions (0) reached'
		);

		await zeroPool.terminate();
	});

	it('should handle very large maxSessions', () => {
		const largePool = new ConnectionPool({
			maxSessions: 10000,
			autoCleanup: false,
			serverFactory: createMockServerFactory(),
		});

		expect(largePool.getStats().maxSessions).toBe(10000);

		largePool.terminate();
	});

	it('should handle very short sessionTimeout', async () => {
		const shortTimeoutPool = new ConnectionPool({
			sessionTimeout: 1, // 1ms
			autoCleanup: false,
			serverFactory: createMockServerFactory(),
		});

		// Session should be created but time out immediately
		const sessionId = await shortTimeoutPool.createSession();

		// Wait for timeout
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Session should still exist but be timed out
		const info = shortTimeoutPool.getSessionInfo(sessionId);
		expect(info).toBeDefined();

		await shortTimeoutPool.terminate();
	});

	it('should handle very long sessionTimeout', () => {
		const longTimeoutPool = new ConnectionPool({
			sessionTimeout: 3600000, // 1 hour
			autoCleanup: false,
			serverFactory: createMockServerFactory(),
		});

		expect(longTimeoutPool.getStats().sessionTimeout).toBe(3600000);

		longTimeoutPool.terminate();
	});
});

describe('ConnectionPool cleanup', () => {
	it('should enable cleanup by default', () => {
		const defaultPool = new ConnectionPool({ serverFactory: createMockServerFactory() });
		expect(defaultPool.getStats().cleanupEnabled).toBe(true);
		defaultPool.terminate();
	});

	it('should allow disabling cleanup', () => {
		const noCleanupPool = new ConnectionPool({
			autoCleanup: false,
			serverFactory: createMockServerFactory(),
		});
		expect(noCleanupPool.getStats().cleanupEnabled).toBe(false);
		noCleanupPool.terminate();
	});

	it('should use custom cleanup interval', () => {
		const customIntervalPool = new ConnectionPool({
			cleanupInterval: 30000, // 30 seconds
			serverFactory: createMockServerFactory(),
		});

		expect(customIntervalPool).toBeInstanceOf(ConnectionPool);

		customIntervalPool.terminate();
	});
});
