#!/usr/bin/env node

// adapted from https://github.com/modelcontextprotocol/servers/blob/main/src/sequentialthinking/index.ts
// for use with mcp tools

import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { StdioTransport } from '@tmcp/transport-stdio';
import * as v from 'valibot';
import chalk from 'chalk';
import { parse as parseYaml } from 'yaml';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { SequentialThinkingSchema, SEQUENTIAL_THINKING_TOOL } from './schema.js';
import { ThoughtData, StepRecommendation, Tool, Skill } from './types.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const package_json = JSON.parse(
	readFileSync(join(__dirname, '../package.json'), 'utf-8'),
);
const { name, version } = package_json;

// Create MCP server with tmcp
const adapter = new ValibotJsonSchemaAdapter();
const server = new McpServer(
	{
		name,
		version,
		description: 'MCP server for Sequential Thinking Tools',
	},
	{
		adapter,
		capabilities: {
			tools: { listChanged: true },
		},
	},
);

interface ServerOptions {
	maxHistorySize?: number;
}

export class ToolAwareSequentialThinkingServer {
	private thought_history: ThoughtData[] = [];
	private branches: Record<string, ThoughtData[]> = {};
	private available_tools: Map<string, Tool> = new Map();
	private available_skills: Map<string, Skill> = new Map();
	private maxHistorySize: number;

	public getAvailableTools(): Tool[] {
		return Array.from(this.available_tools.values());
	}

	public getAvailableSkills(): Skill[] {
		return Array.from(this.available_skills.values());
	}

	constructor(options: ServerOptions = {}) {
		this.maxHistorySize = options.maxHistorySize || 1000;

		// Always include the sequential thinking tool
		this.addTool(SEQUENTIAL_THINKING_TOOL);
	}

	// Generic CRUD helpers to eliminate duplication
	private addEntity<T extends { name: string }>(
		collection: Map<string, T>,
		entity: T,
		collectionName: string,
	): void {
		if (collection.has(entity.name)) {
			console.error(`Warning: ${collectionName} '${entity.name}' already exists`);
			return;
		}
		collection.set(entity.name, entity);
		console.error(`Added ${collectionName}: ${entity.name}`);
	}

	private removeEntity<T>(
		collection: Map<string, T>,
		name: string,
		collectionName: string,
	): boolean {
		if (!collection.has(name)) {
			console.error(`Warning: ${collectionName} '${name}' not found, cannot remove`);
			return false;
		}
		collection.delete(name);
		console.error(`Removed ${collectionName}: ${name}`);
		return true;
	}

	private updateEntity<T>(
		collection: Map<string, T>,
		name: string,
		updates: Partial<T>,
		collectionName: string,
	): boolean {
		if (!collection.has(name)) {
			console.error(`Warning: ${collectionName} '${name}' not found, cannot update`);
			return false;
		}
		const existing = collection.get(name)!;
		const updated = { ...existing, ...updates };
		collection.set(name, updated);
		console.error(`Updated ${collectionName}: ${name}`);
		return true;
	}

	private hasEntity<T>(collection: Map<string, T>, name: string): boolean {
		return collection.has(name);
	}

	private getEntity<T>(collection: Map<string, T>, name: string): T | undefined {
		return collection.get(name);
	}

	public clearHistory(): void {
		this.thought_history = [];
		this.branches = {};
		console.error('History cleared');
	}

	// Tool CRUD methods - using generic helpers
	public addTool(tool: Tool): void {
		this.addEntity(this.available_tools, tool, 'tool');
	}

	public addSkill(skill: Skill): void {
		this.addEntity(this.available_skills, skill, 'skill');
	}

	public removeTool(name: string): boolean {
		return this.removeEntity(this.available_tools, name, 'tool');
	}

	public removeSkill(name: string): boolean {
		return this.removeEntity(this.available_skills, name, 'skill');
	}

	public updateTool(name: string, updates: Partial<Tool>): boolean {
		return this.updateEntity(this.available_tools, name, updates, 'tool');
	}

	public updateSkill(name: string, updates: Partial<Skill>): boolean {
		return this.updateEntity(this.available_skills, name, updates, 'skill');
	}

	public clearTools(): void {
		this.available_tools.clear();
		console.error('Cleared all tools');
	}

	public clearSkills(): void {
		this.available_skills.clear();
		console.error('Cleared all skills');
	}

