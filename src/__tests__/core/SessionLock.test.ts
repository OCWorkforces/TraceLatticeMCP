/**
 * Tests for SessionLock — per-session async lock used to serialize
 * ThoughtProcessor.process() calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionLock } from '../../core/SessionLock.js';
import { LockTimeoutError } from '../../errors.js';

describe('SessionLock', () => {
	let lock: SessionLock;

	beforeEach(() => {
		lock = new SessionLock();
	});

	describe('serialization', () => {
		it('serializes 100 concurrent calls on the same session', async () => {
			const order: number[] = [];
			const inFlight = { value: 0, peak: 0 };

			const tasks = Array.from({ length: 100 }, (_, i) =>
				lock.withLock('s1', async () => {
					inFlight.value++;
					inFlight.peak = Math.max(inFlight.peak, inFlight.value);
					await new Promise((r) => setTimeout(r, 0));
					order.push(i);
					inFlight.value--;
				}),
			);

			await Promise.all(tasks);

			expect(order).toHaveLength(100);
			expect(inFlight.peak).toBe(1); // only one critical section runs at a time
			expect(order).toEqual(Array.from({ length: 100 }, (_, i) => i)); // FIFO
		});

		it('alternating mutate/clear operations never interleave', async () => {
			const events: string[] = [];

			const tasks: Promise<void>[] = [];
			for (let i = 0; i < 20; i++) {
				if (i % 2 === 0) {
					tasks.push(
						lock.withLock('s1', async () => {
							events.push(`add-start-${i}`);
							await new Promise((r) => setTimeout(r, 0));
							events.push(`add-end-${i}`);
						}),
					);
				} else {
					tasks.push(
						lock.withLock('s1', async () => {
							events.push(`clear-start-${i}`);
							await new Promise((r) => setTimeout(r, 0));
							events.push(`clear-end-${i}`);
						}),
					);
				}
			}

			await Promise.all(tasks);

			// Every start must be immediately followed by its matching end.
			for (let i = 0; i < events.length; i += 2) {
				const start = events[i]!;
				const end = events[i + 1]!;
				const startSuffix = start.replace(/-start-/, '-end-');
				expect(end).toBe(startSuffix);
			}
		});
	});

	describe('per-session isolation', () => {
		it('different session ids do NOT block each other', async () => {
			let aResolve!: () => void;
			const aGate = new Promise<void>((r) => {
				aResolve = r;
			});

			let bRan = false;
			const a = lock.withLock('session-a', async () => {
				await aGate;
			});
			const b = lock.withLock('session-b', async () => {
				bRan = true;
			});

			await b;
			expect(bRan).toBe(true);

			aResolve();
			await a;
		});

		it('undefined and empty session ids share the global slot', async () => {
			const order: string[] = [];
			let aResolve!: () => void;
			const aGate = new Promise<void>((r) => {
				aResolve = r;
			});

			const a = lock.withLock(undefined, async () => {
				order.push('a-start');
				await aGate;
				order.push('a-end');
			});
			const b = lock.withLock('', async () => {
				order.push('b');
			});

			await Promise.resolve();
			await Promise.resolve();
			expect(order).toEqual(['a-start']);

			aResolve();
			await Promise.all([a, b]);
			expect(order).toEqual(['a-start', 'a-end', 'b']);
		});
	});

	describe('timeout', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it('throws LockTimeoutError when previous holder never releases', async () => {
			let _stuckResolve!: () => void;
			const stuck = lock.withLock('s1', () =>
				new Promise<void>((r) => {
					_stuckResolve = r;
				}),
			);

			const waiter = lock.withLock('s1', async () => 'never', 1000);
			// Attach a no-op rejection handler synchronously to prevent the
			// PromiseRejectionHandledWarning that fires when vitest's `rejects`
			// matcher attaches its handler in a later microtask.
			waiter.catch(() => {});

			await vi.advanceTimersByTimeAsync(1001);

			await expect(waiter).rejects.toBeInstanceOf(LockTimeoutError);
			await expect(waiter).rejects.toMatchObject({
				code: 'LOCK_TIMEOUT',
				sessionId: 's1',
				timeoutMs: 1000,
			});

			// Cleanup: release the stuck handler so the promise settles.
			_stuckResolve();
			await stuck;
		});
	});

	describe('error handling', () => {
		it('releases the lock when fn throws', async () => {
			await expect(
				lock.withLock('s1', async () => {
					throw new Error('boom');
				}),
			).rejects.toThrow('boom');

			// A subsequent call should immediately acquire.
			let ran = false;
			await lock.withLock('s1', async () => {
				ran = true;
			});
			expect(ran).toBe(true);
		});

		it('does not poison the chain when an earlier holder rejects', async () => {
			const failing = lock.withLock('s1', async () => {
				throw new Error('first failed');
			});
			const ok = lock.withLock('s1', async () => 'second-ok');

			await expect(failing).rejects.toThrow('first failed');
			await expect(ok).resolves.toBe('second-ok');
		});
	});

	describe('memory hygiene', () => {
		it('purges the lock map after release', async () => {
			expect(lock.size).toBe(0);
			await lock.withLock('s1', async () => {
				expect(lock.size).toBe(1);
			});
			// Allow microtasks to flush the deletion.
			await Promise.resolve();
			await Promise.resolve();
			expect(lock.size).toBe(0);
		});

		it('keeps map bounded under heavy churn across sessions', async () => {
			await Promise.all(
				Array.from({ length: 50 }, (_, i) =>
					lock.withLock(`s-${i}`, async () => {
						/* noop */
					}),
				),
			);
			await Promise.resolve();
			await Promise.resolve();
			expect(lock.size).toBe(0);
		});
	});
});
