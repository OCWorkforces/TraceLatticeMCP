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
			server.tools.addTool(mockTool);
			expect(server.tools.hasTool('test-tool')).toBe(true);
			expect(server.tools.getTool('test-tool')).toEqual(mockTool);
		});

		it('should not add duplicate tool', () => {
			server.tools.addTool(mockTool);
			expect(() => server.tools.addTool(mockTool)).toThrow("tool 'test-tool' already exists");
			const tools = server.tools.getAll();
			const testTools = tools.filter((t: Tool) => t.name === 'test-tool');
			expect(testTools.length).toBe(1);
		});

		it('should remove a tool', () => {
			server.tools.addTool(mockTool);
			server.tools.removeTool('test-tool');
			expect(server.tools.hasTool('test-tool')).toBe(false);
		});

		it('should throw when removing non-existent tool', () => {
			expect(() => server.tools.removeTool('non-existent')).toThrow(
				"tool 'non-existent' not found"
			);
		});

		it('should update a tool', () => {
			server.tools.addTool(mockTool);
			server.tools.updateTool('test-tool', { description: 'Updated description' });
			expect(server.tools.getTool('test-tool')?.description).toBe('Updated description');
		});

		it('should throw when updating non-existent tool', () => {
			expect(() => server.tools.updateTool('non-existent', { description: 'New' })).toThrow(
				"tool 'non-existent' not found"
			);
		});

		it('should clear all tools', () => {
			server.tools.addTool(mockTool);
			server.tools.addTool({ name: 'another-tool', description: 'Another', inputSchema: {} });
			server.tools.clear();
			expect(server.tools.getAll().length).toBe(0);
		});
	});

	describe('Skill CRUD', () => {
		const mockSkill: Skill = {
			name: 'test-skill',
			description: 'A test skill',
			user_invocable: true,
		};

		it('should add a skill', () => {
			server.skills.addSkill(mockSkill);
			expect(server.skills.hasSkill('test-skill')).toBe(true);
			expect(server.skills.getSkill('test-skill')).toEqual(mockSkill);
		});

		it('should not add duplicate skill', () => {
			server.skills.addSkill(mockSkill);
			expect(() => server.skills.addSkill(mockSkill)).toThrow("skill 'test-skill' already exists");
			const skills = server.skills.getAll();
			const testSkills = skills.filter((s: Skill) => s.name === 'test-skill');
			expect(testSkills.length).toBe(1);
		});

		it('should remove a skill', () => {
			server.skills.addSkill(mockSkill);
			server.skills.removeSkillByName('test-skill');
			expect(server.skills.hasSkill('test-skill')).toBe(false);
		});

		it('should throw when removing non-existent skill', () => {
			expect(() => server.skills.removeSkillByName('non-existent')).toThrow(
				"skill 'non-existent' not found"
			);
		});

		it('should update a skill', () => {
			server.skills.addSkill(mockSkill);
			server.skills.updateSkill('test-skill', { description: 'Updated description' });
			expect(server.skills.getSkill('test-skill')?.description).toBe('Updated description');
		});

		it('should throw when updating non-existent skill', () => {
			expect(() => server.skills.updateSkill('non-existent', { description: 'New' })).toThrow(
				"skill 'non-existent' not found"
			);
		});

		it('should clear all skills', () => {
			server.skills.addSkill(mockSkill);
			server.skills.addSkill({
				name: 'another-skill',
				description: 'Another',
				user_invocable: false,
			});
			server.skills.clear();
			expect(server.skills.getAll().length).toBe(0);
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
			expect(server.history.getHistory().length).toBeGreaterThan(0);

			// Clear history
			server.history.clear();

			// Verify history is empty
			expect(server.history.getHistory()).toHaveLength(0);
		});
	});
});
