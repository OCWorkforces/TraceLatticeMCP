import type { Skill } from '../types.js';
import type { StructuredLogger } from '../logger/StructuredLogger.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';

export class SkillRegistry {
	private skills: Map<string, Skill>;
	private logger: StructuredLogger | null;
	private _cache: DiscoveryCache<Skill>;

	constructor(logger?: StructuredLogger, cache?: DiscoveryCache<Skill>) {
		this.skills = new Map();
		this.logger = logger || null;
		// Create cache internally if not provided
		this._cache = cache || new DiscoveryCache<Skill>({ maxSize: 50, ttl: 300000 });
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		if (this.logger) {
			this.logger.info(message, meta);
		} else {
			console.error(message); // Fallback for backward compatibility
		}
	}

	public addSkill(skill: Skill): void {
		if (!skill.name) {
			throw new Error('Skill must have a valid name');
		}
		if (this.skills.has(skill.name)) {
			throw new Error(`skill '${skill.name}' already exists`);
		}
		this.skills.set(skill.name, skill);
		this.log(`Added skill: ${skill.name}`, { skillName: skill.name });
		// Invalidate cache when adding a new skill
		this._cache?.invalidate('all');
	}

	public removeSkillByName(name: string): void {
		if (!this.skills.has(name)) {
			throw new Error(`skill '${name}' not found, cannot remove`);
		}
		this.skills.delete(name);
		this.log(`Removed skill: ${name}`, { skillName: name });
		// Invalidate cache when removing a skill
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	public updateSkill(name: string, updates: Partial<Skill>): void {
		if (!this.skills.has(name)) {
			throw new Error(`skill '${name}' not found, cannot update`);
		}
		const existing = this.skills.get(name)!;
		const updated = { ...existing, ...updates };
		this.skills.set(name, updated);
		this.log(`Updated skill: ${name}`, { skillName: name });
		// Invalidate cache when updating a skill
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	public hasSkill(name: string): boolean {
		return this.skills.has(name);
	}

	public getSkill(name: string): Skill | undefined {
		return this.skills.get(name);
	}

	public getAll(): Skill[] {
		// Check cache first
		if (this._cache) {
			const cached = this._cache.get('all');
			if (cached) {
				return cached;
			}
		}
		// Get from storage
		const skills = Array.from(this.skills.values());
		// Cache the result
		this._cache?.set('all', skills);
		return skills;
	}

	public getNames(): string[] {
		return Array.from(this.skills.keys());
	}

	public clear(): void {
		this.skills.clear();
		this.log('Cleared all skills');
		// Invalidate cache when clearing all skills
		this._cache?.clear();
	}

	public size(): number {
		return this.skills.size;
	}

	public setSkills(skills: Skill[]): void {
		this.clear();
		for (const skill of skills) {
			try {
				this.addSkill(skill);
			} catch (error) {
				this.log(
					`Error adding skill '${skill.name}':`,
					{ skillName: skill.name, error: error instanceof Error ? error.message : String(error) }
				);
			}
		}
		this.log(`Set ${skills.length} skills from external source`, { skillCount: skills.length });
	}

	public discover(): number {
		// Check cache first
		if (this._cache) {
			const cached = this._cache.get('all');
			if (cached && cached.length > 0) {
				this.log(`Using cached skills: ${cached.length}`, { skillCount: cached.length });
				return cached.length;
			}
		}

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
			this.log(`Scanning skills directory: ${dir}`, { directory: dir });

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

					// Read and parse skill file
					const content = readFileSync(skillFile, 'utf-8');
					const skillData = this.parseSkillFrontmatter(content);

					if (skillData._error) {
						this.log(`Skipping skill in ${entry.name}: ${skillData._error}`, { directory: entry.name, error: skillData._error });
						continue;
					}

					if (skillData.name) {
						const skill: Skill = {
							name: skillData.name,
							description: skillData.description || '',
							user_invocable: skillData.user_invocable,
							allowed_tools: skillData.allowed_tools,
						};
						// Check if skill already exists before adding
						if (!this.skills.has(skill.name)) {
							this.skills.set(skill.name, skill);
							this.log(`Added skill: ${skill.name}`, { skillName: skill.name });
							discovered++;
						}
					}
				}
			} catch (error) {
				this.log(`Error scanning ${dir}:`, { directory: dir, error: error instanceof Error ? error.message : String(error) });
			}
		}

		this.log(`Discovered ${discovered} skills from ${scannedDirs} directories`, { discovered, scannedDirs });

		// Cache the discovered skills
		if (this._cache && discovered > 0) {
			this._cache.set('all', this.getAll());
		}

		return discovered;
	}

	private parseSkillFrontmatter(content: string): Partial<Skill> & { _error?: string } {
		// Parse YAML frontmatter from skill file
		const match = content.match(/^---\n([\s\S]+?)\n---/);
		if (!match) {
			// No frontmatter - this is normal for some files
			return {};
		}

		try {
			const frontmatter = parseYaml(match[1]) as Record<string, unknown>;

			const result: Partial<Skill> = {
				name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
				description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
				user_invocable: frontmatter['user-invocable'] === true,
				allowed_tools: Array.isArray(frontmatter['allowed-tools'])
					? frontmatter['allowed-tools'].map(String)
					: undefined,
			};

			// Validate required field
			if (!result.name) {
				return { _error: 'Missing required field: name' };
			}

			return result;
		} catch (error) {
			this.log('Error parsing YAML frontmatter:', { error: error instanceof Error ? error.message : String(error) });
			return { _error: 'YAML parse error' };
		}
	}
}
