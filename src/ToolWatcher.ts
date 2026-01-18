/**
 * File system watcher for tool directory changes.
 *
 * This module provides the `ToolWatcher` class which monitors configured
 * tool directories for file changes using chokidar. It watches for
 * file additions and removals to enable dynamic tool discovery.
 *
 * @module watcher
 */

import { watch, type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * File system watcher for tool directories.
 *
 * This class monitors configured tool directories for file system changes,
 * watching for tool file additions and removals. The watched directories are:
 * - `.claude/tools` (project-local)
 * - `~/.claude/tools` (user-global)
 *
 * @remarks
 * **Watched Events:**
 * - `add` - A new tool file was added
 * - `unlink` - A tool file was removed
 *
 * **Ignored Paths:**
 * - `node_modules` directories are ignored
 *
 * **Watcher Behavior:**
 * - Uses persistent mode to continue watching even if files are temporarily deleted
 * - Automatically starts watching when instantiated
 *
 * @example
 * ```typescript
 * import { ToolWatcher } from './ToolWatcher.js';
 *
 * const watcher = new ToolWatcher();
 * // Watcher automatically starts monitoring tool directories
 *
 * // When done, stop the watcher
 * watcher.stop();
 * ```
 */
export class ToolWatcher {
	/** The underlying chokidar file system watcher. */
	private _watcher: FSWatcher | null = null;

	/**
	 * Creates a new ToolWatcher and starts watching tool directories.
	 *
	 * The watcher automatically starts monitoring `.claude/tools` and
	 * `~/.claude/tools` directories upon construction.
	 *
	 * @example
	 * ```typescript
	 * const watcher = new ToolWatcher();
	 * ```
	 */
	constructor() {
		this.setupWatcher();
	}

	/**
	 * Sets up the file system watcher for tool directories.
	 *
	 * Configures chokidar to watch the tool directories and sets up
	 * event handlers for file additions and removals.
	 *
	 * @private
	 */
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

	/**
	 * Handles the event when a tool file is added.
	 *
	 * This method is called when a new tool file is detected in one of
	 * the watched directories. Subclasses can override this method to
	 * implement custom handling logic.
	 *
	 * @param toolPath - The file path of the added tool file
	 * @returns A Promise that resolves when handling is complete
	 *
	 * @example
	 * ```typescript
	 * class CustomToolWatcher extends ToolWatcher {
	 *   protected async handleToolFileAdd(toolPath: string): Promise<void> {
	 *     await super.handleToolFileAdd(toolPath);
	 *     // Custom logic to parse and register the tool
	 *   }
	 * }
	 * ```
	 */
	private async handleToolFileAdd(toolPath: string): Promise<void> {
		this.log(`Tool file added: ${toolPath}`);
	}

	/**
	 * Handles the event when a tool file is removed.
	 *
	 * This method is called when a tool file is deleted from one of
	 * the watched directories. Subclasses can override this method to
	 * implement custom handling logic.
	 *
	 * @param toolPath - The file path of the removed tool file
	 * @returns A Promise that resolves when handling is complete
	 *
	 * @example
	 * ```typescript
	 * class CustomToolWatcher extends ToolWatcher {
	 *   protected async handleToolFileRemoval(toolPath: string): Promise<void> {
	 *     await super.handleToolFileRemoval(toolPath);
	 *     // Custom logic to unregister the tool
	 *   }
	 * }
	 * ```
	 */
	private async handleToolFileRemoval(toolPath: string): Promise<void> {
		this.log(`Tool file removed: ${toolPath}`);
	}

	/**
	 * Internal logging method.
	 *
	 * @param message - The message to log
	 * @private
	 */
	private log(message: string): void {
		console.error(message);
	}

	/**
	 * Stops watching tool directories and cleans up resources.
	 *
	 * This method closes the underlying chokidar watcher and releases
	 * file system resources. After calling this method, the watcher
	 * cannot be restarted.
	 *
	 * @example
	 * ```typescript
	 * const watcher = new ToolWatcher();
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
