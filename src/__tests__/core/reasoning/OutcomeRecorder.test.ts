/**
 * Tests for OutcomeRecorder no-op and recording behavior.
 */

import { describe, expect, it } from 'vitest';
import { OutcomeRecorder } from '../../../core/reasoning/OutcomeRecorder.js';

function makeOutcome(overrides: Partial<Parameters<OutcomeRecorder['recordVerification']>[0]> = {}) {
	return {
		thoughtId: 't1',
		thoughtNumber: 1,
		sessionId: 'session-a',
		predicted: 0.8,
		actual: 1 as 0 | 1,
		type: 'verification',
		...overrides,
	};
}

describe('OutcomeRecorder', () => {
	it('returns empty outcomes when disabled', () => {
		const recorder = new OutcomeRecorder({ enabled: false });
		expect(recorder.getOutcomes('session-a')).toEqual([]);
	});

	it('recordVerification is no-op when disabled', () => {
		const recorder = new OutcomeRecorder({ enabled: false });
		recorder.recordVerification(makeOutcome());
		expect(recorder.getOutcomes('session-a')).toEqual([]);
		expect(recorder.getAllOutcomes()).toEqual([]);
	});

	it('records outcome when enabled', () => {
		const recorder = new OutcomeRecorder({ enabled: true });
		recorder.recordVerification(makeOutcome());
		const outcomes = recorder.getOutcomes('session-a');
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0]).toMatchObject({
			thoughtId: 't1',
			thoughtNumber: 1,
			sessionId: 'session-a',
			predicted: 0.8,
			actual: 1,
			type: 'verification',
		});
	});

	it('auto-sets recordedAt timestamp', () => {
		const recorder = new OutcomeRecorder({ enabled: true });
		const before = Date.now();
		recorder.recordVerification(makeOutcome());
		const outcomes = recorder.getOutcomes('session-a');
		expect(outcomes[0]?.recordedAt).toBeGreaterThanOrEqual(before);
		expect(outcomes[0]?.recordedAt).toBeLessThanOrEqual(Date.now());
	});

	it('scopes outcomes per session', () => {
		const recorder = new OutcomeRecorder({ enabled: true });
		recorder.recordVerification(makeOutcome({ sessionId: 'A', thoughtId: 'a1' }));
		recorder.recordVerification(makeOutcome({ sessionId: 'B', thoughtId: 'b1' }));
		recorder.recordVerification(makeOutcome({ sessionId: 'A', thoughtId: 'a2' }));

		const aOutcomes = recorder.getOutcomes('A');
		expect(aOutcomes).toHaveLength(2);
		expect(aOutcomes.map((o) => o.thoughtId)).toEqual(['a1', 'a2']);
		expect(recorder.getOutcomes('B')).toHaveLength(1);
	});

	it('getAllOutcomes returns from all sessions', () => {
		const recorder = new OutcomeRecorder({ enabled: true });
		recorder.recordVerification(makeOutcome({ sessionId: 'A' }));
		recorder.recordVerification(makeOutcome({ sessionId: 'B' }));
		expect(recorder.getAllOutcomes()).toHaveLength(2);
	});

	it('clearOutcomes removes only target session', () => {
		const recorder = new OutcomeRecorder({ enabled: true });
		recorder.recordVerification(makeOutcome({ sessionId: 'A' }));
		recorder.recordVerification(makeOutcome({ sessionId: 'B' }));
		recorder.clearOutcomes('A');
		expect(recorder.getOutcomes('A')).toEqual([]);
		expect(recorder.getOutcomes('B')).toHaveLength(1);
	});

	it('enabled property reflects config', () => {
		expect(new OutcomeRecorder({ enabled: true }).enabled).toBe(true);
		expect(new OutcomeRecorder({ enabled: false }).enabled).toBe(false);
	});
});
