/**
 * Tests for SessionManager — per-owner LRU + global LRU eviction policy.
 *
 * Covers WU-3.3: per-owner session quota prevents one attacker from churning
 * sessions and evicting legitimate users' sessions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager, type SessionLike } from '../../core/SessionManager.js';

interface TestSession extends SessionLike {
	id: string;
}

const DEFAULT_ID = '__global__';

function makeManager(opts?: { maxSessions?: number; maxSessionsPerOwner?: number }): SessionManager<TestSession> {
	return new SessionManager<TestSession>({
		defaultSessionId: DEFAULT_ID,
		sessionTtlMs: 60_000,
		cleanupIntervalMs: 60_000,
		getMaxSessions: () => opts?.maxSessions ?? 1000,
		maxSessionsPerOwner: opts?.maxSessionsPerOwner ?? 50,
	});
}

function fillSessions(
	owner: string | undefined,
	count: number,
	startTime: number,
	prefix: string
): Map<string, TestSession> {
	const map = new Map<string, TestSession>();
	for (let i = 0; i < count; i++) {
		map.set(`${prefix}-${i}`, {
			id: `${prefix}-${i}`,
			lastAccessedAt: startTime + i,
			owner,
		});
	}
	return map;
}

describe('SessionManager — per-owner LRU eviction', () => {
	let now: number;

	beforeEach(() => {
		now = Date.now();
	});

	it('evicts oldest sessions of an over-quota owner only (own bucket)', () => {
		const mgr = makeManager({ maxSessions: 1000, maxSessionsPerOwner: 50 });
		const sessions = new Map<string, TestSession>();

		// Owner A: 60 sessions (10 over quota)
		for (let i = 0; i < 60; i++) {
			sessions.set(`a-${i}`, { id: `a-${i}`, lastAccessedAt: now + i, owner: 'A' });
		}
		// Owner B: 30 sessions (under quota)
		for (let i = 0; i < 30; i++) {
			sessions.set(`b-${i}`, { id: `b-${i}`, lastAccessedAt: now + 1000 + i, owner: 'B' });
		}

		mgr.evictExcessSessions(sessions);

		// Owner A: oldest 10 evicted -> a-0..a-9 gone, a-10..a-59 remain (50)
		for (let i = 0; i < 10; i++) {
			expect(sessions.has(`a-${i}`)).toBe(false);
		}
		for (let i = 10; i < 60; i++) {
			expect(sessions.has(`a-${i}`)).toBe(true);
		}
		// Owner B: untouched
		for (let i = 0; i < 30; i++) {
			expect(sessions.has(`b-${i}`)).toBe(true);
		}
	});

	it('two owners each filling exactly to quota — neither evicts the other', () => {
		const mgr = makeManager({ maxSessions: 1000, maxSessionsPerOwner: 5 });
		const sessions = new Map<string, TestSession>();

		for (let i = 0; i < 5; i++) {
			sessions.set(`a-${i}`, { id: `a-${i}`, lastAccessedAt: now + i, owner: 'A' });
			sessions.set(`b-${i}`, { id: `b-${i}`, lastAccessedAt: now + 100 + i, owner: 'B' });
		}

		mgr.evictExcessSessions(sessions);

		expect(sessions.size).toBe(10);
		for (let i = 0; i < 5; i++) {
			expect(sessions.has(`a-${i}`)).toBe(true);
			expect(sessions.has(`b-${i}`)).toBe(true);
		}
	});

	it('owner exceeding quota evicts only own oldest sessions, not other owners', () => {
		const mgr = makeManager({ maxSessions: 1000, maxSessionsPerOwner: 3 });
		const sessions = new Map<string, TestSession>();

		// Attacker owner X: 10 sessions (7 over quota)
		for (let i = 0; i < 10; i++) {
			sessions.set(`x-${i}`, { id: `x-${i}`, lastAccessedAt: now + i, owner: 'X' });
		}
		// Legitimate owner Y: 3 sessions (at quota)
		for (let i = 0; i < 3; i++) {
			sessions.set(`y-${i}`, { id: `y-${i}`, lastAccessedAt: now + 50 + i, owner: 'Y' });
		}

		mgr.evictExcessSessions(sessions);

		// X: oldest 7 gone (x-0..x-6), x-7..x-9 remain
		for (let i = 0; i < 7; i++) {
			expect(sessions.has(`x-${i}`)).toBe(false);
		}
		for (let i = 7; i < 10; i++) {
			expect(sessions.has(`x-${i}`)).toBe(true);
		}
		// Y: all retained
		for (let i = 0; i < 3; i++) {
			expect(sessions.has(`y-${i}`)).toBe(true);
		}
	});

	it('sessions without an owner (stdio) are exempt from per-owner quota', () => {
		const mgr = makeManager({ maxSessions: 1000, maxSessionsPerOwner: 5 });
		const sessions = fillSessions(undefined, 100, now, 'stdio');

		mgr.evictExcessSessions(sessions);

		// All 100 retained — under global cap (1000), no per-owner cap applied
		expect(sessions.size).toBe(100);
	});

	it('global cap still applies and falls back to global LRU', () => {
		const mgr = makeManager({ maxSessions: 50, maxSessionsPerOwner: 1000 });
		const sessions = fillSessions(undefined, 60, now, 's');

		mgr.evictExcessSessions(sessions);

		expect(sessions.size).toBe(50);
		// Oldest 10 evicted
		for (let i = 0; i < 10; i++) {
			expect(sessions.has(`s-${i}`)).toBe(false);
		}
		for (let i = 10; i < 60; i++) {
			expect(sessions.has(`s-${i}`)).toBe(true);
		}
	});

	it('default session is never evicted (per-owner stage)', () => {
		const mgr = makeManager({ maxSessions: 1000, maxSessionsPerOwner: 1 });
		const sessions = new Map<string, TestSession>();
		// Default session is owner-less — exempt anyway, but make sure it's present
		sessions.set(DEFAULT_ID, {
			id: DEFAULT_ID,
			lastAccessedAt: 0, // very old
			owner: undefined,
		});
		// Owner A overflows
		for (let i = 0; i < 5; i++) {
			sessions.set(`a-${i}`, { id: `a-${i}`, lastAccessedAt: now + i, owner: 'A' });
		}

		mgr.evictExcessSessions(sessions);

		expect(sessions.has(DEFAULT_ID)).toBe(true);
	});

	it('default session is never evicted (global stage)', () => {
		const mgr = makeManager({ maxSessions: 3, maxSessionsPerOwner: 1000 });
		const sessions = new Map<string, TestSession>();
		sessions.set(DEFAULT_ID, {
			id: DEFAULT_ID,
			lastAccessedAt: 0, // oldest
			owner: undefined,
		});
		for (let i = 0; i < 10; i++) {
			sessions.set(`s-${i}`, { id: `s-${i}`, lastAccessedAt: now + i, owner: undefined });
		}

		mgr.evictExcessSessions(sessions);

		// Default kept; global cap of 3 enforced over total -> 3 retained including default
		expect(sessions.has(DEFAULT_ID)).toBe(true);
		expect(sessions.size).toBe(3); // default + 2 newest
	});

	it('per-owner eviction respects lastAccessedAt order', () => {
		const mgr = makeManager({ maxSessions: 1000, maxSessionsPerOwner: 2 });
		const sessions = new Map<string, TestSession>();

		// Insert out-of-order timestamps for owner A
		sessions.set('a-newest', { id: 'a-newest', lastAccessedAt: now + 300, owner: 'A' });
		sessions.set('a-oldest', { id: 'a-oldest', lastAccessedAt: now + 100, owner: 'A' });
		sessions.set('a-mid', { id: 'a-mid', lastAccessedAt: now + 200, owner: 'A' });
		sessions.set('a-ancient', { id: 'a-ancient', lastAccessedAt: now + 50, owner: 'A' });

		mgr.evictExcessSessions(sessions);

		// Quota 2 -> evict oldest 2 (ancient, oldest) -> retain (mid, newest)
		expect(sessions.has('a-ancient')).toBe(false);
		expect(sessions.has('a-oldest')).toBe(false);
		expect(sessions.has('a-mid')).toBe(true);
		expect(sessions.has('a-newest')).toBe(true);
	});

	it('default maxSessionsPerOwner is 50 when not configured', () => {
		const mgr = new SessionManager<TestSession>({
			defaultSessionId: DEFAULT_ID,
			sessionTtlMs: 60_000,
			cleanupIntervalMs: 60_000,
			getMaxSessions: () => 1000,
		});
		const sessions = new Map<string, TestSession>();
		for (let i = 0; i < 60; i++) {
			sessions.set(`a-${i}`, { id: `a-${i}`, lastAccessedAt: now + i, owner: 'A' });
		}
		mgr.evictExcessSessions(sessions);
		// 50 per-owner default -> 10 evicted
		expect(sessions.size).toBe(50);
	});
});

describe('SessionManager — config integration via HistoryManager path', () => {
	it('SESSION_MAX_PER_OWNER env var flows through ConfigLoader → ServerConfig', async () => {
		const { ConfigLoader } = await import('../../config/ConfigLoader.js');
		const { ServerConfig } = await import('../../ServerConfig.js');

		const prev = process.env.SESSION_MAX_PER_OWNER;
		process.env.SESSION_MAX_PER_OWNER = '7';
		try {
			const loader = new ConfigLoader();
			const fileConfig = loader.load() ?? {};
			const config = new ServerConfig({
				maxSessionsPerOwner: fileConfig.maxSessionsPerOwner,
			});
			expect(config.maxSessionsPerOwner).toBe(7);
		} finally {
			if (prev === undefined) delete process.env.SESSION_MAX_PER_OWNER;
			else process.env.SESSION_MAX_PER_OWNER = prev;
		}
	});

	it('ServerConfig.toJSON exposes maxSessionsPerOwner', async () => {
		const { ServerConfig } = await import('../../ServerConfig.js');
		const cfg = new ServerConfig({ maxSessionsPerOwner: 25 });
		expect(cfg.toJSON().maxSessionsPerOwner).toBe(25);
	});

	it('ServerConfig validates maxSessionsPerOwner bounds', async () => {
		const { ServerConfig } = await import('../../ServerConfig.js');
		const { ConfigurationError } = await import('../../errors.js');
		expect(() => new ServerConfig({ maxSessionsPerOwner: 0 })).toThrow(ConfigurationError);
		expect(() => new ServerConfig({ maxSessionsPerOwner: 10001 })).toThrow(ConfigurationError);
		expect(() => new ServerConfig({ maxSessionsPerOwner: NaN })).toThrow(ConfigurationError);
	});
});
