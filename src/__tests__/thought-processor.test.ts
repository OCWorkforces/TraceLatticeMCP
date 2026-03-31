/**
 * Comprehensive tests for ThoughtProcessor.
 *
 * This test file covers input validation, error handling, history integration,
 * response formatting, and edge cases for the ThoughtProcessor class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThoughtProcessor } from '../core/ThoughtProcessor.js';
import { ThoughtFormatter } from '../core/ThoughtFormatter.js';
import { StructuredLogger } from '../logger/StructuredLogger.js';
import { MockHistoryManager } from './helpers/index.js';
import type { ThoughtData } from '../core/thought.js';
import type { IHistoryManager } from '../core/IHistoryManager.js';
import { ThoughtEvaluator } from '../core/ThoughtEvaluator.js';
import { createTestThought, createHypothesisThought } from './helpers/index.js';


describe('ThoughtProcessor', () => {
	let processor: ThoughtProcessor;
	let mockHistory: MockHistoryManager;
	let formatter: ThoughtFormatter;
	let logger: StructuredLogger;

	beforeEach(() => {
		mockHistory = new MockHistoryManager();
		formatter = new ThoughtFormatter();
		logger = new StructuredLogger({ context: 'Test', pretty: false });
		processor = new ThoughtProcessor(mockHistory, formatter, new ThoughtEvaluator(), logger);
	});

	describe('Input Validation', () => {
		it('should auto-adjust total_thoughts when thought_number exceeds it', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 10,
				total_thoughts: 5,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.total_thoughts).toBe(10);
			expect(parsed.thought_number).toBe(10);
		});

		it('should not adjust total_thoughts when thought_number is less than or equal', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 3,
				total_thoughts: 5,
				next_thought_needed: true,
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.total_thoughts).toBe(5);
			expect(parsed.thought_number).toBe(3);
		});

		it('should handle thought_number equal to total_thoughts', async () => {
			const input: ThoughtData = {
				thought: 'Final thought',
				thought_number: 5,
				total_thoughts: 5,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.total_thoughts).toBe(5);
			expect(parsed.thought_number).toBe(5);
			expect(parsed.next_thought_needed).toBe(false);
		});
	});

	describe('History Integration', () => {
		it('should add thought to history on successful processing', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			await processor.process(input);

			expect(mockHistory.getHistoryLength()).toBe(1);
			expect(mockHistory.getHistory()[0]).toMatchObject(input);
		});

		it('should respect max history size through HistoryManager', async () => {
			// Add multiple thoughts
			for (let i = 1; i <= 5; i++) {
				const input: ThoughtData = {
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 5,
					next_thought_needed: i < 5,
				};
				await processor.process(input);
			}

			expect(mockHistory.getHistoryLength()).toBe(5);
		});

		it('should report correct thought_history_length in response', async () => {
			const input1: ThoughtData = {
				thought: 'First thought',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
			};

			await processor.process(input1);

			const result1 = await processor.process({
				thought: 'Second thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
			});

			const parsed = JSON.parse(result1.content[0]!.text);
			expect(parsed.thought_history_length).toBe(2);
		});
	});

	describe('Response Formatting', () => {
		it('should return correctly structured response', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 3,
				next_thought_needed: true,
				available_mcp_tools: ['tool1', 'tool2'],
				available_skills: ['skill1'],
			};

			const result = await processor.process(input);

			expect(result.content).toHaveLength(1);
			expect(result.content[0]!.type).toBe('text');
			expect(result.isError).toBeUndefined();

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed).toMatchObject({
				thought_number: 1,
				total_thoughts: 3,
				next_thought_needed: true,
				branches: [],
				thought_history_length: 1,
			});
		});

		it('should include available_mcp_tools in response when provided', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				available_mcp_tools: ['Read', 'Write', 'Grep'],
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.available_mcp_tools).toEqual(['Read', 'Write', 'Grep']);
		});

		it('should include available_skills in response when provided', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				available_skills: ['commit', 'review-pr'],
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.available_skills).toEqual(['commit', 'review-pr']);
		});

		it('should include current_step in response when provided', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				current_step: {
					step_description: 'Analyze code',
					recommended_tools: [
						{
							tool_name: 'Grep',
							confidence: 0.9,
							rationale: 'Best for searching',
							priority: 1,
						},
					],
					expected_outcome: 'Find patterns',
				},
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.current_step).toEqual({
				step_description: 'Analyze code',
				recommended_tools: [
					{
						tool_name: 'Grep',
						confidence: 0.9,
						rationale: 'Best for searching',
						priority: 1,
					},
				],
				expected_outcome: 'Find patterns',
			});
		});

		it('should include branches in response', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.branches).toEqual([]);
		});
	});

	describe('Error Handling', () => {
		it('should handle missing optional fields gracefully', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			expect(result.isError).toBeUndefined();
		});

		it('should return error response when processing fails', async () => {
			// Create a HistoryManager that throws on addThought
		class ThrowingHistoryManager implements IHistoryManager {
			addThought(): void {
				throw new Error('Database error');
			}
			getHistory(): ThoughtData[] {
				return [];
			}
			getHistoryLength(): number {
				return 0;
			}
			getBranches(): Record<string, ThoughtData[]> {
				return {};
			}
			getBranchIds(): string[] {
				return [];
			}
			clear(): void {}
			getAvailableMcpTools(): string[] | undefined {
				return undefined;
			}
			getAvailableSkills(): string[] | undefined {
				return undefined;
			}
		}

			const throwingHistory = new ThrowingHistoryManager();
			const throwingProcessor = new ThoughtProcessor(throwingHistory, formatter, new ThoughtEvaluator(), logger);

			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await throwingProcessor.process(input);

			expect(result.isError).toBe(true);
			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.error).toBe('Database error');
			expect(parsed.status).toBe('failed');
		});

		it('should handle undefined thought_number edge case', async () => {
			// TypeScript should catch this at compile time, but test runtime behavior
			const input = {
				thought: 'Test thought',
			} as unknown as ThoughtData;

			// The processor should handle this gracefully
			const result = await processor.process(input);
			// Either returns an error or processes with undefined values
			expect(result).toBeDefined();
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty thought string', async () => {
			const input: ThoughtData = {
				thought: '',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			expect(result.isError).toBeUndefined();
		});

		it('should handle very long thought content', async () => {
			const longThought = 'x'.repeat(10000);
			const input: ThoughtData = {
				thought: longThought,
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			expect(result.isError).toBeUndefined();
		});

		it('should handle special characters in thought', async () => {
			const input: ThoughtData = {
				thought: 'Test with "quotes" and \'apostrophes\' and \n newlines \t tabs',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			expect(result.isError).toBeUndefined();
		});

		it('should handle very large thought_number', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 999999,
				total_thoughts: 5,
				next_thought_needed: false,
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.total_thoughts).toBe(999999);
		});

		it('should handle next_thought_needed as undefined', async () => {
			const input = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
			} as ThoughtData;

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.next_thought_needed).toBe(true); // Default value
		});

		it('should handle tool and skill recommendations with full details', async () => {
			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				available_mcp_tools: ['tool1', 'tool2', 'tool3'],
				available_skills: ['skill1', 'skill2'],
				current_step: {
					step_description: 'Full step with recommendations',
					recommended_tools: [
						{
							tool_name: 'Read',
							confidence: 0.95,
							rationale: 'Perfect for reading files',
							priority: 1,
						},
						{
							tool_name: 'Grep',
							confidence: 0.7,
							rationale: 'Good for searching',
							priority: 2,
							alternatives: ['Glob', 'Find'],
						},
					],
					expected_outcome: 'Files read and searched',
				},
				previous_steps: [
					{
						step_description: 'Step 1',
						recommended_tools: [
							{ tool_name: 'tool1', confidence: 0.8, rationale: 'test', priority: 1 },
						],
						expected_outcome: 'Done',
					},
				],
				remaining_steps: ['Step 3: Final step'],
			};

			const result = await processor.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.available_mcp_tools).toEqual(['tool1', 'tool2', 'tool3']);
			expect(parsed.available_skills).toEqual(['skill1', 'skill2']);
			expect(parsed.current_step.recommended_tools).toHaveLength(2);
			expect(parsed.current_step.recommended_tools[1].alternatives).toEqual(['Glob', 'Find']);
			expect(parsed.previous_steps).toHaveLength(1);
			expect(parsed.remaining_steps).toEqual(['Step 3: Final step']);
		});
	});

	describe('Logging', () => {
		it('should log formatted thoughts when logger is provided', async () => {
			const logSpy = vi.spyOn(logger, 'info');

			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			await processor.process(input);

			expect(logSpy).toHaveBeenCalled();
		});

		it('should use NullLogger as default when no logger provided', async () => {
			const processorWithoutLogger = new ThoughtProcessor(mockHistory, formatter, new ThoughtEvaluator());

			const input: ThoughtData = {
				thought: 'Test thought',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			};

			const result = await processorWithoutLogger.process(input);

			// Should work without throwing errors
			expect(result.content).toBeDefined();
		});
	});

	describe('available_mcp_tools / available_skills persistence (Bug 2 fix)', () => {
		it('should persist available_skills across calls when omitted in subsequent calls', async () => {
			// Thought 1: send available_skills
			const result1 = await processor.process({
				thought: 'First thought',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
				available_skills: ['vercel-react-native-skills', 'agent-browser'],
			});
			const parsed1 = JSON.parse(result1.content[0]!.text);
			expect(parsed1.available_skills).toEqual(['vercel-react-native-skills', 'agent-browser']);

			// Thought 2: omit available_skills — should carry over from Thought 1
			const result2 = await processor.process({
				thought: 'Second thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
			});
			const parsed2 = JSON.parse(result2.content[0]!.text);
			expect(parsed2.available_skills).toEqual(['vercel-react-native-skills', 'agent-browser']);
		});

		it('should persist available_mcp_tools across calls when omitted in subsequent calls', async () => {
			// Thought 1: send available_mcp_tools
			const result1 = await processor.process({
				thought: 'First thought',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
				available_mcp_tools: ['Read', 'Grep', 'Glob'],
			});
			const parsed1 = JSON.parse(result1.content[0]!.text);
			expect(parsed1.available_mcp_tools).toEqual(['Read', 'Grep', 'Glob']);

			// Thought 2: omit available_mcp_tools — should carry over
			const result2 = await processor.process({
				thought: 'Second thought',
				thought_number: 2,
				total_thoughts: 2,
				next_thought_needed: false,
			});
			const parsed2 = JSON.parse(result2.content[0]!.text);
			expect(parsed2.available_mcp_tools).toEqual(['Read', 'Grep', 'Glob']);
		});

		it('should replace cached skills when a new call provides different values', async () => {
			// Thought 1
			await processor.process({
				thought: 'First thought',
				thought_number: 1,
				total_thoughts: 3,
				next_thought_needed: true,
				available_skills: ['skill-a', 'skill-b'],
			});

			// Thought 2: new skills replace the old ones
			await processor.process({
				thought: 'Second thought',
				thought_number: 2,
				total_thoughts: 3,
				next_thought_needed: true,
				available_skills: ['skill-c'],
			});

			// Thought 3: omit — should carry over the replaced values
			const result3 = await processor.process({
				thought: 'Third thought',
				thought_number: 3,
				total_thoughts: 3,
				next_thought_needed: false,
			});
			const parsed3 = JSON.parse(result3.content[0]!.text);
			expect(parsed3.available_skills).toEqual(['skill-c']);
		});

		it('should return undefined for available_skills when never set', async () => {
			const result = await processor.process({
				thought: 'First thought without skills',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			});
			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.available_skills).toBeUndefined();
		});
	});

	describe('ThoughtEvaluator Integration', () => {
		let evaluator: ThoughtEvaluator;
		let processorWithEvaluator: ThoughtProcessor;

		beforeEach(() => {
			evaluator = new ThoughtEvaluator();
			processorWithEvaluator = new ThoughtProcessor(mockHistory, formatter, evaluator, logger);
		});

		it('should include reasoning fields when present in input', async () => {
			const input: ThoughtData = {
				thought: 'Hypothesis: performance bottleneck in rendering',
				thought_number: 1,
				total_thoughts: 3,
				next_thought_needed: true,
				thought_type: 'hypothesis',
				quality_score: 0.85,
				confidence: 0.7,
				hypothesis_id: 'perf-bottleneck-1',
			};

			const result = await processorWithEvaluator.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.thought_type).toBe('hypothesis');
			expect(parsed.quality_score).toBe(0.85);
			expect(parsed.confidence).toBe(0.7);
			expect(parsed.hypothesis_id).toBe('perf-bottleneck-1');
		});

		it('should include confidence_signals when evaluator is present', async () => {
			const input = createHypothesisThought({
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
			});

			const result = await processorWithEvaluator.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.confidence_signals).toBeDefined();
			expect(parsed.confidence_signals.reasoning_depth).toBe(1);
			expect(parsed.confidence_signals.revision_count).toBe(0);
			expect(parsed.confidence_signals.branch_count).toBe(0);
			expect(parsed.confidence_signals.has_hypothesis).toBe(true);
			expect(parsed.confidence_signals.has_verification).toBe(false);
			expect(parsed.confidence_signals.thought_type_distribution).toBeDefined();
			expect(parsed.confidence_signals.thought_type_distribution.hypothesis).toBe(1);
			expect(typeof parsed.confidence_signals.average_confidence).toBe('number');
		});

		it('should include reasoning_stats when evaluator is present', async () => {
			const input = createHypothesisThought({
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
			});

			const result = await processorWithEvaluator.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			expect(parsed.reasoning_stats).toBeDefined();
			expect(parsed.reasoning_stats.total_thoughts).toBe(1);
			expect(parsed.reasoning_stats.total_branches).toBe(0);
			expect(parsed.reasoning_stats.total_revisions).toBe(0);
			expect(parsed.reasoning_stats.total_merges).toBe(0);
			expect(parsed.reasoning_stats.chain_depth).toBe(1);
			expect(parsed.reasoning_stats.thought_type_counts).toBeDefined();
			expect(parsed.reasoning_stats.hypothesis_count).toBe(1);
			expect(parsed.reasoning_stats.verified_hypothesis_count).toBe(0);
			expect(parsed.reasoning_stats.unresolved_hypothesis_count).toBe(1);
			expect(typeof parsed.reasoning_stats.average_quality_score).toBe('number');
			expect(typeof parsed.reasoning_stats.average_confidence).toBe('number');
		});


		it('should produce reasoning fields with standard input', async () => {
			const input = createTestThought();

			const result = await processorWithEvaluator.process(input);
			const parsed = JSON.parse(result.content[0]!.text);

			// Existing fields still present
			expect(parsed.thought_number).toBe(1);
			expect(parsed.total_thoughts).toBe(1);
			expect(parsed.next_thought_needed).toBe(false);
			expect(parsed.branches).toEqual([]);
			expect(parsed.thought_history_length).toBe(1);

			// thought_type is always defaulted to 'regular' by normalizer
			expect(parsed.thought_type).toBe('regular');

			// Evaluator always produces signals
			expect(parsed.confidence_signals).toBeDefined();
			expect(parsed.reasoning_stats).toBeDefined();
		});
	});
});
