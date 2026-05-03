/**
 * Feature flag definitions with const-asserted shape.
 *
 * @module contracts/features
 */

/**
 * Feature flags for opt-in/out TraceLattice capabilities.
 *
 * All flags default to true (enabled). Opt-out via configuration.
 */
export interface FeatureFlags {
	/** Enable DAG edges between thoughts. @default true */
	readonly dagEdges: boolean;
	/** Reasoning strategy selector. @default 'sequential' */
	readonly reasoningStrategy: 'sequential' | 'tot';
	/** Enable confidence calibration. @default true */
	readonly calibration: boolean;
	/** Enable thought compression. @default true */
	readonly compression: boolean;
	/** Enable tool interleaving. @default true */
	readonly toolInterleave: boolean;
	/** Enable new thought types. @default true */
	readonly newThoughtTypes: boolean;
	/** Enable outcome recording. @default true */
	readonly outcomeRecording: boolean;
}

/**
 * All feature flag keys as a union type.
 */
export type FeatureFlagKey = keyof FeatureFlags;

/**
 * Default feature flag values. All features enabled by default.
 */
export const DEFAULT_FLAGS: FeatureFlags = {
	dagEdges: true,
	reasoningStrategy: 'sequential',
	calibration: true,
	compression: true,
	toolInterleave: true,
	newThoughtTypes: true,
	outcomeRecording: true,
} as const;

