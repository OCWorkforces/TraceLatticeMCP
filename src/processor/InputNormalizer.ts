/**
 * Input normalization for common LLM field name mistakes.
 *
 * This module provides normalization logic to handle common mistakes
 * that LLMs make when generating field names, such as using singular
 * instead of plural forms (e.g., `recommended_tool` vs `recommended_tools`).
 *
 * @module processor
 */

import type { ThoughtData, StepRecommendation } from '../types.js';

/**
 * Normalizes step recommendation objects.
 *
 * Handles common field name mistakes:
 * - `recommended_tool` (singular) → `recommended_tools` (plural)
 * - `recommended_skill` (singular) → `recommended_skills` (plural)
 *
 * @param step - The step recommendation to normalize
 * @returns The normalized step recommendation
 *
 * @example
 * ```typescript
 * const input = {
 *   step_description: 'Analyze data',
 *   recommended_tool: [{ tool_name: 'Read', confidence: 0.9, rationale: 'test', priority: 1 }],
 *   expected_outcome: 'Data analyzed'
 * };
 *
 * const normalized = normalizeStepRecommendation(input);
 * // normalized.recommended_tools exists (plural form)
 * ```
 */
function normalizeStepRecommendation(step: Record<string, unknown>): StepRecommendation {
	const normalized: Record<string, unknown> = { ...step };

	// Transform `recommended_tool` (singular) → `recommended_tools` (plural)
	if ('recommended_tool' in normalized && !('recommended_tools' in normalized)) {
		normalized.recommended_tools = normalized.recommended_tool;
		delete normalized.recommended_tool;
	}

	// Transform `recommended_skill` (singular) → `recommended_skills` (plural)
	if ('recommended_skill' in normalized && !('recommended_skills' in normalized)) {
		normalized.recommended_skills = normalized.recommended_skill;
		delete normalized.recommended_skill;
	}

	return normalized as unknown as StepRecommendation;
}

/**
 * Normalizes thought input data by fixing common LLM field name mistakes.
 *
 * This function handles cases where LLMs incorrectly use singular forms
 * of field names that should be plural. It applies normalization to both
 * `current_step` and `previous_steps` fields.
 *
 * The normalization is applied BEFORE schema validation, allowing the
 * strict Valibot schema to remain correct while still being tolerant
 * of common LLM mistakes.
 *
 * @param input - The raw thought input data to normalize
 * @returns Normalized thought data with correct field names
 *
 * @remarks
 * **Normalization Rules:**
 * - `recommended_tool` (singular) → `recommended_tools` (plural)
 * - `recommended_skill` (singular) → `recommended_skills` (plural)
 * - Applied to `current_step` if present
 * - Applied to all items in `previous_steps` if present
 *
 * **Design Rationale:**
 * LLMs sometimes use singular field names even when the schema explicitly
 * defines plural forms. Rather than forcing the LLM to be perfect (which
 * leads to cryptic validation errors), we normalize the input to handle
 * these common mistakes gracefully.
 *
 * @example
 * ```typescript
 * const input = {
 *   thought: 'I need to analyze the data',
 *   thought_number: 1,
 *   total_thoughts: 3,
 *   next_thought_needed: true,
 *   current_step: {
 *     step_description: 'Read the data file',
 *     recommended_tool: [{ tool_name: 'Read', confidence: 0.9, rationale: 'test', priority: 1 }],
 *     expected_outcome: 'Data loaded'
 *   }
 * };
 *
 * const normalized = normalizeInput(input);
 * // normalized.current_step.recommended_tools exists (plural form)
 * ```
 */
export function normalizeInput(input: unknown): ThoughtData {
	if (typeof input !== 'object' || input === null) {
		return input as ThoughtData;
	}

	const normalized = { ...input } as Record<string, unknown>;

	// Normalize current_step if present
	if (normalized.current_step && typeof normalized.current_step === 'object') {
		normalized.current_step = normalizeStepRecommendation(
			normalized.current_step as Record<string, unknown>
		);
	}

	// Normalize all items in previous_steps if present
	if (
		Array.isArray(normalized.previous_steps) &&
		normalized.previous_steps.length > 0
	) {
		normalized.previous_steps = normalized.previous_steps.map((step) =>
			typeof step === 'object' && step !== null
				? normalizeStepRecommendation(step as Record<string, unknown>)
				: step
		);
	}

	return normalized as unknown as ThoughtData;
}
