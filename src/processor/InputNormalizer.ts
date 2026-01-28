/**
 * Input normalization for common LLM field name mistakes.
 *
 * This module provides normalization logic to handle common mistakes
 * that LLMs make when generating field names, such as using singular
 * instead of plural forms (e.g., `recommended_tool` vs `recommended_tools`).
 *
 * It also fills in sensible defaults for missing fields in `previous_steps`,
 * which LLMs naturally provide as partial/skeletal data (historical context).
 *
 * @module processor
 */

import type { ThoughtData } from '../types.js';

/**
 * Default values for missing partial tool recommendation fields.
 */
const DEFAULT_TOOL_CONFIDENCE = 0.5;
const DEFAULT_TOOL_PRIORITY = 999;
const DEFAULT_TOOL_RATIONALE = '';
const DEFAULT_STEP_OUTCOME = '';

/**
 * Normalizes tool recommendation objects with default values.
 *
 * Fills in sensible defaults for missing optional fields:
 * - `confidence`: 0.5
 * - `priority`: 999
 * - `rationale`: empty string
 *
 * @param tool - The tool recommendation to normalize
 * @returns The normalized tool recommendation with defaults filled in
 *
 * @example
 * ```typescript
 * const input = { tool_name: 'Read', rationale: 'Read the file' };
 * const normalized = normalizeToolRecommendation(input);
 * // { tool_name: 'Read', rationale: 'Read the file', confidence: 0.5, priority: 999 }
 * ```
 */
function normalizeToolRecommendation(tool: Record<string, unknown>): Record<string, unknown> {
	const normalized: Record<string, unknown> = { ...tool };

	// Fill in default confidence if missing
	if (!('confidence' in normalized) || normalized.confidence === undefined) {
		normalized.confidence = DEFAULT_TOOL_CONFIDENCE;
	}

	// Fill in default priority if missing
	if (!('priority' in normalized) || normalized.priority === undefined) {
		normalized.priority = DEFAULT_TOOL_PRIORITY;
	}

	// Fill in default rationale if missing
	if (!('rationale' in normalized) || normalized.rationale === undefined) {
		normalized.rationale = DEFAULT_TOOL_RATIONALE;
	}

	return normalized;
}

/**
 * Normalizes step recommendation objects.
 *
 * Handles common field name mistakes:
 * - `recommended_tool` (singular) → `recommended_tools` (plural)
 * - `recommended_skill` (singular) → `recommended_skills` (plural)
 *
 * Also normalizes tool recommendations within the step to fill in defaults.
 *
 * @param step - The step recommendation to normalize
 * @param lenient - Whether to use lenient mode (fill in defaults for missing fields)
 * @returns The normalized step recommendation
 *
 * @example
 * ```typescript
 * // Strict mode (for current_step)
 * const input = {
 *   step_description: 'Analyze data',
 *   recommended_tool: [{ tool_name: 'Read', confidence: 0.9, rationale: 'test', priority: 1 }],
 *   expected_outcome: 'Data analyzed'
 * };
 * const normalized = normalizeStepRecommendation(input, false);
 * // normalized.recommended_tools exists (plural form)
 *
 * // Lenient mode (for previous_steps)
 * const partialInput = {
 *   step_description: 'Read file',
 *   recommended_tools: [{ tool_name: 'Read', rationale: 'Read file' }]
 * };
 * const normalized = normalizeStepRecommendation(partialInput, true);
 * // confidence: 0.5, priority: 999, expected_outcome: '' filled in
 * ```
 */
function normalizeStepRecommendation(
	step: Record<string, unknown>,
	lenient: boolean
): Record<string, unknown> {
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

	// Normalize recommended_tools array if present
	if (Array.isArray(normalized.recommended_tools)) {
		normalized.recommended_tools = normalized.recommended_tools.map((tool) =>
			typeof tool === 'object' && tool !== null
				? normalizeToolRecommendation(tool as Record<string, unknown>)
				: tool
		);
	}

	// In lenient mode, fill in default expected_outcome if missing
	if (lenient && !('expected_outcome' in normalized)) {
		normalized.expected_outcome = DEFAULT_STEP_OUTCOME;
	}

	return normalized;
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
 * - Applied to `current_step` if present (strict mode)
 * - Applied to all items in `previous_steps` if present (lenient mode with defaults)
 *
 * **Design Rationale:**
 * LLMs sometimes use singular field names even when the schema explicitly
 * defines plural forms. Rather than forcing the LLM to be perfect (which
 * leads to cryptic validation errors), we normalize the input to handle
 * these common mistakes gracefully.
 *
 * Additionally, LLMs naturally provide complete data for `current_step`
 * but only partial/skeletal data for `previous_steps` (historical context).
 * The lenient mode for `previous_steps` fills in sensible defaults:
 * - `confidence`: 0.5 for missing tool recommendation confidence
 * - `priority`: 999 for missing tool recommendation priority
 * - `rationale`: empty string for missing tool recommendation rationale
 * - `expected_outcome`: empty string for missing step expected outcome
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
 *   },
 *   previous_steps: [{
 *     step_description: 'Previous step',
 *     recommended_tools: [{ tool_name: 'Grep', rationale: 'Search code' }]
 *   }]
 * };
 *
 * const normalized = normalizeInput(input);
 * // current_step: recommended_tools exists (plural form)
 * // previous_steps[0]: confidence=0.5, priority=999, expected_outcome='' filled in
 * ```
 */
export function normalizeInput(input: unknown): ThoughtData {
	if (typeof input !== 'object' || input === null) {
		return input as ThoughtData;
	}

	const normalized = { ...input } as Record<string, unknown>;

	// Normalize current_step if present (strict mode - no defaults)
	if (normalized.current_step && typeof normalized.current_step === 'object') {
		normalized.current_step = normalizeStepRecommendation(
			normalized.current_step as Record<string, unknown>,
			false // strict mode
		);
	}

	// Normalize all items in previous_steps if present (lenient mode - with defaults)
	if (Array.isArray(normalized.previous_steps) && normalized.previous_steps.length > 0) {
		normalized.previous_steps = normalized.previous_steps.map((step) =>
			typeof step === 'object' && step !== null
				? normalizeStepRecommendation(step as Record<string, unknown>, true) // lenient mode
				: step
		);
	}

	return normalized as unknown as ThoughtData;
}
