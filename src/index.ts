#!/usr/bin/env node

// adapted from https://github.com/modelcontextprotocol/servers/blob/main/src/sequentialthinking/index.ts
// for use with mcp tools

import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { StdioTransport } from '@tmcp/transport-stdio';
import * as v from 'valibot';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SequentialThinkingSchema, SEQUENTIAL_THINKING_TOOL } from './schema.js';
import { ThoughtData, Tool, Skill } from './types.js';

// New component imports
import { HistoryManager } from './HistoryManager.js';
import { ThoughtProcessor } from './processor/ThoughtProcessor.js';
import { ThoughtFormatter } from './formatter/ThoughtFormatter.js';
import { ServerConfig } from './ServerConfig.js';
import { StructuredLogger } from './logger/StructuredLogger.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { SkillWatcher } from './SkillWatcher.js';
import { ToolWatcher } from './ToolWatcher.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const package_json = JSON.parse(
	readFileSync(join(__dirname, '../package.json'), 'utf-8'),
);
const { name, version } = package_json;

// Handle CLI arguments
const args = process.argv.slice(2);
const shouldShowVersion = args.includes('--version') || args.includes('-v');

if (shouldShowVersion) {
	console.log(`${name} v${version}`);
	process.exit(0);
}

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
	maxBranches?: number;
	maxBranchSize?: number;
	logger?: StructuredLogger;
	enableWatcher?: boolean;
}

export class ToolAwareSequentialThinkingServer {
	// Component instances (private)
	private _logger: StructuredLogger;
	private _historyManager: HistoryManager;
	private _thoughtProcessor: ThoughtProcessor;
	private _skillWatcher: SkillWatcher | null = null;
	private _toolWatcher: ToolWatcher | null = null;

	constructor(options: ServerOptions = {}) {
		// Load config from file first
		const configLoader = new ConfigLoader();
		const fileConfig = configLoader.load();

		// Initialize config with file defaults overridden by constructor options
		const config = new ServerConfig({
			maxHistorySize: options.maxHistorySize ?? fileConfig?.maxHistorySize,
			maxBranches: options.maxBranches ?? fileConfig?.maxBranches,
			maxBranchSize: options.maxBranchSize ?? fileConfig?.maxBranchSize,
		});

		// Initialize logger
		this._logger = options.logger ?? new StructuredLogger({
			level: fileConfig?.logLevel ?? 'info',
			context: 'SequentialThinking',
			pretty: fileConfig?.prettyLog ?? true,
		});

		// Initialize history manager with logger
		this._historyManager = new HistoryManager({
			maxHistorySize: config.maxHistorySize,
			maxBranches: config.maxBranches,
			maxBranchSize: config.maxBranchSize,
			logger: this._logger,
		});

		// Initialize formatter and processor
		const thoughtFormatter = new ThoughtFormatter();
		this._thoughtProcessor = new ThoughtProcessor(
			this._historyManager,
			thoughtFormatter,
			this._logger,
		);

		// Always include the sequential thinking tool
		this.addTool(SEQUENTIAL_THINKING_TOOL);

		// Discover skills at startup
		this.discoverSkills();

		// Initialize watchers if enabled
		if (options.enableWatcher) {
			this._skillWatcher = new SkillWatcher(this._historyManager.skills);
			this._toolWatcher = new ToolWatcher(this._historyManager.tools);
		}
	}

	// ========== PUBLIC API (Backward Compatible) ==========

	public getAvailableTools(): Tool[] {
		return this._historyManager.tools.getAll();
	}

	public getAvailableSkills(): Skill[] {
		return this._historyManager.skills.getAll();
	}

	// Tool CRUD methods - delegate to ToolRegistry
	public addTool(tool: Tool): void {
		this._historyManager.tools.addTool(tool);
	}

	public removeTool(name: string): void {
		this._historyManager.tools.removeTool(name);
	}

	public updateTool(name: string, updates: Partial<Tool>): void {
		this._historyManager.tools.updateTool(name, updates);
	}

	public clearTools(): void {
		this._historyManager.tools.clear();
	}

	public hasTool(name: string): boolean {
		return this._historyManager.tools.hasTool(name);
	}

	public getTool(name: string): Tool | undefined {
		return this._historyManager.tools.getTool(name);
	}

	// Skill CRUD methods - delegate to SkillRegistry
	public addSkill(skill: Skill): void {
		this._historyManager.skills.addSkill(skill);
	}

	public removeSkill(name: string): void {
		this._historyManager.skills.removeSkillByName(name);
	}

	public updateSkill(name: string, updates: Partial<Skill>): void {
		this._historyManager.skills.updateSkill(name, updates);
	}

	public clearSkills(): void {
		this._historyManager.skills.clear();
	}

	public hasSkill(name: string): boolean {
		return this._historyManager.skills.hasSkill(name);
	}

	public getSkill(name: string): Skill | undefined {
		return this._historyManager.skills.getSkill(name);
	}

	// History management - delegate to HistoryManager
	public getHistory(): ThoughtData[] {
		return this._historyManager.getHistory();
	}

	public getBranches(): Record<string, ThoughtData[]> {
		return this._historyManager.getBranches();
	}

	public clearHistory(): void {
		this._historyManager.clear();
	}

	// Discovery methods
	public discoverTools(): number {
		const tools = this._historyManager.tools.getNames();
		this._logger.info(`Discovered ${tools.length} tools`, { toolCount: tools.length });
		return tools.length;
	}

	public discoverSkills(): number {
		const discovered = this._historyManager.skills.discover();
		return discovered;
	}

	// Main processing method - delegate to ThoughtProcessor
	public async processThought(input: v.InferInput<typeof SequentialThinkingSchema>) {
		const result = await this._thoughtProcessor.process(input as ThoughtData);
		return result;
	}

	/**
	 * Stop the server and clean up watchers
	 */
	public stop(): void {
		this._skillWatcher?.stop();
		this._toolWatcher?.stop();
		this._logger.info('Server stopped, watchers cleaned up');
	}
}

// Global server initialization
const configLoader = new ConfigLoader();
const fileConfig = configLoader.load();

const logger = new StructuredLogger({
	level: fileConfig?.logLevel ?? 'info',
	context: 'SequentialThinking',
	pretty: fileConfig?.prettyLog ?? true,
});

const thinkingServer = new ToolAwareSequentialThinkingServer({
	logger,
	enableWatcher: true,
});

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
	logger.info('Sequential Thinking MCP Server running on stdio');
}

main().catch((error) => {
	logger.error('Fatal error running server', { error: error instanceof Error ? error.message : String(error) });
	process.exit(1);
});
