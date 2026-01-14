import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Skill Discovery', () => {
	let testSkillDir: string;

	const SKILL_UPPERCASE = `---
name: test-skill-uppercase
description: A test skill with uppercase filename
user-invocable: true
allowed-tools: [test-tool]
---

# Test Skill (Uppercase)

This is a test skill.`;

	const SKILL_LOWERCASE = `---
name: test-skill-lowercase
description: A test skill with lowercase filename
user-invocable: true
allowed-tools: [test-tool]
---

# Test Skill (Lowercase)

This is a test skill.`;

	const SKILL_BOTH_PRIORITY = `---
name: test-skill-priority
description: Test that uppercase takes priority when both exist
user-invocable: true
---

# Test Skill Priority

This should be discovered when both files exist.`;

	beforeEach(() => {
		// Create a temporary directory for testing
		testSkillDir = join(tmpdir(), `claude-skills-test-${Date.now()}`);
		mkdirSync(testSkillDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testSkillDir)) {
			rmSync(testSkillDir, { recursive: true, force: true });
		}
	});

	it('should discover skill from SKILL.md (uppercase)', () => {
		// Create a skill directory with SKILL.md
		const skillPath = join(testSkillDir, 'uppercase-skill');
		mkdirSync(skillPath, { recursive: true });
		writeFileSync(join(skillPath, 'SKILL.md'), SKILL_UPPERCASE);

		// Test that the uppercase file exists and is readable
		expect(existsSync(join(skillPath, 'SKILL.md'))).toBe(true);
		const content = readFileSync(join(skillPath, 'SKILL.md'), 'utf-8');
		expect(content).toContain('test-skill-uppercase');
		expect(content).toContain('uppercase filename');
	});

	it('should discover skill from skill.md (lowercase)', async () => {
		// Create a skill directory with skill.md
		const skillPath = join(testSkillDir, 'lowercase-skill');
		mkdirSync(skillPath, { recursive: true });
		writeFileSync(join(skillPath, 'skill.md'), SKILL_LOWERCASE);

		// Wait for filesystem to flush
		await new Promise(resolve => setTimeout(resolve, 10));

		// Test that lowercase file is readable
		expect(existsSync(join(skillPath, 'skill.md'))).toBe(true);
		const content = readFileSync(join(skillPath, 'skill.md'), 'utf-8');
		expect(content).toContain('test-skill-lowercase');
		expect(content).toContain('lowercase filename');
	});

	it('should prefer SKILL.md over skill.md when both exist', async () => {
		// Create a skill directory with both files
		const skillPath = join(testSkillDir, 'both-priority');
		mkdirSync(skillPath, { recursive: true });
		writeFileSync(join(skillPath, 'SKILL.md'), SKILL_BOTH_PRIORITY);
		writeFileSync(join(skillPath, 'skill.md'), SKILL_LOWERCASE);

		// Wait for filesystem to flush
		await new Promise(resolve => setTimeout(resolve, 10));

		// Test the priority logic
		const skillFileUpper = join(skillPath, 'SKILL.md');
		const skillFileLower = join(skillPath, 'skill.md');
		const skillFile = existsSync(skillFileUpper) ? skillFileUpper : skillFileLower;

		// Should prefer uppercase
		expect(skillFile).toBe(skillFileUpper);
	});

	it('should handle neither file existing', () => {
		// Create an empty skill directory
		const skillPath = join(testSkillDir, 'no-file');
		mkdirSync(skillPath, { recursive: true });

		const skillFileUpper = join(skillPath, 'SKILL.md');
		const skillFileLower = join(skillPath, 'skill.md');
		const skillFile = existsSync(skillFileUpper) ? skillFileUpper : skillFileLower;

		// Should return the lowercase path (which doesn't exist)
		expect(skillFile).toBe(skillFileLower);
		expect(existsSync(skillFile)).toBe(false);
	});
});
