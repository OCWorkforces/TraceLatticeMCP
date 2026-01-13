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
			server.addTool(mockTool); // Should not add again
			const tools = server.getAvailableTools();
			const testTools = tools.filter((t: Tool) => t.name === 'test-tool');
			expect(testTools.length).toBe(1);
		});

		it('should remove a tool', () => {
			server.addTool(mockTool);
			const removed = server.removeTool('test-tool');
			expect(removed).toBe(true);
			expect(server.hasTool('test-tool')).toBe(false);
		});

		it('should return false when removing non-existent tool', () => {
			const removed = server.removeTool('non-existent');
			expect(removed).toBe(false);
		});

		it('should update a tool', () => {
			server.addTool(mockTool);
			const updated = server.updateTool('test-tool', { description: 'Updated description' });
			expect(updated).toBe(true);
			expect(server.getTool('test-tool')?.description).toBe('Updated description');
		});

		it('should return false when updating non-existent tool', () => {
			const updated = server.updateTool('non-existent', { description: 'New' });
			expect(updated).toBe(false);
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
			server.addSkill(mockSkill); // Should not add again
			const skills = server.getAvailableSkills();
			const testSkills = skills.filter((s: Skill) => s.name === 'test-skill');
			expect(testSkills.length).toBe(1);
		});

		it('should remove a skill', () => {
			server.addSkill(mockSkill);
			const removed = server.removeSkill('test-skill');
			expect(removed).toBe(true);
			expect(server.hasSkill('test-skill')).toBe(false);
		});

		it('should return false when removing non-existent skill', () => {
			const removed = server.removeSkill('non-existent');
			expect(removed).toBe(false);
		});

		it('should update a skill', () => {
			server.addSkill(mockSkill);
			const updated = server.updateSkill('test-skill', { description: 'Updated description' });
			expect(updated).toBe(true);
			expect(server.getSkill('test-skill')?.description).toBe('Updated description');
		});

		it('should return false when updating non-existent skill', () => {
			const updated = server.updateSkill('non-existent', { description: 'New' });
			expect(updated).toBe(false);
		});

		it('should clear all skills', () => {
			server.addSkill(mockSkill);
			server.addSkill({ name: 'another-skill', description: 'Another', user_invocable: false });
			server.clearSkills();
			expect(server.getAvailableSkills().length).toBe(0);
		});
	});

	describe('History Management', () => {
		it('should clear history', () => {
			server['thought_history'] = [
				{ thought: 'test', thought_number: 1, total_thoughts: 1, next_thought_needed: false },
			] as ThoughtData[];
			server.clearHistory();
			expect(server['thought_history']).toHaveLength(0);
		});
	});
});
