/**
 * Tests for Calibrator: prior shrinkage, temperature scaling, Brier, ECE,
 * and per-type / per-session isolation.
 */

import { describe, expect, it } from 'vitest';
import { Calibrator } from '../../core/evaluator/Calibrator.js';
import type {
	IOutcomeRecorder,
	VerificationOutcome,
} from '../../contracts/interfaces.js';
import type { ThoughtType } from '../../core/reasoning.js';

class MockOutcomeRecorder implements IOutcomeRecorder {
	public readonly enabled = true;
	private readonly _bySession = new Map<string, VerificationOutcome[]>();

	recordVerification(outcome: Omit<VerificationOutcome, 'recordedAt'>): void {
		const full: VerificationOutcome = { ...outcome, recordedAt: Date.now() };
		const list = this._bySession.get(full.sessionId) ?? [];
		list.push(full);
		this._bySession.set(full.sessionId, list);
	}

	getOutcomes(sessionId: string): VerificationOutcome[] {
		return this._bySession.get(sessionId) ?? [];
	}

	getAllOutcomes(): VerificationOutcome[] {
		const all: VerificationOutcome[] = [];
		for (const list of this._bySession.values()) all.push(...list);
		return all;
	}

	clearOutcomes(sessionId: string): void {
		this._bySession.delete(sessionId);
	}
}

function makeOutcome(
	predicted: number,
	actual: 0 | 1,
	type: ThoughtType = 'hypothesis',
	sessionId = 's1',
	thoughtId = 't',
	thoughtNumber = 1,
): Omit<VerificationOutcome, 'recordedAt'> {
	return {
		thoughtId,
		thoughtNumber,
		sessionId,
		predicted,
		actual,
		type,
	};
}

describe('Calibrator — disabled mode', () => {
	it('calibrate() returns identity (raw === calibrated, T=1.0, priorWeight=0)', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, false);
		const result = calibrator.calibrate(0.9, 'hypothesis', 's1');
		expect(result.raw).toBe(0.9);
		expect(result.calibrated).toBe(0.9);
		expect(result.temperature).toBe(1.0);
		expect(result.priorWeight).toBe(0);
	});

	it('metrics() returns all-null when disabled', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, false);
		// Even if recorder has outcomes, disabled returns empty metrics.
		recorder.recordVerification(makeOutcome(0.9, 1));
		const m = calibrator.metrics('s1');
		expect(m.brierScore).toBeNull();
		expect(m.ece).toBeNull();
		expect(m.sampleCount).toBe(0);
		for (const t of ['regular', 'hypothesis', 'verification', 'critique', 'synthesis', 'meta'] as const) {
			expect(m.perTypeBrier[t]).toBeNull();
		}
	});

	it('refit() is a no-op when disabled', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, false);
		// Add many overconfident outcomes that would otherwise raise T.
		for (let i = 0; i < 20; i++) {
			recorder.recordVerification(makeOutcome(0.95, 0));
		}
		calibrator.refit('s1');
		// Temperature stays 1.0 because disabled, calibrate still identity.
		const r = calibrator.calibrate(0.9, 'hypothesis', 's1');
		expect(r.temperature).toBe(1.0);
		expect(r.calibrated).toBe(0.9);
	});
});

describe('Calibrator — enabled, no outcomes (prior only)', () => {
	it('priorWeight = 1.0 when no outcomes (Beta(2,2) full prior weight)', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		const r = calibrator.calibrate(0.9, 'hypothesis', 's1');
		// n=0 → priorWeight = 1/(1+0/10) = 1.0
		expect(r.priorWeight).toBe(1.0);
	});

	it('calibrate(0.9, hypothesis) shrinks toward prior mean 0.5', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		const r = calibrator.calibrate(0.9, 'hypothesis', 's1');
		// observedMean defaults to 0.5 with no data → calibrated = 1.0 * 0.5 + 0 * 0.9 = 0.5
		expect(r.calibrated).toBeLessThan(0.9);
		expect(r.calibrated).toBeCloseTo(0.5, 10);
		expect(r.temperature).toBe(1.0); // < MIN_OUTCOMES_FOR_TEMPERATURE
	});

	it('calibrate(0.9, verification) with no outcomes also shrinks to 0.5 (uniform prior)', () => {
		// Note: implementation uses Beta(2,2) prior mean = 0.5 for ALL types.
		// With zero outcomes, both 'hypothesis' and 'verification' shrink identically.
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		const rH = calibrator.calibrate(0.9, 'hypothesis', 's1');
		const rV = calibrator.calibrate(0.9, 'verification', 's1');
		expect(rV.calibrated).toBeCloseTo(rH.calibrated, 10);
		expect(rV.calibrated).toBeCloseTo(0.5, 10);
	});

	it('clamps raw confidence outside [0, 1] range', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		const high = calibrator.calibrate(1.5, 'regular', 's1');
		const low = calibrator.calibrate(-0.3, 'regular', 's1');
		expect(high.raw).toBe(1);
		expect(low.raw).toBe(0);
	});
});

