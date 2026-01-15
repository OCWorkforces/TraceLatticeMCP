import { watch, type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolRegistry } from './registry/ToolRegistry.js';

export class ToolWatcher {
	private _watcher: FSWatcher | null = null;

	constructor(private toolRegistry: ToolRegistry) {
		this.setupWatcher();
	}

	private setupWatcher(): void {
		const toolDirs = ['.claude/tools', join(homedir(), '.claude/tools')];

		this._watcher = watch(toolDirs, {
			ignored: /node_modules/,
			persistent: true,
		});

		this._watcher.on('add', async (path) => {
			console.error(`Tool file added: ${path}`);
			await this.handleToolFileChange(path);
		});

		this._watcher.on('change', async (path) => {
			console.error(`Tool file modified: ${path}`);
			await this.handleToolFileChange(path);
		});

		this._watcher.on('unlink', async (path) => {
			console.error(`Tool file removed: ${path}`);
			this.handleToolRemoval(path);
		});
	}

	private async handleToolFileChange(toolPath: string): Promise<void> {
		// When a tool file changes, we need to trigger a re-discovery
		// This is handled by clearing and re-adding tools
		const toolName = this.extractToolNameFromPath(toolPath);
		if (toolName) {
			try {
				// Remove existing tool with this name
				if (this.toolRegistry.hasTool(toolName)) {
					this.toolRegistry.removeTool(toolName);
				}
				// The actual tool discovery would need to be implemented
				// For now, we just log that a change was detected
				console.error(`Tool change detected for: ${toolName}. Manual reload may be required.`);
			} catch (error) {
				console.error(
					`Failed to handle tool change for ${toolName}:`,
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	}

	private async handleToolRemoval(toolPath: string): Promise<void> {
		const toolName = this.extractToolNameFromPath(toolPath);
		if (toolName) {
			try {
				this.toolRegistry.removeTool(toolName);
			} catch (error) {
				console.error(
					`Failed to remove tool ${toolName}:`,
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	}

	private extractToolNameFromPath(toolPath: string): string | null {
		const parts = toolPath.split(/[/\\]/);
		const fileName = parts[parts.length - 1];
		if (fileName) {
			// Remove file extension
			return fileName.replace(/\.(json|md|yaml|yml)$/, '');
		}
		return null;
	}

	public stop(): void {
		if (this._watcher) {
			this._watcher.close();
			this._watcher = null;
		}
	}
}