	public hasTool(name: string): boolean {
		return this.hasEntity(this.available_tools, name);
	}

	public hasSkill(name: string): boolean {
		return this.hasEntity(this.available_skills, name);
	}

	public getTool(name: string): Tool | undefined {
		return this.getEntity(this.available_tools, name);
	}

	public getSkill(name: string): Skill | undefined {
		return this.getEntity(this.available_skills, name);
	}

	public discoverTools(): void {
		// MCP tools are provided by the LLM in each call via available_mcp_tools parameter
		// This server tracks them but doesn't discover them from the environment
		console.error('Tool discovery: Tools are provided by LLM per call, not discovered');
	}

	public discoverSkills(): number {
		let discovered = 0;
		let scannedDirs = 0;

		// Directories to scan (in priority order - project overrides user)
		const skillDirs = [
			'.claude/skills',    // Project-local (highest priority)
			join(homedir(), '.claude/skills'),  // User-global
		];

		for (const dir of skillDirs) {
			if (!existsSync(dir)) {
				continue;
			}

			scannedDirs++;
			console.error(`Scanning skills directory: ${dir}`);

			try {
				const entries = readdirSync(dir, { withFileTypes: true });

				for (const entry of entries) {
					if (!entry.isDirectory()) {
						continue;
					}

					const skillPath = join(dir, entry.name);
					// Try SKILL.md first (uppercase), then fall back to skill.md (lowercase)
					const skillFileUpper = join(skillPath, 'SKILL.md');
					const skillFileLower = join(skillPath, 'skill.md');
					const skillFile = existsSync(skillFileUpper) ? skillFileUpper : skillFileLower;

					if (!existsSync(skillFile)) {
						continue;
					}

					// Read and parse skill file (SKILL.md or skill.md)
					const content = readFileSync(skillFile, 'utf-8');
					const skillData = this.parseSkillFrontmatter(content);

					if (skillData.name) {
						// Ensure we have a complete Skill object before adding
						const skill: Skill = {
							name: skillData.name,
							description: skillData.description || '',
							user_invocable: skillData.user_invocable,
							allowed_tools: skillData.allowed_tools,
						};
						this.addSkill(skill);
						discovered++;
					}
				}
			} catch (error) {
				console.error(`Error scanning ${dir}:`, error instanceof Error ? error.message : String(error));
			}
		}

		console.error(`Discovered ${discovered} skills from ${scannedDirs} directories`);
		return discovered;
	}

	private parseSkillFrontmatter(content: string): Partial<Skill> {
		// Parse YAML frontmatter from skill file (SKILL.md or skill.md)
		const match = content.match(/^---\n([\s\S]+?)\n---/);
		if (!match) {
			console.error('Warning: No frontmatter found in skill file');
			return {};
		}

		try {
			const frontmatter = parseYaml(match[1]) as Record<string, unknown>;

			return {
				name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
				description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
				user_invocable: frontmatter['user-invocable'] === true,
				allowed_tools: Array.isArray(frontmatter['allowed-tools'])
					? frontmatter['allowed-tools'].map(String)
					: undefined,
			};
		} catch (error) {
			console.error('Error parsing YAML frontmatter:', error instanceof Error ? error.message : String(error));
			return {};
		}
	}

	private formatRecommendation(step: StepRecommendation): string {
		const tools = step.recommended_tools
			.map((tool) => {
				const alternatives = tool.alternatives?.length
					? ` (alternatives: ${tool.alternatives.join(', ')})`
					: '';
				const inputs = tool.suggested_inputs
					? `\n    Suggested inputs: ${JSON.stringify(tool.suggested_inputs)}`
					: '';
				return `  - ${tool.tool_name} (priority: ${tool.priority})${alternatives}
    Rationale: ${tool.rationale}${inputs}`;
			})
			.join('\n');

		const skills = step.recommended_skills?.length
			? step.recommended_skills
				.map((skill) => {
					const alternatives = skill.alternatives?.length
						? ` (alternatives: ${skill.alternatives.join(', ')})`
						: '';
					const toolsInfo = skill.allowed_tools?.length
						? `\n    Allowed tools: ${skill.allowed_tools.join(', ')}`
						: '';
					return `  - ${skill.skill_name} (priority: ${skill.priority})${alternatives}
    Rationale: ${skill.rationale}${toolsInfo}`;
				})
				.join('\n')
			: '';

		let output = `Step: ${step.step_description}`;

		if (step.recommended_tools?.length) {
			output += `\nRecommended Tools:\n${tools}`;
		}

		if (skills) {
			output += `\nRecommended Skills:\n${skills}`;
		}

		output += `\nExpected Outcome: ${step.expected_outcome}${
			step.next_step_conditions
				? `\nConditions for next step:\n  - ${step.next_step_conditions.join('\n  - ')}`
				: ''
		}`;

		return output;
	}

