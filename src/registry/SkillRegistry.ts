/**
 * Skill registry for managing and discovering Claude Code skills.
 *
 * This module provides the `SkillRegistry` class which manages skill registration,
 * discovery from filesystem directories, and CRUD operations. Skills are higher-level
 * workflows that coordinate multiple tools and operations.
 *
 * @module registry
 */

import type { Skill } from '../types.js';
import type { Logger } from '../logger/StructuredLogger.js';
import { NullLogger } from '../logger/NullLogger.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Configuration options for creating a `SkillRegistry` instance.
 *
 * @example
 * ```typescript
 * const options: SkillRegistryOptions = {
 *   logger: new StructuredLogger({ context: 'SkillRegistry' }),
 *   cache: new DiscoveryCache({ ttl: 300000, maxSize: 100 }),
 *   skillDirs: ['./custom-skills', '~/.claude/skills'],
 *   lazyDiscovery: true
 * };
 * ```
 */
export interface SkillRegistryOptions {
	/** Optional logger for diagnostics. */
	logger?: Logger;

	/** Optional cache for skill lookups. */
	cache?: DiscoveryCache<Skill>;

	/**
	 * Directory paths to search for skills.
	 * @default ['.claude/skills', '~/.claude/skills']
	 */
	skillDirs?: string[];

	/**
	 * Enable lazy discovery (discover on first access instead of startup).
	 * @default false
	 */
	lazyDiscovery?: boolean;
}

/**
 * Registry for managing Claude Code skill operations.
 *
 * This class manages skill registration, discovery from filesystem directories,
 * and CRUD operations. Skills are discovered from markdown files with YAML
 * frontmatter in configured skill directories.
 *
 * @remarks
 * **Skill Discovery:**
 * - Skills are discovered from directories in priority order
 * - Skill files must have `.md`, `.yml`, or `.yaml` extensions
 * - Skills are defined with YAML frontmatter containing metadata
 * - Discovery is async and can be awaited via `discoverAsync()`
 *
 * **Frontmatter Format:**
 * ```yaml
 * ---
 * name: commit
 * description: Handles git commit workflow
 * user-invocable: true
 * allowed-tools: [git, bash]
 * ---
 * ```
 *
 * **Cache Behavior:**
 * - Cache is checked before accessing skill storage
 * - Cache is invalidated on add, update, and remove operations
 * - Discovery results are cached for the configured TTL
 *
 * **Thread Safety:**
 * This class is not thread-safe. Multiple concurrent calls to `discoverAsync()`
 * will share the same promise to prevent duplicate work.
 *
 * @example
 * ```typescript
 * import { SkillRegistry } from './registry/SkillRegistry.js';
 *
 * const registry = new SkillRegistry({
 *   logger: new StructuredLogger({ context: 'SkillRegistry' }),
 *   skillDirs: ['.claude/skills', '~/.claude/skills']
 * });
 *
 * // Discover skills asynchronously
 * const count = await registry.discoverAsync();
 * console.log(`Discovered ${count} skills`);
 *
 * // Get a skill
 * const skill = registry.getSkill('commit');
 * if (skill) {
 *   console.log(`Found: ${skill.description}`);
 * }
 *
 * // Add a skill manually
 * registry.addSkill({
 *   name: 'my-skill',
 *   description: 'A custom skill',
 *   user_invocable: true,
 *   allowed_tools: ['bash']
 * });
 *
 * // List all skills
 * const allSkills = registry.getAll();
 * ```
 */
export class SkillRegistry {
	/** Internal storage for skills indexed by name. */
	private _skills: Map<string, Skill>;

	/** Logger for diagnostics. */
	private _logger: Logger;

	/** Optional cache for skill lookups. */
	private _cache: DiscoveryCache<Skill>;

	/** Directory paths to search for skills. */
	private _skillDirs: string[];

	/** Whether discovery has been performed. */
	private _discovered: boolean = false;

