import { describe, it, expect } from 'vitest';
import { SequentialThinkingSchema } from '../schema.js';
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
			invalidTool.current_step.recommended_tools[0].confidence = 1.5;
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
