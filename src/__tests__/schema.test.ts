import { describe, it, expect } from 'vitest';
import {
	SequentialThinkingSchema,
	PartialToolRecommendationSchema,
	PartialStepRecommendationSchema,
} from '../schema.js';
import { safeParse } from 'valibot';

describe('SequentialThinkingSchema', () => {
	const validInput = {
		available_mcp_tools: ['mcp-omnisearch', 'mcp-turso-cloud'],
		available_skills: ['commit', 'review-pr'],
		thought: 'This is a test thought',
		thought_number: 1,
		total_thoughts: 5,
		next_thought_needed: true,
		current_step: {
			step_description: 'Test step',
			recommended_tools: [
				{
					tool_name: 'mcp-omnisearch',
					confidence: 0.9,
					rationale: 'Test rationale',
					priority: 1,
				},
			],
			expected_outcome: 'Expected result',
		},
	};

	it('should validate valid input', () => {
		const result = safeParse(SequentialThinkingSchema, validInput);
		expect(result.success).toBe(true);
	});

	it('should require thought field', () => {
		const result = safeParse(SequentialThinkingSchema, {
			thought_number: 1,
			total_thoughts: 5,
		});
		expect(result.success).toBe(false);
	});

	it('should require thought_number >= 1', () => {
		const result = safeParse(SequentialThinkingSchema, {
			thought: 'test',
			thought_number: 0,
			total_thoughts: 5,
		});
		expect(result.success).toBe(false);
	});

	it('should require total_thoughts >= 1', () => {
		const result = safeParse(SequentialThinkingSchema, {
			thought: 'test',
			thought_number: 1,
			total_thoughts: 0,
		});
		expect(result.success).toBe(false);
	});

	it('should validate confidence range 0-1', () => {
		const invalidTool = { ...validInput };
		if (invalidTool.current_step && invalidTool.current_step.recommended_tools) {
			invalidTool.current_step.recommended_tools[0]!.confidence = 1.5;
		}
		const result = safeParse(SequentialThinkingSchema, invalidTool);
		expect(result.success).toBe(false);
	});

	it('should accept optional fields', () => {
		const minimalInput = {
			thought: 'Minimal thought',
			thought_number: 1,
			total_thoughts: 1,
		};
		const result = safeParse(SequentialThinkingSchema, minimalInput);
		expect(result.success).toBe(true);
	});

	it('should validate skill recommendations', () => {
		const withSkills = {
			thought: 'Test thought',
			thought_number: 1,
			total_thoughts: 5,
			current_step: {
				step_description: 'Test step',
				recommended_tools: [
					{
						tool_name: 'mcp-omnisearch',
						confidence: 0.9,
						rationale: 'Test rationale',
						priority: 1,
					},
				],
				recommended_skills: [
					{
						skill_name: 'commit',
						confidence: 0.95,
						rationale: 'Handles git commits',
						priority: 1,
					},
				],
				expected_outcome: 'Expected result',
			},
		};
		const result = safeParse(SequentialThinkingSchema, withSkills);
		expect(result.success).toBe(true);
	});

	it('should validate revision fields', () => {
		const withRevision = {
			thought: 'Test thought',
			thought_number: 1,
			total_thoughts: 5,
			is_revision: true,
			revises_thought: 1,
		};
		const result = safeParse(SequentialThinkingSchema, withRevision);
		expect(result.success).toBe(true);
	});

	it('should validate branching fields', () => {
		const withBranch = {
			thought: 'Test thought',
			thought_number: 1,
			total_thoughts: 5,
			branch_from_thought: 1,
			branch_id: 'test-branch',
		};
		const result = safeParse(SequentialThinkingSchema, withBranch);
		expect(result.success).toBe(true);
	});
});

describe('PartialToolRecommendationSchema', () => {
	it('should validate minimal valid input (only required fields)', () => {
		const minimal = {
			tool_name: 'Read',
			rationale: 'Read the file',
		};
		const result = safeParse(PartialToolRecommendationSchema, minimal);
		expect(result.success).toBe(true);
	});

	it('should accept optional confidence field', () => {
		const withConfidence = {
			tool_name: 'Grep',
			rationale: 'Search code',
			confidence: 0.8,
		};
		const result = safeParse(PartialToolRecommendationSchema, withConfidence);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.confidence).toBe(0.8);
		}
	});

	it('should accept optional priority field', () => {
		const withPriority = {
			tool_name: 'Write',
			rationale: 'Write to file',
			priority: 5,
		};
		const result = safeParse(PartialToolRecommendationSchema, withPriority);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.priority).toBe(5);
		}
	});

	it('should accept all optional fields', () => {
		const complete = {
			tool_name: 'Edit',
			rationale: 'Edit file',
			confidence: 0.9,
			priority: 1,
			suggested_inputs: { filePath: '/path/to/file' },
			alternatives: ['Write'],
		};
		const result = safeParse(PartialToolRecommendationSchema, complete);
		expect(result.success).toBe(true);
	});

	it('should validate confidence range 0-1 when provided', () => {
		const invalidConfidence = {
			tool_name: 'Read',
			rationale: 'Read file',
			confidence: 1.5,
		};
		const result = safeParse(PartialToolRecommendationSchema, invalidConfidence);
		expect(result.success).toBe(false);
	});

	it('should require tool_name', () => {
		const missingToolName = {
			rationale: 'Some rationale',
		};
		const result = safeParse(PartialToolRecommendationSchema, missingToolName);
		expect(result.success).toBe(false);
	});

	it('should accept tool with only tool_name (rationale optional)', () => {
		const minimalTool = {
			tool_name: 'Read',
		};
		const result = safeParse(PartialToolRecommendationSchema, minimalTool);
		expect(result.success).toBe(true);
		// Note: rationale will be undefined here, defaults are filled by InputNormalizer
	});
});