	/** Promise for in-progress discovery (null if not in progress). */
	private _discoveryPromise: Promise<number> | null = null;

	/**
	 * Creates a new SkillRegistry instance.
	 *
	 * @param options - Configuration options for the registry
	 *
	 * @example
	 * ```typescript
	 * const registry1 = new SkillRegistry();
	 *
	 * const registry2 = new SkillRegistry({
	 *   logger: new StructuredLogger({ context: 'Skills' }),
	 *   skillDirs: ['./my-skills'],
	 *   lazyDiscovery: true
	 * });
	 * ```
	 */
	constructor(options: SkillRegistryOptions = {}) {
		this._skills = new Map();
		this._logger = options.logger ?? new NullLogger();
		this._cache = options.cache || new DiscoveryCache<Skill>({ maxSize: 50, ttl: 300000 });
		this._skillDirs = options.skillDirs || ['.claude/skills', join(homedir(), '.claude/skills')];
	}

	/**
	 * Internal logging method.
	 * @param message - The message to log
	 * @param meta - Optional metadata
	 * @private
	 */
	private log(message: string, meta?: Record<string, unknown>): void {
		this._logger.info(message, meta);
	}

	/**
	 * Adds a skill to the registry.
	 *
	 * @param skill - The skill to add
	 * @throws {Error} If skill already exists or name is invalid
	 *
	 * @example
	 * ```typescript
	 * registry.addSkill({
	 *   name: 'my-custom-skill',
	 *   description: 'Performs a custom workflow',
	 *   user_invocable: true,
	 *   allowed_tools: ['bash', 'read']
	 * });
	 * ```
	 */
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

	/**
	 * Removes a skill from the registry by name.
	 *
	 * @param name - The name of the skill to remove
	 * @throws {Error} If skill not found
	 *
	 * @example
	 * ```typescript
	 * registry.removeSkillByName('my-custom-skill');
	 * ```
	 */
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

	/**
	 * Updates an existing skill with partial data.
	 *
	 * @param name - The name of the skill to update
	 * @param updates - Partial skill data with fields to update
	 * @throws {Error} If skill not found
	 *
	 * @example
	 * ```typescript
	 * registry.updateSkill('my-custom-skill', {
	 *   description: 'Updated description'
	 * });
	 * ```
	 */
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

	/**
	 * Checks if a skill exists in the registry.
	 *
	 * @param name - The name of the skill to check
	 * @returns true if the skill exists, false otherwise
	 *
	 * @example
	 * ```typescript
	 * if (registry.hasSkill('commit')) {
	 *   console.log('Commit skill is registered');
	 * }
	 * ```
	 */
	public hasSkill(name: string): boolean {
		return this._skills.has(name);
	}

	/**
	 * Gets a skill by name.
	 *
	 * Returns undefined if the skill is not found.
	 *
	 * @remarks
	 * Note: This method performs synchronous lookup only. If lazy discovery
	 * is enabled and hasn't completed, this may not find skills that would
	 * be discovered. For async lazy discovery, use `discoverAsync()` first.
	 *
	 * @param name - The name of the skill to get
	 * @returns The skill if found, undefined otherwise
	 *
	 * @example
	 * ```typescript
	 * const skill = registry.getSkill('commit');
	 * if (skill) {
	 *   console.log(`Found: ${skill.description}`);
	 * }
	 * ```
	 */
	public getSkill(name: string): Skill | undefined {
		return this._skills.get(name);
	}

