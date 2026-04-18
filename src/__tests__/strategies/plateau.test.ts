import { describe, it, expect } from 'vitest';
import { detectPlateau } from '../../core/reasoning/strategies/plateau.js';

describe('detectPlateau', () => {
	it('returns false for empty array', () => {
		expect(detectPlateau([])).toBe(false);
	});

	it('returns false when fewer scores than window', () => {
		expect(detectPlateau([0.5, 0.6])).toBe(false);
		expect(detectPlateau([0.5, 0.6, 0.7, 0.8], 5)).toBe(false);
	});

	it('returns true for all equal scores', () => {
		expect(detectPlateau([0.5, 0.5, 0.5])).toBe(true);
	});

	it('returns true for strictly decreasing scores (no upward trend)', () => {
		expect(detectPlateau([0.9, 0.905, 0.9])).toBe(true);
	});

	it('returns false for strictly increasing scores beyond epsilon', () => {
		expect(detectPlateau([0.1, 0.5, 0.9])).toBe(false);
	});

	it('returns true for oscillation within epsilon', () => {
		expect(detectPlateau([0.5, 0.51, 0.5])).toBe(true);
	});

	it('returns false for large jump at end', () => {
		expect(detectPlateau([0.5, 0.5, 0.9])).toBe(false);
	});

	it('works correctly when array length equals window size', () => {
		expect(detectPlateau([0.7, 0.7, 0.7])).toBe(true);
		expect(detectPlateau([0.1, 0.4, 0.7])).toBe(false);
	});

	it('respects custom epsilon (0.1)', () => {
		// range = 0.05 < 0.1 → plateau
		expect(detectPlateau([0.5, 0.55, 0.5], 3, 0.1)).toBe(true);
		// range = 0.15 > 0.1 → not plateau
		expect(detectPlateau([0.5, 0.65, 0.5], 3, 0.1)).toBe(false);
	});

	it('respects custom window (5)', () => {
		// last 5 are flat
		expect(detectPlateau([0.1, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5], 5)).toBe(true);
		// last 5 trending upward
		expect(detectPlateau([0.5, 0.5, 0.1, 0.3, 0.5, 0.7, 0.9], 5)).toBe(false);
	});

	it('only examines the most recent window of scores', () => {
		// Early variance is ignored; recent window is flat
		expect(detectPlateau([0.0, 1.0, 0.5, 0.5, 0.5])).toBe(true);
	});
});
