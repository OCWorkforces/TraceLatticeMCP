import { watch, type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SkillRegistry } from './registry/SkillRegistry.js';

export class SkillWatcher {
	private _watcher: FSWatcher | null = null;

	constructor(private skillRegistry: SkillRegistry) {
		this.setupWatcher();
	}

	private setupWatcher(): void {
		const skillDirs = ['.claude/skills', join(homedir(), '.claude/skills')];

		this._watcher = watch(skillDirs, {
			ignored: /node_modules/,
			persistent: true,
		});

		this._watcher.on('add', async (path) => {
			console.error(`Skill added: ${path}`);
			await this.skillRegistry.discover();
		});

		this._watcher.on('change', async (path) => {
			console.error(`Skill modified: ${path}`);
			await this.skillRegistry.discover();
		});

		this._watcher.on('unlink', async (path) => {
			console.error(`Skill removed: ${path}`);
			this.handleSkillRemoval(path);
		});
	}

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

	private extractSkillNameFromPath(skillPath: string): string | null {
		const parts = skillPath.split(/[/\\]/);
		return parts[parts.length - 1] || null;
	}

	public stop(): void {
		if (this._watcher) {
			this._watcher.close();
			this._watcher = null;
		}
	}
}
