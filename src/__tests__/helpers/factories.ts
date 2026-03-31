import type { ThoughtData } from '../../core/thought.js';
import type { ToolRecommendation } from '../../types/tool.js';
import type { SkillRecommendation } from '../../types/skill.js';
import type { StepRecommendation } from '../../core/step.js';
import type { IHistoryManager } from '../../core/IHistoryManager.js';
import type { ThoughtFormatter } from '../../core/ThoughtFormatter.js';

// === Data Factories ===

export function createTestThought(overrides?: Partial<ThoughtData>): ThoughtData {
	return {
		available_mcp_tools: ['test-tool'],
		available_skills: ['test-skill'],
		thought: 'Test thought',
		thought_number: 1,
		total_thoughts: 1,
		next_thought_needed: false,
		...overrides,
	};
}

export function createToolRecommendation(
	overrides?: Partial<ToolRecommendation>
): ToolRecommendation {
	return {
		tool_name: 'test-tool',
		confidence: 0.8,
		rationale: 'Test rationale',
		priority: 1,
		...overrides,
	};
}

export function createSkillRecommendation(
	overrides?: Partial<SkillRecommendation>
): SkillRecommendation {
	return {
		skill_name: 'test-skill',
		confidence: 0.7,
		rationale: 'Test skill rationale',
		priority: 1,
		...overrides,
	};
}

export function createStepRecommendation(
	overrides?: Partial<StepRecommendation>
): StepRecommendation {
	return {
		step_description: 'Test step description',
		recommended_tools: [createToolRecommendation()],
		expected_outcome: 'Test expected outcome',
		...overrides,
	};
}

export function createHypothesisThought(overrides?: Partial<ThoughtData>): ThoughtData {
	return createTestThought({
		thought: 'Hypothesis: This might be the solution',
		thought_type: 'hypothesis',
		quality_score: 0.7,
		confidence: 0.6,
		hypothesis_id: 'hyp-1',
		reasoning_depth: 'moderate',
		...overrides,
	});
}

export function createVerificationThought(overrides?: Partial<ThoughtData>): ThoughtData {
	return createTestThought({
		thought: 'Verification: Testing the hypothesis',
		thought_type: 'verification',
		quality_score: 0.8,
		confidence: 0.9,
		hypothesis_id: 'hyp-1',
		verification_target: 1,
		...overrides,
	});
}

export function createCritiqueThought(overrides?: Partial<ThoughtData>): ThoughtData {
	return createTestThought({
		thought: 'Critique: This reasoning has issues',
		thought_type: 'critique',
		quality_score: 0.5,
		confidence: 0.7,
		verification_target: 2,
		meta_observation: 'Previous reasoning overlooked edge cases',
		...overrides,
	});
}

export function createSynthesisThought(overrides?: Partial<ThoughtData>): ThoughtData {
	return createTestThought({
		thought: 'Synthesis: Combining insights from multiple branches',
		thought_type: 'synthesis',
		quality_score: 0.85,
		confidence: 0.8,
		synthesis_sources: [1, 2, 3],
		merge_from_thoughts: [1, 3],
		merge_branch_ids: ['branch-a'],
		...overrides,
	});
}

export function createMetaThought(overrides?: Partial<ThoughtData>): ThoughtData {
	return createTestThought({
		thought: 'Meta: Observing the reasoning process itself',
		thought_type: 'meta',
		meta_observation: 'Current reasoning path is converging well',
		reasoning_depth: 'shallow',
		...overrides,
	});
}

// === Mock Classes ===

/**
 * Mock implementation of IHistoryManager for testing.
 * Tracks calls and stores data in-memory.
 */
export class MockHistoryManager implements IHistoryManager {
	private _history: ThoughtData[] = [];
	private _branches: Record<string, ThoughtData[]> = {};
	private _clearCallCount = 0;
	private _availableMcpTools: string[] | undefined;
	private _availableSkills: string[] | undefined;

	addThought(thought: ThoughtData): void {
		this._history.push(thought);
		if (thought.available_mcp_tools) {
			this._availableMcpTools = thought.available_mcp_tools;
		}
		if (thought.available_skills) {
			this._availableSkills = thought.available_skills;
		}
	}

	getHistory(): ThoughtData[] {
		return this._history;
	}

	getHistoryLength(): number {
		return this._history.length;
	}

	getBranches(): Record<string, ThoughtData[]> {
		return this._branches;
	}

	getBranchIds(): string[] {
		return Object.keys(this._branches);
	}

	clear(): void {
		this._history = [];
		this._branches = {};
		this._availableMcpTools = undefined;
		this._availableSkills = undefined;
		this._clearCallCount++;
	}

	getClearCallCount(): number {
		return this._clearCallCount;
	}

	getAvailableMcpTools(): string[] | undefined {
		return this._availableMcpTools;
	}

	getAvailableSkills(): string[] | undefined {
		return this._availableSkills;
	}
}

// === Formatter Mock ===

export function createMockFormatter(): Pick<ThoughtFormatter, 'formatThought'> {
	return {
		formatThought(thoughtData: ThoughtData): string {
			const result = {
				thought_number: thoughtData.thought_number,
				total_thoughts: thoughtData.total_thoughts,
				next_thought_needed: thoughtData.next_thought_needed,
				thought: thoughtData.thought,
			};
			return JSON.stringify(result);
		},
	};
}
