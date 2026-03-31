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

	describe('cross-field reference validation', () => {
		it('should drop verification_target referencing non-existent thought', async () => {
			// Seed 3 thoughts into history
			for (let i = 1; i <= 3; i++) {
				await processor.process({
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 5,
					next_thought_needed: true,
				});
			}

			const result = await processor.process({
				thought: 'Verify something',
				thought_number: 4,
				total_thoughts: 5,
				next_thought_needed: true,
				thought_type: 'verification',
				verification_target: 999,
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.warnings).toBeDefined();
			expect(parsed.warnings).toHaveLength(1);
			expect(parsed.warnings[0]).toContain('verification_target');
			expect(parsed.warnings[0]).toContain('999');
		});

		it('should filter synthesis_sources keeping only valid references', async () => {
			// Seed 5 thoughts
			for (let i = 1; i <= 5; i++) {
				await processor.process({
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 7,
					next_thought_needed: true,
				});
			}

			const result = await processor.process({
				thought: 'Synthesize',
				thought_number: 6,
				total_thoughts: 7,
				next_thought_needed: true,
				thought_type: 'synthesis',
				synthesis_sources: [1, 999],
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.warnings).toBeDefined();
			expect(parsed.warnings[0]).toContain('synthesis_sources');
			expect(parsed.warnings[0]).toContain('999');
			// The thought should still be added (no rejection)
			expect(result.isError).toBeUndefined();
		});

		it('should drop non-existent merge_branch_ids', async () => {
			const result = await processor.process({
				thought: 'Merge',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				merge_branch_ids: ['nonexistent'],
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.warnings).toBeDefined();
			expect(parsed.warnings[0]).toContain('merge_branch_ids');
			expect(parsed.warnings[0]).toContain('nonexistent');
		});

		it('should drop revises_thought referencing non-existent thought', async () => {
			// Seed 5 thoughts
			for (let i = 1; i <= 5; i++) {
				await processor.process({
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 7,
					next_thought_needed: true,
				});
			}

			const result = await processor.process({
				thought: 'Revise',
				thought_number: 6,
				total_thoughts: 7,
				next_thought_needed: true,
				is_revision: true,
				revises_thought: 50,
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.warnings).toBeDefined();
			expect(parsed.warnings[0]).toContain('revises_thought');
			expect(parsed.warnings[0]).toContain('50');
		});

		it('should pass through all valid references without warnings', async () => {
			// Seed 3 thoughts
			for (let i = 1; i <= 3; i++) {
				await processor.process({
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 5,
					next_thought_needed: true,
				});
			}

			const result = await processor.process({
				thought: 'Verify thought 2',
				thought_number: 4,
				total_thoughts: 5,
				next_thought_needed: true,
				thought_type: 'verification',
				verification_target: 2,
				synthesis_sources: [1, 3],
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.warnings).toBeUndefined();
		});

		it('should drop all references when history is empty', async () => {
			const result = await processor.process({
				thought: 'First thought with references',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				verification_target: 5,
				revises_thought: 3,
				branch_from_thought: 2,
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.warnings).toBeDefined();
			expect(parsed.warnings).toHaveLength(3);
			expect(result.isError).toBeUndefined();
		});

		it('should filter mixed valid/invalid merge_from_thoughts', async () => {
			// Seed 3 thoughts
			for (let i = 1; i <= 3; i++) {
				await processor.process({
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 5,
					next_thought_needed: true,
				});
			}

			const result = await processor.process({
				thought: 'Merge thoughts',
				thought_number: 4,
				total_thoughts: 5,
				next_thought_needed: true,
				merge_from_thoughts: [1, 2, 100, 200],
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.warnings).toBeDefined();
			expect(parsed.warnings[0]).toContain('merge_from_thoughts');
			expect(parsed.warnings[0]).toContain('100');
			expect(parsed.warnings[0]).toContain('200');
			expect(result.isError).toBeUndefined();
		});
	});

	describe('thought_number > total_thoughts auto-adjust warning', () => {
		it('should log warning and include in response when auto-adjusting total_thoughts', async () => {
			const mockHistoryManager = new MockHistoryManager();
			const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

			const proc = new ThoughtProcessor(
				mockHistoryManager,
				new ThoughtFormatter(),
				new ThoughtEvaluator(),
				mockLogger as any,
			);

			const result = await proc.process({
				thought: 'test',
				thought_number: 99,
				total_thoughts: 3,
				next_thought_needed: true,
			});

			// Verify auto-adjust occurred
			const response = JSON.parse(result.content[0]!.text);
			expect(response.total_thoughts).toBe(99);

			// Verify warning logged
			expect(mockLogger.warn).toHaveBeenCalledWith(
				'Auto-adjusted total_thoughts to match thought_number',
				expect.objectContaining({
					thought_number: 99,
					original_total_thoughts: 3,
					adjusted_total_thoughts: 99,
				}),
			);

			// Verify warning in response
			expect(response.warnings).toEqual(
				expect.arrayContaining([
					expect.stringContaining('Auto-adjusted total_thoughts from 3 to 99'),
				]),
			);
		});

		it('should not warn when thought_number <= total_thoughts', async () => {
			const mockHistoryManager = new MockHistoryManager();
			const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

			const proc = new ThoughtProcessor(
				mockHistoryManager,
				new ThoughtFormatter(),
				new ThoughtEvaluator(),
				mockLogger as any,
			);

			const result = await proc.process({
				thought: 'test',
				thought_number: 3,
				total_thoughts: 5,
				next_thought_needed: true,
			});

			const response = JSON.parse(result.content[0]!.text);
			expect(response.total_thoughts).toBe(5);

			// No auto-adjust warning
			expect(mockLogger.warn).not.toHaveBeenCalledWith(
				'Auto-adjusted total_thoughts to match thought_number',
				expect.anything(),
			);

			// No warnings in response (unless cross-field validation adds some)
			expect(response.warnings).toBeUndefined();
		});
	});

	describe('session isolation', () => {
		it('passes session_id to historyManager.getHistory()', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);
			const spy = vi.spyOn(mockHM, 'getHistory');

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'sess-a',
			});

			expect(spy).toHaveBeenCalledWith('sess-a');
		});

		it('passes session_id to historyManager.getBranches()', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);
			const spy = vi.spyOn(mockHM, 'getBranches');

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'sess-b',
			});

			expect(spy).toHaveBeenCalledWith('sess-b');
		});

		it('passes session_id to historyManager.getHistoryLength()', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);
			const spy = vi.spyOn(mockHM, 'getHistoryLength');

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'sess-c',
			});

			expect(spy).toHaveBeenCalledWith('sess-c');
		});

		it('passes session_id to historyManager.getBranchIds()', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);
			const spy = vi.spyOn(mockHM, 'getBranchIds');

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'sess-d',
			});

			expect(spy).toHaveBeenCalledWith('sess-d');
		});

		it('passes session_id to historyManager.getAvailableMcpTools()', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);
			const spy = vi.spyOn(mockHM, 'getAvailableMcpTools');

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'sess-e',
			});

			expect(spy).toHaveBeenCalledWith('sess-e');
		});

		it('passes session_id to historyManager.getAvailableSkills()', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);
			const spy = vi.spyOn(mockHM, 'getAvailableSkills');

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'sess-f',
			});

			expect(spy).toHaveBeenCalledWith('sess-f');
		});

		it('includes session_id in response when provided', async () => {
			const result = await processor.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'my-session',
			});
			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.session_id).toBe('my-session');
		});

		it('omits session_id from response when not provided', async () => {
			const result = await processor.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			});
			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.session_id).toBeUndefined();
		});

		it('uses session-scoped history for cross-reference validation', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);

			// Add 2 thoughts to session 'alpha'
			for (let i = 1; i <= 2; i++) {
				await proc.process({
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 3,
					next_thought_needed: true,
					session_id: 'alpha',
				});
			}

			// Thought 3 in 'alpha' references revises_thought: 1 (valid)
			const result = await proc.process({
				thought: 'Revise thought 1',
				thought_number: 3,
				total_thoughts: 3,
				next_thought_needed: false,
				session_id: 'alpha',
				is_revision: true,
				revises_thought: 1,
			});

			const parsed = JSON.parse(result.content[0]!.text);
			// Should NOT have warnings since thought 1 exists in session 'alpha'
			expect(parsed.warnings).toBeUndefined();
		});
	});

	describe('reset_state', () => {
		it('calls historyManager.clear(sessionId) when reset_state is true', async () => {
			const mockHM = new MockHistoryManager();
			const spy = vi.spyOn(mockHM, 'clear');
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'my-session',
				reset_state: true,
			});

			expect(spy).toHaveBeenCalledWith('my-session');
		});

		it('does not call clear when reset_state is false', async () => {
			const mockHM = new MockHistoryManager();
			const spy = vi.spyOn(mockHM, 'clear');
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'my-session',
				reset_state: false,
			});

			expect(spy).not.toHaveBeenCalled();
		});

		it('does not call clear when reset_state is omitted', async () => {
			const mockHM = new MockHistoryManager();
			const spy = vi.spyOn(mockHM, 'clear');
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);

			await proc.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				session_id: 'my-session',
			});

			expect(spy).not.toHaveBeenCalled();
		});

		it('processes thought as first after reset (history_length = 1)', async () => {
			const mockHM = new MockHistoryManager();
			const proc = new ThoughtProcessor(mockHM, formatter, new ThoughtEvaluator(), logger);

			// Add 3 thoughts to the session
			for (let i = 1; i <= 3; i++) {
				await proc.process({
					thought: `Thought ${i}`,
					thought_number: i,
					total_thoughts: 5,
					next_thought_needed: true,
					session_id: 'reset-sess',
				});
			}

			// Fourth thought with reset_state: true should start fresh
			const result = await proc.process({
				thought: 'Fresh start',
				thought_number: 1,
				total_thoughts: 2,
				next_thought_needed: true,
				session_id: 'reset-sess',
				reset_state: true,
			});

			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.thought_history_length).toBe(1);
		});

		it('does not echo reset_state in response', async () => {
			const result = await processor.process({
				thought: 'Test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
				reset_state: true,
			});
			const parsed = JSON.parse(result.content[0]!.text);
			expect(parsed.reset_state).toBeUndefined();
		});
	});
});
