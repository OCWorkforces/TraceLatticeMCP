/**
 * Interface for thought and step recommendation formatting.
 *
 * This module provides the `IThoughtFormatter` interface which defines the
 * contract for formatter implementations. This allows for decoupling and
 * testability of presentation logic.
 *
 * @module IThoughtFormatter
 */

import type { StepRecommendation } from './step.js';
import type { ThoughtData } from './thought.js';

/**
 * Interface for formatting thought data and step recommendations.
 *
 * This interface defines the contract for formatter implementations,
 * allowing for decoupling between components like ThoughtProcessor and
 * concrete implementations. It supports dependency injection and mocking
 * for testing purposes.
 *
 * @example
 * ```typescript
 * class MockFormatter implements IThoughtFormatter {
 *   formatRecommendation(_step: StepRecommendation): string { return ''; }
 *   formatThought(_thought: ThoughtData): string { return ''; }
 * }
 * ```
 */
export interface IThoughtFormatter {
	/**
	 * Formats a step recommendation into a readable string.
	 *
	 * Creates a structured display of the step description, recommended tools,
	 * recommended skills, expected outcome, and conditions for the next step.
	 *
	 * @param step - The step recommendation to format
	 * @returns A formatted string representation of the recommendation
	 */
	formatRecommendation(step: StepRecommendation): string;

	/**
	 * Formats a thought into a clean, simple display.
	 *
	 * Creates a clean output containing the thought content with an appropriate
	 * header indicating the thought type. Priority order for icon selection:
	 * `is_revision` > `branch_from_thought` > `thought_type`.
	 *
	 * @param thoughtData - The thought data to format
	 * @returns A formatted string with thought and recommendations
	 */
	formatThought(thoughtData: ThoughtData): string;
}
