import type { Skill } from '../types.js';
import type { StructuredLogger } from '../logger/StructuredLogger.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export interface SkillRegistryOptions {
	logger?: StructuredLogger;
	cache?: DiscoveryCache<Skill>;
	skillDirs?: string[];
	lazyDiscovery?: boolean;
}

export class SkillRegistry {
	private _skills: Map<string, Skill>;
	private _logger: StructuredLogger | null;
	private _cache: DiscoveryCache<Skill>;
	private _skillDirs: string[];
	private _discovered: boolean = false;
	private _discoveryPromise: Promise<number> | null = null;

	constructor(options: SkillRegistryOptions = {}) {
		this._skills = new Map();
		this._logger = options.logger || null;
		this._cache = options.cache || new DiscoveryCache<Skill>({ maxSize: 50, ttl: 300000 });
		this._skillDirs = options.skillDirs || ['.claude/skills', join(homedir(), '.claude/skills')];
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		if (this._logger) {
			this._logger.info(message, meta);
		} else {
			console.error(message); // Fallback for backward compatibility
		}
	}

	public addSkill(skill: Skill): void {
		if (!skill.name) {
			throw new Error('Skill must have a valid name');
		}
		if (this._skills.has(skill.name)) {
			throw new Error(`skill '${skill.name}' already exists`);
		}
		this._skills.set(skill.name, skill);
		this.log(`Added skill: ${skill.name}`, { skillName: skill.name });
		// Invalidate cache when adding a new skill
		this._cache?.invalidate('all');
	}

	public removeSkillByName(name: string): void {
		if (!this._skills.has(name)) {
			throw new Error(`skill '${name}' not found, cannot remove`);
		}
		this._skills.delete(name);
		this.log(`Removed skill: ${name}`, { skillName: name });
		// Invalidate cache when removing a skill
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	public updateSkill(name: string, updates: Partial<Skill>): void {
		if (!this._skills.has(name)) {
			throw new Error(`skill '${name}' not found, cannot update`);
		}
		const existing = this._skills.get(name)!;
		const updated = { ...existing, ...updates };
		this._skills.set(name, updated);
		this.log(`Updated skill: ${name}`, { skillName: name });
		// Invalidate cache when updating a skill
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	public hasSkill(name: string): boolean {
		return this._skills.has(name);
	}

	/**
	 * Get a skill by name. Triggers lazy discovery if enabled and not yet discovered.
	 * Note: If lazy discovery is enabled, this may not find skills that haven't been discovered yet.
	 * For async lazy discovery, use getSkillAsync() instead.
	 */
	public getSkill(name: string): Skill | undefined {
		return this._skills.get(name);
	}

	/**
	 * Get all skills. Triggers lazy discovery if enabled and not yet discovered.
	 * Note: If lazy discovery is enabled, this may not return all skills if discovery hasn't completed.
	 * For async lazy discovery, use getAllAsync() instead.
	 */
	public getAll(): Skill[] {
		// Check cache first
		if (this._cache) {
			const cached = this._cache.get('all');
			if (cached) {
				return cached;
			}
		}
		// Get from storage
		const skills = Array.from(this._skills.values());
		// Cache the result
		this._cache?.set('all', skills);
		return skills;
	}

	/**
	 * Asynchronously discover skills from the configured directories.
	 * Can be called multiple times, but subsequent calls will return cached results.
	 * @returns Promise<number> - The number of skills discovered
	 */
	public async discoverAsync(): Promise<number> {
		// Return existing promise if discovery is in progress
		if (this._discoveryPromise) {
			return this._discoveryPromise;
		}

		// Use cached results if already discovered
		if (this._discovered) {
			const cached = this._cache.get('all');
			return cached?.length ?? 0;
		}

		// Create discovery promise
		this._discoveryPromise = this._performDiscovery();

		try {
			const count = await this._discoveryPromise;
			return count;
		} finally {
			this._discoveryPromise = null;
		}
	}


	/**
	 * Perform the actual discovery operation (async version).
	 * This is called internally by discoverAsync().
	 */
	private async _performDiscovery(): Promise<number> {
		let discoveredCount = 0;

		for (const skillDir of this._skillDirs) {
			try {
				if (!existsSync(skillDir)) {
					continue;
				}

				const entries = await readdir(skillDir, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))) {
						const filePath = join(skillDir, entry.name);
						try {
							const content = await readFile(filePath, 'utf-8');
							const parsed = this._parseSkillFrontmatter(content);
							if (parsed._error) {
								this.log(`Skipped ${entry.name}: ${parsed._error}`);
								continue;
							}
							if (parsed.name) {
								// Check if already exists before adding
								if (!this._skills.has(parsed.name)) {
									const skill: Skill = {
										name: parsed.name,
										description: parsed.description || '',
										user_invocable: parsed.user_invocable ?? false,
										allowed_tools: parsed.allowed_tools,
									};
									this._skills.set(skill.name, skill);
									discoveredCount++;
								}
							}
						} catch (readError) {
							this.log(`Failed to read skill file ${entry.name}`, {
								error: readError instanceof Error ? readError.message : String(readError),
							});
						}
					}
				}
			} catch (error) {
				this.log(`Failed to scan skill directory: ${skillDir}`, {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		this._discovered = true;
		this._cache?.set('all', Array.from(this._skills.values()));
		this.log(`Discovery complete: found ${discoveredCount} skills`, { discoveredCount });
		return discoveredCount;
	}

	public getNames(): string[] {
		return Array.from(this._skills.keys());
	}

	public clear(): void {
		this._skills.clear();
		this.log('Cleared all skills');
		// Invalidate cache when clearing all skills
		this._cache?.clear();
	}

	public size(): number {
		return this._skills.size;
	}

	public setSkills(skills: Skill[]): void {
		this.clear();
		for (const skill of skills) {
			try {
				this.addSkill(skill);
			} catch (error) {
				this.log(`Error adding skill '${skill.name}':`, {
					skillName: skill.name,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		this.log(`Set ${skills.length} skills from external source`, { skillCount: skills.length });
	}

	private _parseSkillFrontmatter(content: string): Partial<Skill> & { _error?: string } {
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
			this.log('Error parsing YAML frontmatter:', {
				error: error instanceof Error ? error.message : String(error),
			});
			return { _error: 'YAML parse error' };
		}
	}
}