	/**
	 * Gets all skills as an array.
	 *
	 * Uses cache if available for performance. The result is cached under
	 * the 'all' key for subsequent calls.
	 *
	 * @remarks
	 * Note: This method performs synchronous lookup only. If lazy discovery
	 * is enabled and hasn't completed, this may not return all available skills.
	 * For complete results, await `discoverAsync()` first.
	 *
	 * @returns An array of all registered skills
	 *
	 * @example
	 * ```typescript
	 * const skills = registry.getAll();
	 * skills.forEach(skill => {
	 *   console.log(`${skill.name}: ${skill.description}`);
	 * });
	 * ```
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
	 * Asynchronously discovers skills from the configured directories.
	 *
	 * This method scans all configured skill directories for markdown files
	 * with YAML frontmatter, parses them, and adds valid skills to the registry.
	 * Multiple concurrent calls share the same discovery promise.
	 *
	 * @remarks
	 * **Supported File Extensions:** `.md`, `.yml`, `.yaml`
	 *
	 * **Frontmatter Format:**
	 * ```yaml
	 * ---
	 * name: skill-name
	 * description: Skill description
	 * user-invocable: true
	 * allowed-tools: [tool1, tool2]
	 * ---
	 * ```
	 *
	 * Subsequent calls return cached results if discovery has already completed.
	 * If discovery is in progress, the same promise is returned to all callers.
	 *
	 * @returns A Promise resolving to the number of skills discovered
	 *
	 * @example
	 * ```typescript
	 * // Perform initial discovery
	 * const count = await registry.discoverAsync();
	 * console.log(`Discovered ${count} skills`);
	 *
	 * // Subsequent calls return cached results
	 * const cachedCount = await registry.discoverAsync();
	 * console.log(`Cached count: ${cachedCount}`);
	 * ```
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
	 * Performs the actual skill discovery operation.
	 *
	 * Scans configured directories for skill files, parses their frontmatter,
	 * and adds valid skills to the registry.
	 *
	 * @returns A Promise resolving to the number of skills discovered
	 * @private
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
					if (
						entry.isFile() &&
						entry.name !== '.DS_Store' &&
						(entry.name.endsWith('.md') ||
							entry.name.endsWith('.yml') ||
							entry.name.endsWith('.yaml'))
					) {
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

	/**
	 * Gets all skill names as an array.
	 *
	 * @returns An array of skill names
	 *
	 * @example
	 * ```typescript
	 * const names = registry.getNames();
	 * console.log(`Skills: ${names.join(', ')}`);
	 * ```
	 */
	public getNames(): string[] {
		return Array.from(this._skills.keys());
	}

	/**
	 * Clears all skills from the registry.
	 *
	 * This removes all skills, clears the cache, and resets the discovery flag.
	 * Useful for testing or resetting state.
	 *
	 * @example
	 * ```typescript
	 * registry.clear();
	 * console.log('Cleared all skills');
	 * ```
	 */
	public clear(): void {
		this._skills.clear();
		this.log('Cleared all skills');
		// Invalidate cache when clearing all skills
		this._cache?.clear();
	}

	/**
	 * Gets the number of skills in the registry.
	 *
	 * @returns The count of registered skills
	 *
	 * @example
	 * ```typescript
	 * console.log(`Total skills: ${registry.size()}`);
	 * ```
	 */
	public size(): number {
		return this._skills.size;
	}

	/**
	 * Sets skills from an external source.
	 *
	 * Clears existing skills and adds new ones from the provided array.
	 * Useful for syncing with external skill sources.
	 *
	 * @param skills - Array of skills from an external source
	 *
	 * @example
	 * ```typescript
	 * const externalSkills = [
	 *   { name: 'skill1', description: '...', user_invocable: true },
	 *   { name: 'skill2', description: '...', user_invocable: false }
	 * ];
	 * registry.setSkills(externalSkills);
	 * ```
	 */
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

	/**
	 * Parses YAML frontmatter from a skill file content.
	 *
	 * Extracts skill metadata from the YAML frontmatter block between
	 * the first set of `---` delimiters. Returns a partial skill object
	 * or an error marker if parsing fails.
	 *
	 * @param content - The file content to parse
	 * @returns A partial skill object, with an `_error` property if parsing failed
	 * @private
	 */
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