describe('Calibrator — Brier score and ECE', () => {
	it('computes Brier score for known data (5 outcomes, 3 correct)', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		// All predicted 0.8; 3 correct (actual=1), 2 wrong (actual=0).
		// Brier = ( (0.8-1)^2 * 3 + (0.8-0)^2 * 2 ) / 5
		//      = ( 0.04*3 + 0.64*2 ) / 5 = (0.12 + 1.28) / 5 = 1.4 / 5 = 0.28
		recorder.recordVerification(makeOutcome(0.8, 1));
		recorder.recordVerification(makeOutcome(0.8, 1));
		recorder.recordVerification(makeOutcome(0.8, 1));
		recorder.recordVerification(makeOutcome(0.8, 0));
		recorder.recordVerification(makeOutcome(0.8, 0));
		const m = calibrator.metrics('s1');
		expect(m.brierScore).toBeCloseTo(0.28, 10);
		expect(m.sampleCount).toBe(5);
	});

	it('ECE ≈ 0 for perfectly calibrated synthetic data', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		// Bin centered ~0.95: 10 outcomes, 100% correct
		for (let i = 0; i < 10; i++) {
			recorder.recordVerification(makeOutcome(0.95, 1));
		}
		// Bin centered ~0.05: 10 outcomes, 0% correct
		for (let i = 0; i < 10; i++) {
			recorder.recordVerification(makeOutcome(0.05, 0));
		}
		const m = calibrator.metrics('s1');
		expect(m.ece).not.toBeNull();
		// Each bin: meanConf = predicted, meanAcc = predicted → diff ~ 0
		expect(m.ece as number).toBeLessThan(0.06);
	});

	it('ECE > 0 when all predictions are 0.9 but half are wrong', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		for (let i = 0; i < 5; i++) recorder.recordVerification(makeOutcome(0.9, 1));
		for (let i = 0; i < 5; i++) recorder.recordVerification(makeOutcome(0.9, 0));
		const m = calibrator.metrics('s1');
		// All predictions land in same bin, meanConf = 0.9, meanAcc = 0.5 → ECE = 0.4
		expect(m.ece as number).toBeCloseTo(0.4, 10);
		expect(m.ece as number).toBeGreaterThan(0);
	});

	it('Brier and ECE are null on empty outcome list', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		const m = calibrator.metrics('s1');
		expect(m.brierScore).toBeNull();
		expect(m.ece).toBeNull();
		expect(m.sampleCount).toBe(0);
	});

	it('metrics() returns global aggregate when sessionId is omitted', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		recorder.recordVerification(makeOutcome(0.7, 1, 'hypothesis', 'sA'));
		recorder.recordVerification(makeOutcome(0.7, 0, 'hypothesis', 'sB'));
		const m = calibrator.metrics();
		expect(m.sampleCount).toBe(2);
		expect(m.brierScore).toBeCloseTo(((0.7 - 1) ** 2 + (0.7 - 0) ** 2) / 2, 10);
	});

	it('perTypeBrier buckets outcomes by ThoughtType', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		recorder.recordVerification(makeOutcome(0.8, 1, 'hypothesis'));
		recorder.recordVerification(makeOutcome(0.8, 0, 'hypothesis'));
		recorder.recordVerification(makeOutcome(0.5, 1, 'verification'));
		const m = calibrator.metrics('s1');
		expect(m.perTypeBrier.hypothesis).toBeCloseTo(((0.8 - 1) ** 2 + (0.8 - 0) ** 2) / 2, 10);
		expect(m.perTypeBrier.verification).toBeCloseTo((0.5 - 1) ** 2, 10);
		expect(m.perTypeBrier.regular).toBeNull();
		expect(m.perTypeBrier.critique).toBeNull();
		expect(m.perTypeBrier.synthesis).toBeNull();
		expect(m.perTypeBrier.meta).toBeNull();
	});
});

