import { describe, it, expect } from 'vitest';
import type { Tool } from '../types.js';
import { ToolRegistry } from '../registry/ToolRegistry.js';
import { ConfigLoader } from '../config/ConfigLoader.js';

describe('Tool Registration', () => {
	it('should add tool successfully', () => {
		const toolRegistry = new ToolRegistry();
		const tool: Tool = { name: 'test-tool', description: 'Test tool', inputSchema: {} };
		toolRegistry.addTool(tool);
		expect(toolRegistry.hasTool('test-tool')).toBe(true);
	});

	it('should throw error for duplicate tool', () => {
		const toolRegistry = new ToolRegistry();
		const tool = { name: 'test-tool', description: 'Test tool', inputSchema: {} };
		toolRegistry.addTool(tool);
		expect(() => toolRegistry.addTool(tool)).toThrow("tool 'test-tool' already exists");
	});

	it('should remove tool successfully', () => {
		const toolRegistry = new ToolRegistry();
		const tool = { name: 'test-tool', description: 'Test tool', inputSchema: {} };
		toolRegistry.addTool(tool);
		toolRegistry.removeTool('test-tool');
		expect(toolRegistry.hasTool('test-tool')).toBe(false);
	});

	it('should throw error for removing non-existent tool', () => {
		const toolRegistry = new ToolRegistry();
		expect(() => toolRegistry.removeTool('non-existent')).toThrow(
			"tool 'non-existent' not found, cannot remove"
		);
	});

	it('should update tool successfully', () => {
		const toolRegistry = new ToolRegistry();
		const tool = { name: 'test-tool', description: 'Test tool', inputSchema: {} };
		toolRegistry.addTool(tool);
		toolRegistry.updateTool('test-tool', { description: 'Updated test tool' });
		const updated = toolRegistry.getTool('test-tool');
		expect(updated?.description).toBe('Updated test tool');
	});

	it('should get all tools', () => {
		const toolRegistry = new ToolRegistry();
		const tool1 = { name: 'tool1', description: 'Tool 1', inputSchema: {} };
		const tool2 = { name: 'tool2', description: 'Tool 2', inputSchema: {} };
		toolRegistry.addTool(tool1);
		toolRegistry.addTool(tool2);
		const tools = toolRegistry.getAll();
		expect(tools).toHaveLength(2);
	});

	it('should get tool by name', () => {
		const toolRegistry = new ToolRegistry();
		const tool = { name: 'my-tool', description: 'My tool', inputSchema: {} };
		toolRegistry.addTool(tool);
		const retrieved = toolRegistry.getTool('my-tool');
		expect(retrieved).toEqual(tool);
	});

	it('should clear all tools', () => {
		const toolRegistry = new ToolRegistry();
		const tool1 = { name: 'tool1', description: 'Tool 1', inputSchema: {} };
		toolRegistry.addTool(tool1);
		toolRegistry.clear();
		expect(toolRegistry.size()).toBe(0);
	});
});

describe('Environment Variable Overrides', () => {
	it('should override maxHistorySize from env variable', async () => {
		process.env.MAX_HISTORY_SIZE = '500';

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		expect(config?.maxHistorySize).toBe(500);
	});

	it('should override logLevel from env variable', async () => {
		process.env.LOG_LEVEL = 'debug';

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		expect(config?.logLevel).toBe('debug');
	});

	it('should override prettyLog from env variable', async () => {
		process.env.PRETTY_LOG = 'false';

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		expect(config?.prettyLog).toBe(false);
	});

	it('should override skillDirs from env variable', async () => {
		process.env.SKILL_DIRS = '/custom/skills:/fallback/skills';

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		expect(config?.skillDirs).toEqual(['/custom/skills', '/fallback/skills']);
	});

	it('should parse colon-separated paths correctly', async () => {
		process.env.SKILL_DIRS = 'path1:path2:path3';

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		expect(config?.skillDirs).toEqual(['path1', 'path2', 'path3']);
	});

	it('should not override if env variable is not set', async () => {
		delete process.env.MAX_HISTORY_SIZE;

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		expect(config?.maxHistorySize).not.toBeDefined();
	});
});

describe('Discovery Cache Configuration', () => {
	it('should override cache TTL from env variable', async () => {
		// DISCOVERY_CACHE_TTL is in seconds, converted to milliseconds by ConfigLoader
		process.env.DISCOVERY_CACHE_TTL = '60';

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		const ttl = config?.discoveryCache?.ttl;
		expect(ttl).toBe(60000); // 60 seconds * 1000 = 60000 milliseconds
	});

	it('should override cache maxSize from env variable', async () => {
		process.env.DISCOVERY_CACHE_MAX_SIZE = '50';

		const configLoader = new ConfigLoader();
		const config = configLoader.load();

		const maxSize = config?.discoveryCache?.maxSize;
		expect(maxSize).toBe(50);
	});
});
