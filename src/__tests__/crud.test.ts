import { describe, it, expect, beforeEach } from 'vitest';
import { ToolAwareSequentialThinkingServer } from '../index.js';
import type { Tool, Skill, ThoughtData } from '../types.js';

describe('CRUD Operations', () => {
	let server: ToolAwareSequentialThinkingServer;

	beforeEach(() => {
		server = new ToolAwareSequentialThinkingServer({ maxHistorySize: 10 });
	});

	describe('Tool CRUD', () => {
		const mockTool: Tool = {
			name: 'test-tool',
			description: 'A test tool',
			inputSchema: {},
		};

		it('should add a tool', () => {
			server.addTool(mockTool);
			expect(server.hasTool('test-tool')).toBe(true);
			expect(server.getTool('test-tool')).toEqual(mockTool);
		});

		it('should not add duplicate tool', () => {
			server.addTool(mockTool);
			expect(() => server.addTool(mockTool)).toThrow("tool 'test-tool' already exists");
			const tools = server.getAvailableTools();
			const testTools = tools.filter((t: Tool) => t.name === 'test-tool');
			expect(testTools.length).toBe(1);
		});

		it('should remove a tool', () => {
			server.addTool(mockTool);
			server.removeTool('test-tool');
			expect(server.hasTool('test-tool')).toBe(false);
		});

		it('should throw when removing non-existent tool', () => {
			expect(() => server.removeTool('non-existent')).toThrow("tool 'non-existent' not found");
		});

		it('should update a tool', () => {
			server.addTool(mockTool);
			server.updateTool('test-tool', { description: 'Updated description' });
			expect(server.getTool('test-tool')?.description).toBe('Updated description');
		});

		it('should throw when updating non-existent tool', () => {
			expect(() => server.updateTool('non-existent', { description: 'New' }))
				.toThrow("tool 'non-existent' not found");
		});

		it('should clear all tools', () => {
			server.addTool(mockTool);
			server.addTool({ name: 'another-tool', description: 'Another', inputSchema: {} });
			server.clearTools();
			expect(server.getAvailableTools().length).toBe(0);
		});
	});

	describe('Skill CRUD', () => {
		const mockSkill: Skill = {
			name: 'test-skill',
			description: 'A test skill',
			user_invocable: true,
		};

		it('should add a skill', () => {
			server.addSkill(mockSkill);
			expect(server.hasSkill('test-skill')).toBe(true);
			expect(server.getSkill('test-skill')).toEqual(mockSkill);
		});

		it('should not add duplicate skill', () => {
			server.addSkill(mockSkill);
			expect(() => server.addSkill(mockSkill)).toThrow("skill 'test-skill' already exists");
			const skills = server.getAvailableSkills();
			const testSkills = skills.filter((s: Skill) => s.name === 'test-skill');
			expect(testSkills.length).toBe(1);
		});

		it('should remove a skill', () => {
			server.addSkill(mockSkill);
			server.removeSkill('test-skill');
			expect(server.hasSkill('test-skill')).toBe(false);
		});

		it('should throw when removing non-existent skill', () => {
			expect(() => server.removeSkill('non-existent')).toThrow("skill 'non-existent' not found");
		});

		it('should update a skill', () => {
			server.addSkill(mockSkill);
			server.updateSkill('test-skill', { description: 'Updated description' });
			expect(server.getSkill('test-skill')?.description).toBe('Updated description');
		});

		it('should throw when updating non-existent skill', () => {
			expect(() => server.updateSkill('non-existent', { description: 'New' }))
				.toThrow("skill 'non-existent' not found");
		});

		it('should clear all skills', () => {
			server.addSkill(mockSkill);
			server.addSkill({ name: 'another-skill', description: 'Another', user_invocable: false });
			server.clearSkills();
			expect(server.getAvailableSkills().length).toBe(0);
		});
	});

	describe('History Management', () => {
		it('should clear history', async () => {
			// Add a thought to history
			await server.processThought({
				thought: 'test',
				thought_number: 1,
				total_thoughts: 1,
				next_thought_needed: false,
			} as ThoughtData);

			// Verify history is not empty
			expect(server.getHistory().length).toBeGreaterThan(0);

			// Clear history
			server.clearHistory();

			// Verify history is empty
			expect(server.getHistory()).toHaveLength(0);
		});
	});
});
