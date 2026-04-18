/**
 * Contracts module — shared interface definitions for DI and cross-module dependencies.
 *
 * All modules that need to reference other modules' interfaces should import
 * from here instead of directly from the implementation module.
 *
 * @module contracts
 */

export {
	type DiscoveryCacheOptions,
	type IDiscoveryCache,
	type IMetrics,
	type IOutcomeRecorder,
	type VerificationOutcome,
} from './interfaces.js';

export type { StrategyContext, StrategyDecision, IReasoningStrategy } from './strategy.js';

export type { CalibrationMetrics, CalibrationResult, ICalibrator } from './calibrator.js';

export type { Summary, ISummaryStore } from './summary.js';

export type { SuspensionRecord, ISuspensionStore } from './suspension.js';