describe('Calibrator — temperature scaling via refit()', () => {
	it('overconfident data → fitted T > 1.0 after refit()', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		// 20 outcomes: predicted 0.95, actual 0 (model very wrong & overconfident).
		for (let i = 0; i < 20; i++) {
			recorder.recordVerification(makeOutcome(0.95, 0));
		}
		calibrator.refit('s1');
		const r = calibrator.calibrate(0.9, 'hypothesis', 's1');
		expect(r.temperature).toBeGreaterThan(1.0);
	});

	it('refit() is a no-op below MIN_OUTCOMES_FOR_TEMPERATURE (10)', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		for (let i = 0; i < 5; i++) recorder.recordVerification(makeOutcome(0.95, 0));
		calibrator.refit('s1');
		// Even with refit, T defaults to 1.0 because < 10 outcomes.
		// Also calibrate() does not apply temperature when outcomes < 10.
		const r = calibrator.calibrate(0.9, 'hypothesis', 's1');
		expect(r.temperature).toBe(1.0);
	});

	it('refit() with no sessionId fits global temperature', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		for (let i = 0; i < 15; i++) {
			recorder.recordVerification(makeOutcome(0.95, 0, 'hypothesis', 'sA'));
		}
		calibrator.refit(); // global
		// Fresh session inherits global T via fallback.
		const r = calibrator.calibrate(0.9, 'hypothesis', 'sA');
		expect(r.temperature).toBeGreaterThan(1.0);
	});

	it('temperature is applied to calibration only when ≥10 outcomes exist', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		// Seed 15 outcomes that fit T > 1.
		for (let i = 0; i < 15; i++) recorder.recordVerification(makeOutcome(0.99, 0));
		calibrator.refit('s1');
		const r = calibrator.calibrate(0.9, 'regular', 's1');
		// Temperature was applied, calibrated should differ from pure shrinkage.
		expect(r.temperature).toBeGreaterThan(1.0);
		// shrunk = priorWeight*0.5 + (1-priorWeight)*0.9 (for 'regular' — n=0 outcomes of type regular)
		// Actually 'regular' had 0 outcomes (all were default 'hypothesis'), so observedMean = 0.5.
		// Then temperature is applied to shrunk.
		expect(r.calibrated).toBeGreaterThan(0);
		expect(r.calibrated).toBeLessThanOrEqual(1);
	});
});

describe('Calibrator — isolation', () => {
	it('per-type isolation: outcomes for hypothesis do not affect verification', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		// Many hypothesis outcomes with mean 1.0
		for (let i = 0; i < 20; i++) {
			recorder.recordVerification(makeOutcome(0.5, 1, 'hypothesis'));
		}
		const rH = calibrator.calibrate(0.9, 'hypothesis', 's1');
		const rV = calibrator.calibrate(0.9, 'verification', 's1');
		// hypothesis: n=20, observedMean=1.0, priorWeight = 1/(1+2) = 1/3
		// shrunk_H = (1/3)*1.0 + (2/3)*0.9 = 0.9333...
		// verification: n=0, observedMean=0.5, priorWeight = 1.0
		// shrunk_V = 1.0 * 0.5 + 0 * 0.9 = 0.5  (then temperature applied since outcomes>=10)
		expect(rH.priorWeight).toBeCloseTo(1 / 3, 10);
		expect(rV.priorWeight).toBe(1.0);
		expect(rH.calibrated).not.toBeCloseTo(rV.calibrated, 2);
	});

	it('session isolation: outcomes in session A do not affect session B metrics', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		recorder.recordVerification(makeOutcome(0.9, 1, 'hypothesis', 'sA'));
		recorder.recordVerification(makeOutcome(0.9, 1, 'hypothesis', 'sA'));
		const mA = calibrator.metrics('sA');
		const mB = calibrator.metrics('sB');
		expect(mA.sampleCount).toBe(2);
		expect(mB.sampleCount).toBe(0);
		expect(mB.brierScore).toBeNull();
		expect(mB.ece).toBeNull();
	});

	it('session isolation: refit on session A does not affect session B temperature', () => {
		const recorder = new MockOutcomeRecorder();
		const calibrator = new Calibrator(recorder, true);
		for (let i = 0; i < 15; i++) {
			recorder.recordVerification(makeOutcome(0.99, 0, 'hypothesis', 'sA'));
		}
		calibrator.refit('sA');
		const rA = calibrator.calibrate(0.9, 'hypothesis', 'sA');
		const rB = calibrator.calibrate(0.9, 'hypothesis', 'sB');
		expect(rA.temperature).toBeGreaterThan(1.0);
		expect(rB.temperature).toBe(1.0); // no global, no session B fit
	});
});
