/**
 * File system watcher for skill directory changes with registry integration.
 *
 * This module provides the `SkillWatcher` class which monitors configured
 * skill directories for file changes using chokidar. When changes are detected,
 * it automatically triggers skill re-discovery to keep the registry in sync.
 *
 * @module watcher
 */

import { watch, type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SkillRegistry } from './registry/SkillRegistry.js';

/**
 * File system watcher for skill directories with registry integration.
 *
 * This class monitors configured skill directories for file system changes
 * and automatically triggers skill re-discovery when changes are detected.
 * It integrates with a `SkillRegistry` to keep the registered skills in sync
 * with the filesystem.
 *
 * @remarks
 * **Watched Events:**
 * - `add` - A new skill file was added (triggers re-discovery)
 * - `change` - A skill file was modified (triggers re-discovery)
 * - `unlink` - A skill file was removed (attempts to remove from registry)
 *
 * **Watched Directories:**
 * - `.claude/skills` (project-local)
 * - `~/.claude/skills` (user-global)
 *
 * **Ignored Paths:**
 * - `node_modules` directories are ignored
 *
 * **Watcher Behavior:**
 * - Uses persistent mode to continue watching even if files are temporarily deleted
 * - Automatically starts watching when instantiated
 * - File additions/modifications trigger full skill re-discovery
 * - File removals attempt to remove the specific skill from the registry
 *
 * @example
 * ```typescript
 * import { SkillWatcher } from './SkillWatcher.js';
 * import { SkillRegistry } from './registry/SkillRegistry.js';
 *
 * const registry = new SkillRegistry();
 * const watcher = new SkillWatcher(registry);
 * // Watcher automatically starts monitoring skill directories
 *
 * // When a skill file is added/modified, re-discovery is triggered
 * // When a skill file is deleted, it's removed from the registry
 *
 * // When done, stop the watcher
 * watcher.stop();
 * ```
 */
export class SkillWatcher {
	/** The underlying chokidar file system watcher. */
	private _watcher: FSWatcher | null = null;

	/**
	 * Creates a new SkillWatcher and starts watching skill directories.
	 *
	 * The watcher automatically starts monitoring `.claude/skills` and
	 * `~/.claude/skills` directories upon construction. When skill files
	 * are added or modified, it triggers re-discovery on the associated registry.
	 *
	 * @param skillRegistry - The skill registry to sync with
	 *
	 * @example
	 * ```typescript
	 * const registry = new SkillRegistry();
	 * const watcher = new SkillWatcher(registry);
	 * ```
	 */
	constructor(private skillRegistry: SkillRegistry) {
		this.setupWatcher();
	}

	/**
	 * Sets up the file system watcher for skill directories.
	 *
	 * Configures chokidar to watch the skill directories and sets up
	 * event handlers for file additions, modifications, and removals.
	 *
	 * @private
	 */
	private setupWatcher(): void {
		const skillDirs = ['.claude/skills', join(homedir(), '.claude/skills')];

		this._watcher = watch(skillDirs, {
			ignored: /node_modules/,
			persistent: true,
		});

		this._watcher.on('add', async (path) => {
			console.error(`Skill added: ${path}`);
			await this.skillRegistry.discoverAsync();
		});

		this._watcher.on('change', async (path) => {
			console.error(`Skill modified: ${path}`);
			await this.skillRegistry.discoverAsync();
		});

		this._watcher.on('unlink', async (path) => {
			console.error(`Skill removed: ${path}`);
			this.handleSkillRemoval(path);
		});
	}

	/**
	 * Handles the event when a skill file is removed.
	 *
	 * This method extracts the skill name from the file path and attempts
	 * to remove it from the skill registry. If the skill name cannot be
	 * extracted, or the skill is not found in the registry, the error is logged
	 * but does not throw.
	 *
	 * @param skillPath - The file path of the removed skill file
	 * @returns A Promise that resolves when handling is complete
	 *
	 * @example
	 * ```typescript
	 * // When 'commit.md' is removed, this will attempt to remove
	 * // the skill named 'commit' from the registry
	 * ```
	 */
	private async handleSkillRemoval(skillPath: string): Promise<void> {
		const skillName = this.extractSkillNameFromPath(skillPath);
		if (skillName) {
			try {
				this.skillRegistry.removeSkillByName(skillName);
			} catch (error) {
				console.error(
					`Failed to remove skill ${skillName}:`,
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	}

	/**
	 * Extracts the skill name from a file path.
	 *
	 * This method takes a file path and extracts the filename without
	 * extension, which is used as the skill name. For example:
	 * - `.claude/skills/commit.md` -> `commit.md`
	 * - `.claude/skills/review-pr.yml` -> `review-pr.yml`
	 *
	 * @param skillPath - The file path to extract from
	 * @returns The extracted filename (with extension), or null if extraction fails
	 *
	 * @example
	 * ```typescript
	 * extractSkillNameFromPath('/path/to/skills/commit.md')
	 * // Returns: 'commit.md'
	 * ```
	 */
	private extractSkillNameFromPath(skillPath: string): string | null {
		const parts = skillPath.split(/[/\\]/);
		return parts[parts.length - 1] || null;
	}

	/**
	 * Stops watching skill directories and cleans up resources.
	 *
	 * This method closes the underlying chokidar watcher and releases
	 * file system resources. After calling this method, the watcher
	 * cannot be restarted.
	 *
	 * @example
	 * ```typescript
	 * const watcher = new SkillWatcher(registry);
	 * // ... use watcher ...
	 * watcher.stop();
	 * ```
	 */
	public stop(): void {
		if (this._watcher) {
			this._watcher.close();
			this._watcher = null;
		}
	}
}