	private formatThought(thoughtData: ThoughtData): string {
		const {
			thought_number,
			total_thoughts,
			thought,
			is_revision,
			revises_thought,
			branch_from_thought,
			branch_id,
			current_step,
		} = thoughtData;

		let prefix = '';
		let context = '';

		if (is_revision) {
			prefix = chalk.yellow('🔄 Revision');
			context = ` (revising thought ${revises_thought})`;
		} else if (branch_from_thought) {
			prefix = chalk.green('🌿 Branch');
			context = ` (from thought ${branch_from_thought}, ID: ${branch_id})`;
		} else {
			prefix = chalk.blue('💭 Thought');
			context = '';
		}

		const header = `${prefix} ${thought_number}/${total_thoughts}${context}`;
		let content = thought;

		// Add recommendation information if present
		if (current_step) {
			content = `${thought}\n\nRecommendation:\n${this.formatRecommendation(current_step)}`;
		}

		const border = '─'.repeat(
			Math.max(header.length, content.length) + 4,
		);

		return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${content.padEnd(border.length - 2)} │
└${border}┘`;
	}

	public async processThought(input: v.InferInput<typeof SequentialThinkingSchema>) {
		try {
			// Input is already validated by tmcp with Valibot
			const validatedInput = input as ThoughtData;

			if (
				validatedInput.thought_number > validatedInput.total_thoughts
			) {
				validatedInput.total_thoughts = validatedInput.thought_number;
			}

			// Store the current step in thought history
			if (validatedInput.current_step) {
				if (!validatedInput.previous_steps) {
					validatedInput.previous_steps = [];
				}
				validatedInput.previous_steps.push(validatedInput.current_step);
			}

			this.thought_history.push(validatedInput);

		// Prevent memory leaks by limiting history size
		if (this.thought_history.length > this.maxHistorySize) {
			this.thought_history = this.thought_history.slice(-this.maxHistorySize);
			console.error(`History trimmed to ${this.maxHistorySize} items`);
		}

			if (
				validatedInput.branch_from_thought &&
				validatedInput.branch_id
			) {
				if (!this.branches[validatedInput.branch_id]) {
					this.branches[validatedInput.branch_id] = [];
				}
				this.branches[validatedInput.branch_id].push(validatedInput);
			}

			const formattedThought = this.formatThought(validatedInput);
			console.error(formattedThought);

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
								thought_number: validatedInput.thought_number,
								total_thoughts: validatedInput.total_thoughts,
								next_thought_needed:
									validatedInput.next_thought_needed ?? true,
								branches: Object.keys(this.branches),
								thought_history_length: this.thought_history.length,
								available_mcp_tools: validatedInput.available_mcp_tools,
								available_skills: validatedInput.available_skills,
								current_step: validatedInput.current_step,
								previous_steps: validatedInput.previous_steps,
								remaining_steps: validatedInput.remaining_steps,
							},
							null,
							2,
						),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
								error:
									error instanceof Error
										? error.message
										: String(error),
								status: 'failed',
							},
							null,
							2,
						),
					},
				],
				isError: true,
			};
		}
	}

	// Tool execution removed - the MCP client handles tool execution
	// This server only provides tool recommendations
}

// Read configuration from environment variables or command line args
const maxHistorySize = parseInt(process.env.MAX_HISTORY_SIZE || '1000');

const thinkingServer = new ToolAwareSequentialThinkingServer({
	maxHistorySize,
});

// Discover skills at startup
thinkingServer.discoverSkills();

// Register the sequential thinking tool
server.tool(
	{
		name: 'sequentialthinking_tools',
		description: SEQUENTIAL_THINKING_TOOL.description,
		schema: SequentialThinkingSchema,
	},
	async (input) => {
		return thinkingServer.processThought(input);
	},
);

async function main() {
	const transport = new StdioTransport(server);
	transport.listen();
	console.error('Sequential Thinking MCP Server running on stdio');
}

main().catch((error) => {
	console.error('Fatal error running server:', error);
	process.exit(1);
});