describe('PartialStepRecommendationSchema', () => {
	it('should validate minimal valid input (only required fields)', () => {
		const minimal = {
			step_description: 'Read the file',
			recommended_tools: [
				{
					tool_name: 'Read',
					rationale: 'Read the file',
				},
			],
		};
		const result = safeParse(PartialStepRecommendationSchema, minimal);
		expect(result.success).toBe(true);
	});

	it('should accept optional expected_outcome field', () => {
		const withOutcome = {
			step_description: 'Search code',
			recommended_tools: [
				{
					tool_name: 'Grep',
					rationale: 'Search for pattern',
				},
			],
			expected_outcome: 'List of matching files',
		};
		const result = safeParse(PartialStepRecommendationSchema, withOutcome);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.expected_outcome).toBe('List of matching files');
		}
	});

	it('should accept optional recommended_skills field', () => {
		const withSkills = {
			step_description: 'Commit changes',
			recommended_tools: [
				{
					tool_name: 'Bash',
					rationale: 'Run git commands',
				},
			],
			recommended_skills: [
				{
					skill_name: 'commit',
					confidence: 0.95,
					rationale: 'Handles git commit workflow',
					priority: 1,
				},
			],
		};
		const result = safeParse(PartialStepRecommendationSchema, withSkills);
		expect(result.success).toBe(true);
	});

	it('should accept optional next_step_conditions field', () => {
		const withConditions = {
			step_description: 'Analyze data',
			recommended_tools: [
				{
					tool_name: 'Read',
					rationale: 'Read data file',
				},
			],
			next_step_conditions: ['Data loaded successfully', 'No errors encountered'],
		};
		const result = safeParse(PartialStepRecommendationSchema, withConditions);
		expect(result.success).toBe(true);
	});

	it('should accept partial tool recommendations (missing confidence/priority)', () => {
		const partialTools = {
			step_description: 'Multi-step process',
			recommended_tools: [
				{
					tool_name: 'Read',
					rationale: 'Read file',
				},
				{
					tool_name: 'Grep',
					rationale: 'Search code',
					confidence: 0.8,
				},
				{
					tool_name: 'Write',
					rationale: 'Write output',
					priority: 1,
				},
			],
		};
		const result = safeParse(PartialStepRecommendationSchema, partialTools);
		expect(result.success).toBe(true);
	});

	it('should require step_description', () => {
		const missingDescription = {
			recommended_tools: [
				{
					tool_name: 'Read',
					rationale: 'Read file',
				},
			],
		};
		const result = safeParse(PartialStepRecommendationSchema, missingDescription);
		expect(result.success).toBe(false);
	});

	it('should require recommended_tools array', () => {
		const missingTools = {
			step_description: 'Do something',
		};
		const result = safeParse(PartialStepRecommendationSchema, missingTools);
		expect(result.success).toBe(false);
	});
});

describe('SequentialThinkingSchema with lenient previous_steps', () => {
	it('should accept partial previous_steps (missing confidence/priority/expected_outcome)', () => {
		const input = {
			thought: 'Test thought',
			thought_number: 2,
			total_thoughts: 3,
			next_thought_needed: true,
			current_step: {
				step_description: 'Current step',
				recommended_tools: [
					{
						tool_name: 'Read',
						confidence: 0.9,
						rationale: 'Read file',
						priority: 1,
					},
				],
				expected_outcome: 'File read successfully',
			},
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
					// Missing: expected_outcome
				},
			],
		};
		const result = safeParse(SequentialThinkingSchema, input);
		expect(result.success).toBe(true);
	});

	it('should accept current_step with missing priority (uses default 999)', () => {
		const input = {
			thought: 'Test thought',
			thought_number: 1,
			total_thoughts: 2,
			current_step: {
				step_description: 'Current step',
				recommended_tools: [
					{
						tool_name: 'Read',
						confidence: 0.9,
						rationale: 'Read file',
						// priority is optional, InputNormalizer fills in default 999
					},
				],
				expected_outcome: 'File read successfully',
			},
		};
		const result = safeParse(SequentialThinkingSchema, input);
		expect(result.success).toBe(true);
		// Verify priority was not in input (optional field)
		expect((result.output as Record<string, unknown>).current_step).toBeDefined();
	});

	it('should validate confidence range in previous_steps when provided', () => {
		const input = {
			thought: 'Test thought',
			thought_number: 2,
			total_thoughts: 2,
			previous_steps: [
				{
					step_description: 'Previous step',
					recommended_tools: [
						{
							tool_name: 'Grep',
							rationale: 'Search code',
							confidence: 1.5, // Invalid - should fail
						},
					],
				},
			],
		};
		const result = safeParse(SequentialThinkingSchema, input);
		expect(result.success).toBe(false);
	});
});
