/**
 * Tests for session ownership tracking on HistoryManager.
 *
 * WU-3.1: Bind each session_id to an owner identifier on first creation.
 * Reject cross-owner access. Stdio path (no owner) stays unaffected.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runWithContext } from '../../context/RequestContext.js';
import { HistoryManager } from '../../core/HistoryManager.js';
import { SessionAccessDeniedError, ERROR_CODES, isErrorCode } from '../../errors.js';
import { createTestThought } from '../helpers/factories.js';

describe('HistoryManager — session ownership', () => {
	let hm: HistoryManager;

	beforeEach(() => {
		hm = new HistoryManager();
	});

	afterEach(async () => {
		await hm.shutdown();
	});

	describe('stdio path (no owner in context)', () => {
		it('allows access to any session when no owner is set', () => {
			hm.addThought(createTestThought({ session_id: 'session-A', thought: 'a' }));
			hm.addThought(createTestThought({ session_id: 'session-B', thought: 'b' }));

			expect(hm.getHistoryLength('session-A')).toBe(1);
			expect(hm.getHistoryLength('session-B')).toBe(1);
		});

		it('does not bind an owner when accessed without context', () => {
			hm.addThought(createTestThought({ session_id: 's1' }));
			// Subsequent stdio access still works
			expect(() => hm.getHistory('s1')).not.toThrow();
		});
	});

	describe('multi-user transport path (owner in context)', () => {
		it('binds owner on first access and allows the same owner to re-access', () => {
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1', thought: 'a1' }));
			});

			runWithContext({ requestId: 'r2', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1', thought: 'a2' }));
				expect(hm.getHistoryLength('s1')).toBe(2);
			});
		});

		it('throws SessionAccessDeniedError when a different owner accesses', () => {
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1' }));
			});

			expect(() =>
				runWithContext({ requestId: 'r2', owner: 'user-B' }, () => {
					hm.getHistory('s1');
				}),
			).toThrow(SessionAccessDeniedError);
		});

		it('error contains correct sessionId, expectedOwner, and actualOwner', () => {
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1' }));
			});

			try {
				runWithContext({ requestId: 'r2', owner: 'user-B' }, () => {
					hm.getHistory('s1');
				});
				expect.fail('expected SessionAccessDeniedError to be thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(SessionAccessDeniedError);
				const e = err as SessionAccessDeniedError;
				expect(e.sessionId).toBe('s1');
				expect(e.expectedOwner).toBe('user-A');
				expect(e.actualOwner).toBe('user-B');
				expect(e.code).toBe(ERROR_CODES.SESSION_ACCESS_DENIED);
				expect(isErrorCode(err, ERROR_CODES.SESSION_ACCESS_DENIED)).toBe(true);
			}
		});

		it('addThought throws when a different owner attempts to write', () => {
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1' }));
			});

			expect(() =>
				runWithContext({ requestId: 'r2', owner: 'user-B' }, () => {
					hm.addThought(createTestThought({ session_id: 's1', thought: 'intrusion' }));
				}),
			).toThrow(SessionAccessDeniedError);
		});

		it('two different owners on the same session ID: second is denied', () => {
			runWithContext({ requestId: 'r1', owner: 'alice' }, () => {
				hm.addThought(createTestThought({ session_id: 'shared' }));
			});

			expect(() =>
				runWithContext({ requestId: 'r2', owner: 'bob' }, () => {
					hm.addThought(createTestThought({ session_id: 'shared' }));
				}),
			).toThrow(SessionAccessDeniedError);
		});

		it('isolates ownership per session — owner-A can still access their own other session', () => {
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1' }));
				hm.addThought(createTestThought({ session_id: 's2', thought_number: 1 }));
			});

			runWithContext({ requestId: 'r2', owner: 'user-A' }, () => {
				expect(hm.getHistoryLength('s1')).toBe(1);
				expect(hm.getHistoryLength('s2')).toBe(1);
			});

			expect(() =>
				runWithContext({ requestId: 'r3', owner: 'user-B' }, () => {
					hm.getHistory('s1');
				}),
			).toThrow(SessionAccessDeniedError);
		});

		it('all owner-aware read methods enforce ownership', () => {
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1' }));
				hm.registerBranch('s1', 'feature-x');
			});

			runWithContext({ requestId: 'r2', owner: 'user-B' }, () => {
				expect(() => hm.getHistory('s1')).toThrow(SessionAccessDeniedError);
				expect(() => hm.getHistoryLength('s1')).toThrow(SessionAccessDeniedError);
				expect(() => hm.getBranches('s1')).toThrow(SessionAccessDeniedError);
				expect(() => hm.getBranchIds('s1')).toThrow(SessionAccessDeniedError);
				expect(() => hm.branchExists('s1', 'feature-x')).toThrow(SessionAccessDeniedError);
				expect(() => hm.getAvailableMcpTools('s1')).toThrow(SessionAccessDeniedError);
				expect(() => hm.getAvailableSkills('s1')).toThrow(SessionAccessDeniedError);
				expect(() => hm.getBranch('feature-x', 's1')).toThrow(SessionAccessDeniedError);
				expect(() => hm.registerBranch('s1', 'other')).toThrow(SessionAccessDeniedError);
			});
		});
	});

	describe('mixed access — owner promotion of stdio-created session', () => {
		it('binds owner when an owner-aware caller first accesses a stdio-created session', () => {
			// Stdio creates the session (no owner)
			hm.addThought(createTestThought({ session_id: 's1' }));

			// First owner-aware access binds the owner
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				expect(hm.getHistoryLength('s1')).toBe(1);
			});

			// Subsequent different owner is denied
			expect(() =>
				runWithContext({ requestId: 'r2', owner: 'user-B' }, () => {
					hm.getHistory('s1');
				}),
			).toThrow(SessionAccessDeniedError);
		});

		it('owner=undefined accessing an owned session is allowed (stdio bypass)', () => {
			runWithContext({ requestId: 'r1', owner: 'user-A' }, () => {
				hm.addThought(createTestThought({ session_id: 's1' }));
			});

			// No-context access (stdio) reads the session without rejection
			expect(() => hm.getHistory('s1')).not.toThrow();
			expect(hm.getHistoryLength('s1')).toBe(1);
		});
	});
});
