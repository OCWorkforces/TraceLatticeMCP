/**
 * File system watcher for tool directory changes.
 *
 * This module provides the `ToolWatcher` class which monitors configured
 * tool directories for file changes using chokidar. It watches for
 * file additions and removals to enable dynamic tool discovery and registration.
 *
 * @module watcher
 */

import { watch, type FSWatcher } from 'chokidar';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Logger } from '../logger/StructuredLogger.js';
import type { ToolRegistry } from '../registry/ToolRegistry.js';

/**
 * File system watcher for tool directories.
 *
 * This class monitors configured tool directories for file system changes,
 * watching for tool file additions and removals. When tool files are added
 * or removed, it automatically updates the tool registry.
 *
 * The watched directories are:
 * - `.claude/tools` (project-local)
 * - `~/.claude/tools` (user-global)
 *
 * @remarks
 * **Watched Events:**
 * - `add` - A new tool file was added (triggers rediscovery)
 * - `unlink` - A tool file was removed (unregisters the tool)
 *
 * **Ignored Paths:**
 * - `node_modules` directories are ignored
 *
 * **Watcher Behavior:**
 * - Uses persistent mode to continue watching even if files are temporarily deleted
 * - Automatically starts watching when instantiated
 * - On file add: Triggers tool rediscovery to pick up new tools
 * - On file remove: Extracts tool name and unregisters it
 *
 * @example
 * ```typescript
 * import { ToolWatcher } from './ToolWatcher.js';
 * import { ToolRegistry } from './registry/ToolRegistry.js';
 *
 * const registry = new ToolRegistry();
 * const watcher = new ToolWatcher(registry);
 * // Watcher automatically starts monitoring tool directories
 *
 * // When done, stop the watcher
 * watcher.stop();
 * ```
 */
export class ToolWatcher {
	/** The underlying chokidar file system watcher. */
	private _watcher: FSWatcher | null = null;
	/** The tool registry to update when tools change. */
	private readonly _toolRegistry: ToolRegistry;
	private _logger: Logger;

	constructor(toolRegistry: ToolRegistry, logger?: Logger) {
		this._toolRegistry = toolRegistry;
		this._logger = logger ?? this._createNoopLogger();
		this.setupWatcher();
	}

	/**
	 * Create a no-op logger when none is provided.
	 */
	private _createNoopLogger(): Logger {
		return {
			info: () => {},
			warn: () => {},
			error: () => {},
			debug: () => {},
			setLevel: () => {},
			getLevel: () => 'info',
		};
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
			ignored: [/node_modules/, /\.DS_Store$/],
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
	 * When a new `.tool.md` file is detected, this method triggers
	 * tool rediscovery to pick up the new tool.
	 *
	 * @param toolPath - The file path of the added tool file
	 * @returns A Promise that resolves when handling is complete
	 * @private
	 */
	private async handleToolFileAdd(toolPath: string): Promise<void> {
		// Only process .tool.md files
		if (!toolPath.endsWith('.tool.md')) {
			return;
		}

		// Trigger rediscovery to pick up the new tool
		try {
			await this._toolRegistry.discoverAsync();
		} catch (error) {
			this._logger.error(`Failed to discover tools:`, { error });
		}
	}

	/**
	 * Handles the event when a tool file is removed.
	 *
	 * When a `.tool.md` file is deleted, this method extracts the tool
	 * name from the filename and removes it from the registry.
	 *
	 * @param toolPath - The file path of the removed tool file
	 * @returns A Promise that resolves when handling is complete
	 * @private
	 */
	private async handleToolFileRemoval(toolPath: string): Promise<void> {
		// Only process .tool.md files
		if (!toolPath.endsWith('.tool.md')) {
			return;
		}

		// Extract tool name from filename (e.g., "my-tool.tool.md" -> "my-tool")
		const fileName = basename(toolPath);
		const toolName = fileName.replace('.tool.md', '');

		if (toolName) {
			try {
				this._toolRegistry.removeTool(toolName);
			} catch (error) {
				this._logger.error(
					`Tool '${toolName}' not registered: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
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
	 * const registry = new ToolRegistry();
	 * const watcher = new ToolWatcher(registry);
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
