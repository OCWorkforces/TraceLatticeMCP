/**
 * Tests for InputNormalizer.
 *
 * This test file covers the normalization logic that handles common LLM
 * field name mistakes such as using singular instead of plural forms.
 */

import { describe, it, expect } from 'vitest';
import { normalizeInput } from '../processor/InputNormalizer.js';
import type { ThoughtData } from '../types.js';

/**
 * Helper for creating tool recommendations.
 */
function createToolRecommendation(overrides?: Record<string, unknown>): Record<string, unknown> {
	return {
		tool_name: 'test-tool',
		confidence: 0.9,
		rationale: 'Test rationale',
		priority: 1,
		...overrides,
	};
}

describe('InputNormalizer', () => {
	describe('current_step normalization', () => {
		it('should transform recommended_tool (singular) to recommended_tools (plural)', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				current_step: {
					step_description: 'Test step',
					recommended_tool: [createToolRecommendation()],
					expected_outcome: 'Test outcome',
				},
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.current_step).toBeDefined();
			expect(normalized.current_step?.recommended_tools).toBeDefined();
			expect(normalized.current_step?.recommended_tools).toHaveLength(1);
			// @ts-expect-error - Testing that the old singular key is removed
			expect(normalized.current_step?.recommended_tool).toBeUndefined();
		});

		it('should preserve recommended_tools when already plural', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				current_step: {
					step_description: 'Test step',
					recommended_tools: [createToolRecommendation()],
					expected_outcome: 'Test outcome',
				},
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.current_step).toBeDefined();
			expect(normalized.current_step?.recommended_tools).toBeDefined();
			expect(normalized.current_step?.recommended_tools).toHaveLength(1);
		});

		it('should transform recommended_skill (singular) to recommended_skills (plural)', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				current_step: {
					step_description: 'Test step',
					recommended_tools: [createToolRecommendation()],
					recommended_skill: [{
						skill_name: 'test-skill',
						confidence: 0.9,
						rationale: 'Test rationale',
						priority: 1,
					}],
					expected_outcome: 'Test outcome',
				},
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.current_step).toBeDefined();
			expect(normalized.current_step?.recommended_skills).toBeDefined();
			expect(normalized.current_step?.recommended_skills).toHaveLength(1);
			// @ts-expect-error - Testing that the old singular key is removed
			expect(normalized.current_step?.recommended_skill).toBeUndefined();
		});

		it('should preserve recommended_skills when already plural', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				current_step: {
					step_description: 'Test step',
					recommended_tools: [createToolRecommendation()],
					recommended_skills: [{
						skill_name: 'test-skill',
						confidence: 0.9,
						rationale: 'Test rationale',
						priority: 1,
					}],
					expected_outcome: 'Test outcome',
				},
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.current_step).toBeDefined();
			expect(normalized.current_step?.recommended_skills).toBeDefined();
			expect(normalized.current_step?.recommended_skills).toHaveLength(1);
		});

		it('should handle missing current_step', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.current_step).toBeUndefined();
		});
	});

	describe('previous_steps normalization', () => {
		it('should transform recommended_tool (singular) to recommended_tools (plural) in all steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Step 1',
						recommended_tool: [createToolRecommendation({ tool_name: 'tool1' })],
						expected_outcome: 'Outcome 1',
					},
					{
						step_description: 'Step 2',
						recommended_tool: [createToolRecommendation({ tool_name: 'tool2' })],
						expected_outcome: 'Outcome 2',
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps).toBeDefined();
			expect(normalized.previous_steps).toHaveLength(2);
			expect(normalized.previous_steps?.[0].recommended_tools).toBeDefined();
			expect(normalized.previous_steps?.[1].recommended_tools).toBeDefined();
		});

		it('should handle mixed singular and plural in previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 3,
				total_thoughts: 3,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Step 1',
						recommended_tool: [createToolRecommendation({ tool_name: 'tool1' })],
						expected_outcome: 'Outcome 1',
					},
					{
						step_description: 'Step 2',
						recommended_tools: [createToolRecommendation({ tool_name: 'tool2' })],
						expected_outcome: 'Outcome 2',
					},
					{
						step_description: 'Step 3',
						recommended_tool: [createToolRecommendation({ tool_name: 'tool3' })],
						expected_outcome: 'Outcome 3',
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps).toBeDefined();
			expect(normalized.previous_steps).toHaveLength(3);
			// All should have recommended_tools (plural) after normalization
			expect(normalized.previous_steps?.[0].recommended_tools).toBeDefined();
			expect(normalized.previous_steps?.[1].recommended_tools).toBeDefined();
			expect(normalized.previous_steps?.[2].recommended_tools).toBeDefined();
		});

		it('should handle empty previous_steps array', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				previous_steps: [],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps).toBeDefined();
			expect(normalized.previous_steps).toHaveLength(0);
		});

		it('should handle missing previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps).toBeUndefined();
		});

		it('should fill in default confidence (0.5) for missing tool confidence in previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Previous step',
						recommended_tools: [
							{
								tool_name: 'Grep',
								rationale: 'Search code',
								// Missing: confidence, priority
							},
						],
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps?.[0].recommended_tools?.[0].confidence).toBe(0.5);
		});

		it('should fill in default priority (999) for missing tool priority in previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Previous step',
						recommended_tools: [
							{
								tool_name: 'Read',
								rationale: 'Read file',
								// Missing: priority
							},
						],
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps?.[0].recommended_tools?.[0].priority).toBe(999);
		});

		it('should fill in default rationale (empty string) for missing tool rationale in previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Previous step',
						recommended_tools: [
							{
								tool_name: 'Task',
								// Missing: rationale
							},
						],
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps?.[0].recommended_tools?.[0].rationale).toBe('');
		});

		it('should fill in default expected_outcome (empty string) for missing in previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Previous step',
						recommended_tools: [
							{
								tool_name: 'Grep',
								rationale: 'Search code',
							},
						],
						// Missing: expected_outcome
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps?.[0].expected_outcome).toBe('');
		});

		it('should preserve existing confidence and priority when present in previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Previous step',
						recommended_tools: [
							{
								tool_name: 'Grep',
								rationale: 'Search code',
								confidence: 0.8,
								priority: 2,
							},
						],
						expected_outcome: 'Files found',
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.previous_steps?.[0].recommended_tools?.[0].confidence).toBe(0.8);
			expect(normalized.previous_steps?.[0].recommended_tools?.[0].priority).toBe(2);
			expect(normalized.previous_steps?.[0].expected_outcome).toBe('Files found');
		});

		it('should handle mixed complete and partial tool recommendations in previous_steps', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				previous_steps: [
					{
						step_description: 'Step 1 - partial',
						recommended_tools: [
							{
								tool_name: 'Read',
								rationale: 'Read file',
							},
						],
					},
					{
						step_description: 'Step 2 - complete',
						recommended_tools: [
							{
								tool_name: 'Grep',
								rationale: 'Search code',
								confidence: 0.9,
								priority: 1,
							},
						],
						expected_outcome: 'Found matches',
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			// Step 1 should have defaults filled in
			expect(normalized.previous_steps?.[0].recommended_tools?.[0].confidence).toBe(0.5);
			expect(normalized.previous_steps?.[0].recommended_tools?.[0].priority).toBe(999);
			expect(normalized.previous_steps?.[0].expected_outcome).toBe('');

			// Step 2 should preserve original values
			expect(normalized.previous_steps?.[1].recommended_tools?.[0].confidence).toBe(0.9);
			expect(normalized.previous_steps?.[1].recommended_tools?.[0].priority).toBe(1);
			expect(normalized.previous_steps?.[1].expected_outcome).toBe('Found matches');
		});
	});

	describe('edge cases', () => {
		it('should handle null input', () => {
			const normalized = normalizeInput(null) as ThoughtData;
			expect(normalized).toBeNull();
		});

		it('should handle non-object input', () => {
			const normalized = normalizeInput('string') as ThoughtData;
			expect(normalized).toBe('string');
		});

		it('should normalize both current_step and previous_steps together', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
				current_step: {
					step_description: 'Current step',
					recommended_tool: [createToolRecommendation({ tool_name: 'current-tool' })],
					expected_outcome: 'Current outcome',
				},
				previous_steps: [
					{
						step_description: 'Previous step',
						recommended_tool: [createToolRecommendation({ tool_name: 'prev-tool' })],
						expected_outcome: 'Previous outcome',
					},
				],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.current_step?.recommended_tools).toBeDefined();
			expect(normalized.previous_steps?.[0].recommended_tools).toBeDefined();
		});

		it('should not modify other fields', () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				available_mcp_tools: ['tool1', 'tool2'],
				available_skills: ['skill1'],
				remaining_steps: ['Step 3', 'Step 4'],
			} as unknown;

			const normalized = normalizeInput(input) as ThoughtData;

			expect(normalized.thought).toBe('Test thought');
			expect(normalized.thought_number).toBe(1);
			expect(normalized.total_thoughts).toBe(1);
			expect(normalized.next_thought_needed).toBe(false);
			expect(normalized.available_mcp_tools).toEqual(['tool1', 'tool2']);
			expect(normalized.available_skills).toEqual(['skill1']);
			expect(normalized.remaining_steps).toEqual(['Step 3', 'Step 4']);
		});
	});
});
