/**
 * Strategy factory — maps a {@link FeatureFlags.reasoningStrategy} value to
 * a concrete {@link IReasoningStrategy} instance.
 *
 * Today {@link SequentialStrategy} and {@link TreeOfThoughtStrategy} are
 * implemented and are the only valid strategy values.
 *
 * @module core/reasoning/strategies/StrategyFactory
 */

import type { IReasoningStrategy } from '../../../contracts/strategy.js';
import type { FeatureFlags } from '../../../contracts/features.js';
import { SequentialStrategy } from './SequentialStrategy.js';
import { TreeOfThoughtStrategy } from './TreeOfThoughtStrategy.js';
import { assertNever } from '../../../utils.js';

/**
 * Build a reasoning strategy by name.
 *
 * @param name - Strategy identifier from {@link FeatureFlags.reasoningStrategy}.
 * @returns A concrete {@link IReasoningStrategy} instance.
 *
 * @example
 * ```ts
 * const strategy = createReasoningStrategy(config.features.reasoningStrategy);
 * const decision = strategy.decide(ctx);
 * ```
 */
export function createReasoningStrategy(
	name: FeatureFlags['reasoningStrategy'],
): IReasoningStrategy {
	switch (name) {
		case 'sequential':
			return new SequentialStrategy();
		case 'tot':
			return new TreeOfThoughtStrategy();
		default:
			return assertNever(name);
	}
}
