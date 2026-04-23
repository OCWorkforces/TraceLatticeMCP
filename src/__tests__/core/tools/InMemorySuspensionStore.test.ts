import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemorySuspensionStore } from '../../../core/tools/InMemorySuspensionStore.js';
import { asSessionId } from '../../../contracts/ids.js';

describe('InMemorySuspensionStore', () => {
	let store: InMemorySuspensionStore;

	beforeEach(() => {
		store = new InMemorySuspensionStore({ ttlMs: 60_000, sweepIntervalMs: 60_000 });
	});

	afterEach(() => {
		store.stop();
	});

	it('suspend() returns a fully populated record with token, createdAt, and expiresAt', () => {
		const before = Date.now();
		const rec = store.suspend({
			sessionId: asSessionId('s1'),
			toolCallThoughtNumber: 3,
			toolName: 'search',
			toolArguments: { q: 'foo' },
			expiresAt: 0,
		});
		expect(typeof rec.token).toBe('string');
		expect(rec.token.length).toBeGreaterThan(0);
		expect(rec.sessionId).toBe('s1');
		expect(rec.toolCallThoughtNumber).toBe(3);
		expect(rec.toolName).toBe('search');
		expect(rec.toolArguments).toEqual({ q: 'foo' });
		expect(rec.createdAt).toBeGreaterThanOrEqual(before);
		expect(rec.expiresAt).toBeGreaterThan(rec.createdAt);
		expect(rec.expiresAt - rec.createdAt).toBe(60_000);
	});

	it('suspend() with explicit ttlMs overrides the default', () => {
		const rec = store.suspend({
			sessionId: asSessionId('s1'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			ttlMs: 5_000,
			expiresAt: 0,
		});
		expect(rec.expiresAt - rec.createdAt).toBe(5_000);
	});

	it('resume() returns the record once and removes it (single-use)', () => {
		const rec = store.suspend({
			sessionId: asSessionId('s1'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			expiresAt: 0,
		});
		const first = store.resume(rec.token);
		expect(first).not.toBeNull();
		expect(first?.token).toBe(rec.token);
		const second = store.resume(rec.token);
		expect(second).toBeNull();
	});

	it('resume() returns null and deletes the record when expired', () => {
		const rec = store.suspend({
			sessionId: asSessionId('s1'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			ttlMs: 1,
			expiresAt: 0,
		});
		const realNow = Date.now();
		const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 10_000);
		try {
			expect(store.resume(rec.token)).toBeNull();
			// After expired resume, record is gone; subsequent peek returns null too.
			expect(store.peek(rec.token)).toBeNull();
		} finally {
			spy.mockRestore();
		}
	});

	it('peek() is non-destructive and returns expired records as-is', () => {
		const rec = store.suspend({
			sessionId: asSessionId('s1'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			ttlMs: 1,
			expiresAt: 0,
		});
		const realNow = Date.now();
		const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 10_000);
		try {
			const peeked = store.peek(rec.token);
			expect(peeked).not.toBeNull();
			expect(peeked?.token).toBe(rec.token);
			// Peek again — still present (not consumed).
			expect(store.peek(rec.token)).not.toBeNull();
		} finally {
			spy.mockRestore();
		}
	});

	it('peek() returns null for unknown tokens', () => {
		expect(store.peek('nonexistent-token')).toBeNull();
	});

	it('expireOlderThan() removes expired records and returns the count', () => {
		const r1 = store.suspend({
			sessionId: asSessionId('s1'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			ttlMs: 1,
			expiresAt: 0,
		});
		const r2 = store.suspend({
			sessionId: asSessionId('s1'),
			toolCallThoughtNumber: 2,
			toolName: 't',
			toolArguments: {},
			ttlMs: 60_000,
			expiresAt: 0,
		});
		const removed = store.expireOlderThan(Date.now() + 10_000);
		// r1 expired, r2 still valid relative to (now+10s) since ttl=60s
		expect(removed).toBe(1);
		expect(store.peek(r1.token)).toBeNull();
		expect(store.peek(r2.token)).not.toBeNull();
	});

	it('clearSession() removes only the targeted session', () => {
		store.suspend({
			sessionId: asSessionId('sA'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			expiresAt: 0,
		});
		store.suspend({
			sessionId: asSessionId('sA'),
			toolCallThoughtNumber: 2,
			toolName: 't',
			toolArguments: {},
			expiresAt: 0,
		});
		store.suspend({
			sessionId: asSessionId('sB'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			expiresAt: 0,
		});
		expect(store.size('sA')).toBe(2);
		expect(store.size('sB')).toBe(1);
		store.clearSession('sA');
		expect(store.size('sA')).toBe(0);
		expect(store.size('sB')).toBe(1);
	});

	it('size() returns global total when no session id is provided, and per-session count otherwise', () => {
		expect(store.size()).toBe(0);
		store.suspend({
			sessionId: asSessionId('sA'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			expiresAt: 0,
		});
		store.suspend({
			sessionId: asSessionId('sB'),
			toolCallThoughtNumber: 1,
			toolName: 't',
			toolArguments: {},
			expiresAt: 0,
		});
		expect(store.size()).toBe(2);
		expect(store.size('sA')).toBe(1);
		expect(store.size('sB')).toBe(1);
		expect(store.size('unknown')).toBe(0);
	});

	it('start() and stop() are idempotent', () => {
		expect(() => {
			store.start();
			store.start();
			store.stop();
			store.stop();
		}).not.toThrow();
	});
});
