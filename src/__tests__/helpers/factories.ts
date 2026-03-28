import type { ThoughtData } from '../../types/thought.js';
import type { ToolRecommendation } from '../../types/tool.js';
import type { SkillRecommendation } from '../../types/skill.js';
import type { StepRecommendation } from '../../types/step.js';
import type { IHistoryManager } from '../../IHistoryManager.js';
import type { ThoughtFormatter } from '../../formatter/ThoughtFormatter.js';

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
