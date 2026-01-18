import { watch, type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';

export class ToolWatcher {
	private _watcher: FSWatcher | null = null;

	constructor() {
		this.setupWatcher();
	}

	private setupWatcher(): void {
		const toolDirs = ['.claude/tools', join(homedir(), '.claude/tools')];

		this._watcher = watch(toolDirs, {
			ignored: /node_modules/,
			persistent: true,
		});

		this._watcher.on('add', async (path) => {
			await this.handleToolFileAdd(path);
		});

		this._watcher.on('unlink', async (path) => {
			await this.handleToolFileRemoval(path);
		});
	}

	private async handleToolFileAdd(toolPath: string): Promise<void> {
		this.log(`Tool file added: ${toolPath}`);
	}

	private async handleToolFileRemoval(toolPath: string): Promise<void> {
		this.log(`Tool file removed: ${toolPath}`);
	}

	private log(message: string): void {
		console.error(message);
	}

	public stop(): void {
		if (this._watcher) {
			this._watcher.close();
			this._watcher = null;
		}
	}
}
