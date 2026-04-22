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

export type { FeatureFlags, FeatureFlagKey } from './features.js';
export { DEFAULT_FLAGS, hasFeature } from './features.js';

export type { Brand, SessionId, ThoughtId, EdgeId, SuspensionToken } from './ids.js';
export {
	asSessionId,
	asThoughtId,
	asEdgeId,
	asSuspensionToken,
	generateThoughtId,
	generateEdgeId,
	generateSuspensionToken,
	GLOBAL_SESSION_ID,
} from './ids.js';

export type { TransportKind, ITransport } from './transport.js';

export type { PersistenceBackend, PersistenceConfig } from './PersistenceBackend.js';

