
export interface ToolRecommendation {
	tool_name: string;
	confidence: number;  // 0-1 indicating how confident we are this tool is appropriate
	rationale: string;  // Why this tool is recommended
	priority: number;   // Order in the recommendation sequence
	suggested_inputs?: Record<string, unknown>;  // Optional suggested parameters
	alternatives?: string[];  // Alternative tools that could be used
}

export interface SkillRecommendation {
	skill_name: string;              // Name of the skill being recommended
	confidence: number;              // 0-1 indicating confidence in recommendation
	rationale: string;              // Why this skill is recommended
	priority: number;               // Order in the recommendation sequence
	alternatives?: string[];        // Alternative skills that could be used
	allowed_tools?: string[];       // Tools this skill is allowed to use
	user_invocable?: boolean;       // Whether this skill can be user-invoked
}

export interface StepRecommendation {
	step_description: string;  // What needs to be done
	recommended_tools: ToolRecommendation[];  // Tools recommended for this step
	recommended_skills?: SkillRecommendation[];  // Skills recommended for this step
	expected_outcome: string;  // What to expect from this step
	next_step_conditions?: string[];  // Conditions to consider for the next step
}

export interface ThoughtData {
	available_mcp_tools: string[];  // Array of MCP tool names available for use
	available_skills: string[];  // Array of skill names available for use
	thought: string;
	thought_number: number;
	total_thoughts: number;
	is_revision?: boolean;
	revises_thought?: number;
	branch_from_thought?: number;
	branch_id?: string;
	needs_more_thoughts?: boolean;
	next_thought_needed: boolean;

	// Recommendation-related fields
	current_step?: StepRecommendation;  // Current step being considered
	previous_steps?: StepRecommendation[];  // Steps already recommended
	remaining_steps?: string[];  // High-level descriptions of upcoming steps
}

export interface Tool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface Skill {
	name: string;
	description: string;
	user_invocable?: boolean;
	allowed_tools?: string[];
}

export interface ServerConfig {
	available_tools: Map<string, Tool>;
	available_skills: Map<string, Skill>;
}

