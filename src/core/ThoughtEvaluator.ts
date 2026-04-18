/**
 * Quality signal computation for sequential thinking.
 *
 * Thin facade that composes the extracted evaluator submodules
 * ({@link SignalComputer}, {@link Aggregator}, {@link PatternDetector})
 * to preserve the original {@link ThoughtEvaluator} public API.
 *
 * @module core/ThoughtEvaluator
 */

import type {
	CalibrationMetrics,
	CalibrationResult,
	ICalibrator,
} from '../contracts/calibrator.js';
import type { ConfidenceSignals, PatternSignal, ReasoningStats, ThoughtType } from './reasoning.js';
import type { ThoughtData } from './thought.js';
import { Aggregator } from './evaluator/Aggregator.js';
import { PatternDetector } from './evaluator/PatternDetector.js';
import { SignalComputer } from './evaluator/SignalComputer.js';

/**
 * No-op calibrator used when calibration is disabled or no calibrator is injected.
 *
 * @remarks
 * Returns the raw confidence unchanged, exposes `enabled = false`, and reports
 * empty metrics. Keeps the {@link ThoughtEvaluator} constructor zero-arg compatible.
 */
class NoOpCalibrator implements ICalibrator {
	public readonly enabled = false;

	public calibrate(rawConfidence: number, _type: ThoughtType, _sessionId: string): CalibrationResult {
		const raw = Math.min(1, Math.max(0, rawConfidence));
		return { raw, calibrated: raw, temperature: 1.0, priorWeight: 0 };
	}

	public metrics(_sessionId?: string): CalibrationMetrics {
		return {
			brierScore: null,
			ece: null,
			sampleCount: 0,
			perTypeBrier: {
				regular: null,
				hypothesis: null,
				verification: null,
				critique: null,
				synthesis: null,
				meta: null,
				tool_call: null,
				tool_observation: null,
				assumption: null,
				decomposition: null,
				backtrack: null,
			},
		};
	}

	public refit(_sessionId?: string): void {
		// no-op
	}
}

/**
 * Stateless service that computes quality signals and reasoning analytics
 * from thought history and branch data.
 *
 * @remarks
 * All methods are pure computations — no side effects, no I/O, no internal state.
 * Designed to be registered as transient in the DI container.
 *
 * @example
 * ```typescript
 * const evaluator = new ThoughtEvaluator();
 * const signals = evaluator.computeConfidenceSignals(history, branches);
 * const stats = evaluator.computeReasoningStats(history, branches);
 * const patterns = evaluator.computePatternSignals(history, branches);
 * ```
 */
export class ThoughtEvaluator {
	private readonly _signalComputer: SignalComputer;
	private readonly _aggregator: Aggregator;
	private readonly _patternDetector: PatternDetector;
	private readonly _calibrator: ICalibrator;

	constructor(calibrator?: ICalibrator) {
		this._signalComputer = new SignalComputer();
		this._aggregator = new Aggregator();
		this._patternDetector = new PatternDetector();
		this._calibrator = calibrator ?? new NoOpCalibrator();
	}

	/** Compute confidence signals from history context. Pure computation. */
	public computeConfidenceSignals(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): ConfidenceSignals {
		const signals = this._signalComputer.computeConfidenceSignals(history, branches);
		if (!this._calibrator.enabled) return signals;

		const lastThought = history[history.length - 1];
		if (lastThought?.confidence === undefined) return signals;

		const result = this._calibrator.calibrate(
			lastThought.confidence,
			lastThought.thought_type ?? 'regular',
			lastThought.session_id ?? ''
		);
		return {
			...signals,
			calibrated_confidence: result.calibrated,
			calibration_metrics: this._calibrator.metrics(lastThought.session_id),
		};
	}

	/** Compute aggregated reasoning analytics. Pure computation. */
	public computeReasoningStats(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): ReasoningStats {
		return this._aggregator.computeReasoningStats(history, branches);
	}

	/** Detect reasoning patterns (anti-patterns and positive signals). Pure computation. */
	public computePatternSignals(
		history: ThoughtData[],
		branches: Record<string, ThoughtData[]>
	): PatternSignal[] {
		return this._patternDetector.computePatternSignals(history, branches);
	}
}
