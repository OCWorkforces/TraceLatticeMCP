/**
 * Tool registry for managing MCP tool CRUD operations.
 *
 * This module provides the `ToolRegistry` class which manages the registration,
 * retrieval, update, and removal of MCP tools. It supports optional caching
 * for improved performance, filesystem discovery, and integrates with the logging system.
 *
 * @module registry
 */

import type { Tool } from '../types.js';
import type { Logger } from '../logger/StructuredLogger.js';
import { NullLogger } from '../logger/NullLogger.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Configuration options for creating a `ToolRegistry` instance.
 *
 * @example
 * ```typescript
 * const options: ToolRegistryOptions = {
 *   logger: new StructuredLogger({ context: 'ToolRegistry' }),
 *   cache: new DiscoveryCache({ ttl: 300000, maxSize: 100 }),
 *   toolDirs: ['./custom-tools', '~/.claude/tools'],
 *   lazyDiscovery: true
 * };
 * ```
 */
export interface ToolRegistryOptions {
	/** Optional logger for diagnostics. */
	logger?: Logger;

	/** Optional cache for tool lookups. */
	cache?: DiscoveryCache<Tool>;

	/**
	 * Directory paths to search for tools.
	 * @default ['.claude/tools', '~/.claude/tools']
	 */
	toolDirs?: string[];

	/**
	 * Enable lazy discovery (discover on first access instead of startup).
	 * @default false
	 */
	lazyDiscovery?: boolean;
}

/**
 * Registry for managing MCP tool operations.
 *
 * This class provides a clean abstraction for tool management separate from
 * business logic. It supports CRUD operations on tools, with optional caching
 * for improved performance on frequently accessed tools.
 *
 * @remarks
 * **Tool Discovery:**
 * - Tools are discovered from directories in priority order
 * - Tool files must have `.tool.md` extensions
 * - Tools are defined with YAML frontmatter containing metadata
 * - Discovery is async and can be awaited via `discoverAsync()`
 *
 * **Tool File Format:**
 * ```yaml
 * ---
 * name: my-custom-tool
 * description: Searches for files by pattern
 * inputSchema:
 *   type: object
 *   properties:
 *     pattern:
 *       type: string
 *   required: [pattern]
 * ---
 * ```
 *
 * **Cache Behavior:**
 * - Cache is checked before accessing tool storage
 * - Cache is invalidated on add, update, and remove operations
 * - The `all` key caches the complete tool list
 * - Individual tools are cached with `tool:{name}` keys
 *
 * **Thread Safety:**
 * This class is not thread-safe and should not be shared across
 * asynchronous operations without proper synchronization.
 *
 * @example
 * ```typescript
 * import { ToolRegistry } from './registry/ToolRegistry.js';
 * import { StructuredLogger } from './logger/StructuredLogger.js';
 *
 * const logger = new StructuredLogger({ context: 'ToolRegistry' });
 * const registry = new ToolRegistry({ logger });
 *
 * // Discover tools from filesystem
 * const count = await registry.discoverAsync();
 *
 * // Add a tool
 * registry.addTool({
 *   name: 'my-search-tool',
 *   description: 'Searches for files',
 *   inputSchema: { type: 'object', properties: { pattern: { type: 'string' } } }
 * });
 *
 * // Get a tool
 * const tool = registry.getTool('my-search-tool');
 *
 * // List all tools
 * const allTools = registry.getAll();
 * console.log(`Registered tools: ${allTools.map(t => t.name).join(', ')}`);
 *
 * // Update a tool
 * registry.updateTool('my-search-tool', { description: 'New description' });
 *
 * // Remove a tool
 * registry.removeTool('my-search-tool');
 * ```
 */
export class ToolRegistry {
	/** Internal storage for tools indexed by name. */
	private _tools: Map<string, Tool>;

	/** Logger for diagnostics. */
	private _logger: Logger;

	/** Optional cache for tool lookups. */
	private _cache: DiscoveryCache<Tool>;

	/** Directory paths to search for tools. */
	private _toolDirs: string[];

	/** Whether discovery has been performed. */
	private _discovered: boolean = false;

	/** Promise for in-progress discovery (null if not in progress). */
	private _discoveryPromise: Promise<number> | null = null;

	/**
	 * Creates a new ToolRegistry instance.
	 *
	 * @param options - Configuration options for registry
	 *
	 * @example
	 * ```typescript
	 * const registry1 = new ToolRegistry();
	 *
	 * const registry2 = new ToolRegistry({
	 *   logger: new StructuredLogger({ context: 'Tools' }),
	 *   cache: new DiscoveryCache({ ttl: 300000, maxSize: 50 }),
	 *   toolDirs: ['./my-tools'],
	 *   lazyDiscovery: true
	 * });
	 * ```
	 */
	constructor(options: ToolRegistryOptions = {}) {
		this._tools = new Map();
		this._logger = options.logger ?? new NullLogger();
		this._cache = options.cache || new DiscoveryCache<Tool>({ maxSize: 50, ttl: 300000 });
		this._toolDirs = options.toolDirs || ['.claude/tools', join(homedir(), '.claude/tools')];
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
	 * Adds a tool to the registry.
	 *
	 * @param tool - The tool to add
	 * @throws {Error} If tool already exists or name is invalid
	 *
	 * @example
	 * ```typescript
	 * registry.addTool({
	 *   name: 'read-file',
	 *   description: 'Reads a file from the filesystem',
	 *   inputSchema: {
	 *     type: 'object',
	 *     properties: {
	 *       path: { type: 'string', description: 'File path' }
	 *     },
	 *     required: ['path']
	 *   }
	 * });
	 * ```
	 */
	public addTool(tool: Tool): void {
		if (!tool.name) {
			throw new Error('Tool must have a valid name');
		}
		if (this._tools.has(tool.name)) {
			throw new Error(`tool '${tool.name}' already exists`);
		}
		this._tools.set(tool.name, tool);
		this.log(`Added tool: ${tool.name}`, { toolName: tool.name });
		// Invalidate cache when adding a new tool
		this._cache?.invalidate('all');
	}

	/**
	 * Removes a tool from the registry.
	 *
	 * @param name - The name of the tool to remove
	 * @throws {Error} If tool not found
	 *
	 * @example
	 * ```typescript
	 * registry.removeTool('read-file');
	 * ```
	 */
	public removeTool(name: string): void {
		if (!this._tools.has(name)) {
			throw new Error(`tool '${name}' not found, cannot remove`);
		}
		this._tools.delete(name);
		this.log(`Removed tool: ${name}`, { toolName: name });
		// Invalidate cache when removing a tool
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	/**
	 * Updates an existing tool with partial data.
	 *
	 * @param name - The name of the tool to update
	 * @param updates - Partial tool data with fields to update
	 * @throws {Error} If tool not found
	 *
	 * @example
	 * ```typescript
	 * registry.updateTool('read-file', {
	 *   description: 'Updated description'
	 * });
	 * ```
	 */
	public updateTool(name: string, updates: Partial<Tool>): void {
		if (!this._tools.has(name)) {
			throw new Error(`tool '${name}' not found, cannot update`);
		}
		const existing = this._tools.get(name)!;
		const updated = { ...existing, ...updates };
		this._tools.set(name, updated);
		this.log(`Updated tool: ${name}`, { toolName: name });
		// Invalidate cache when updating a tool
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	/**
	 * Checks if a tool exists in the registry.
	 *
	 * @param name - The name of the tool to check
	 * @returns true if the tool exists, false otherwise
	 *
	 * @example
	 * ```typescript
	 * if (registry.hasTool('read-file')) {
	 *   console.log('Tool is registered');
	 * }
	 * ```
	 */
	public hasTool(name: string): boolean {
		return this._tools.has(name);
	}

	/**
	 * Gets a tool by name.
	 *
	 * Uses cache if available for performance. Returns undefined if the tool
	 * is not found.
	 *
	 * @param name - The name of the tool to get
	 * @returns The tool if found, undefined otherwise
	 *
	 * @example
	 * ```typescript
	 * const tool = registry.getTool('read-file');
	 * if (tool) {
	 *   console.log(`Found: ${tool.description}`);
	 * }
	 * ```
	 */
	public getTool(name: string): Tool | undefined {
		// Check cache first
		if (this._cache) {
			const cached = this._cache.get(`tool:${name}`);
			if (cached && cached.length > 0) {
				return cached[0];
			}
		}
		// Return from storage
		return this._tools.get(name);
	}

	/**
	 * Gets all tools as an array.
	 *
	 * Uses cache if available for performance. The result is cached under
	 * the 'all' key for subsequent calls.
	 *
	 * @returns An array of all registered tools
	 *
	 * @example
	 * ```typescript
	 * const tools = registry.getAll();
	 * tools.forEach(tool => {
	 *   console.log(`${tool.name}: ${tool.description}`);
	 * });
	 * ```
	 */
	public getAll(): Tool[] {
		// Check cache first
		if (this._cache) {
			const cached = this._cache.get('all');
			if (cached) {
				return cached;
			}
		}
		// Get from storage
		const tools = Array.from(this._tools.values());
		// Cache the result
		this._cache?.set('all', tools);
		return tools;
	}

	/**
	 * Gets all tool names as an array.
	 *
	 * @returns An array of tool names
	 *
	 * @example
	 * ```typescript
	 * const names = registry.getNames();
	 * console.log(`Tools: ${names.join(', ')}`);
	 * ```
	 */
	public getNames(): string[] {
		return Array.from(this._tools.keys());
	}

	/**
	 * Clears all tools from the registry.
	 *
	 * This removes all tools and clears the cache. Useful for testing
	 * or resetting state.
	 *
	 * @example
	 * ```typescript
	 * registry.clear();
	 * console.log(`Cleared all tools`);
	 * ```
	 */
	public clear(): void {
		this._tools.clear();
		this.log('Cleared all tools');
		// Invalidate cache when clearing all tools
		this._cache?.clear();
	}

	/**
	 * Gets the number of tools in the registry.
	 *
	 * @returns The count of registered tools
	 *
	 * @example
	 * ```typescript
	 * console.log(`Total tools: ${registry.size()}`);
	 * ```
	 */
	public size(): number {
		return this._tools.size;
	}

	/**
	 * Asynchronously discovers tools from the configured directories.
	 *
	 * This method scans all configured tool directories for markdown files
	 * with YAML frontmatter, parses them, and adds valid tools to the registry.
	 * Multiple concurrent calls share the same discovery promise.
	 *
	 * @remarks
	 * **Supported File Extensions:** `.tool.md`
	 *
	 * **Frontmatter Format:**
	 * ```yaml
	 * ---
	 * name: tool-name
	 * description: Tool description
	 * inputSchema:
	 *   type: object
	 *   properties:
	 *     param:
	 *       type: string
	 *   required: [param]
	 * ---
	 * ```
	 *
	 * Subsequent calls return cached results if discovery has already completed.
	 * If discovery is in progress, the same promise is returned to all callers.
	 *
	 * @returns A Promise resolving to the number of tools discovered
	 *
	 * @example
	 * ```typescript
	 * // Perform initial discovery
	 * const count = await registry.discoverAsync();
	 * console.log(`Discovered ${count} tools`);
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
	 * Performs the actual tool discovery operation.
	 *
	 * Scans configured directories for tool files, parses their frontmatter,
	 * and adds valid tools to the registry.
	 *
	 * @returns A Promise resolving to the number of tools discovered
	 * @private
	 */
	private async _performDiscovery(): Promise<number> {
		let discoveredCount = 0;

		for (const toolDir of this._toolDirs) {
			try {
				if (!existsSync(toolDir)) {
					continue;
				}

				const entries = await readdir(toolDir, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isFile() && entry.name.endsWith('.tool.md')) {
						const filePath = join(toolDir, entry.name);
						try {
							const content = await readFile(filePath, 'utf-8');
							const parsed = this._parseToolFrontmatter(content);
							if (parsed._error) {
								this.log(`Skipped ${entry.name}: ${parsed._error}`);
								continue;
							}
							if (parsed.name && parsed.inputSchema) {
								// Check if already exists before adding
								if (!this._tools.has(parsed.name)) {
									const tool: Tool = {
										name: parsed.name,
										description: parsed.description || '',
										inputSchema: parsed.inputSchema,
									};
									this._tools.set(tool.name, tool);
									discoveredCount++;
								}
							}
						} catch (readError) {
							this.log(`Failed to read tool file ${entry.name}`, {
								error: readError instanceof Error ? readError.message : String(readError),
							});
						}
					}
				}
			} catch (error) {
				this.log(`Failed to scan tool directory: ${toolDir}`, {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		this._discovered = true;
		this._cache?.set('all', Array.from(this._tools.values()));
		this.log(`Discovery complete: found ${discoveredCount} tools`, { discoveredCount });
		return discoveredCount;
	}

	/**
	 * Parses YAML frontmatter from a tool file content.
	 *
	 * Extracts tool metadata from the YAML frontmatter block between
	 * the first set of `---` delimiters. Returns a partial tool object
	 * or an error marker if parsing fails.
	 *
	 * @param content - The file content to parse
	 * @returns A partial tool object, with an `_error` property if parsing failed
	 * @private
	 */
	private _parseToolFrontmatter(content: string): Partial<Tool> & { _error?: string } {
		// Parse YAML frontmatter from tool file
		const match = content.match(/^---\n([\s\S]+?)\n---/);
		if (!match) {
			return { _error: 'No YAML frontmatter found' };
		}

		try {
			const frontmatter = parseYaml(match[1]) as Record<string, unknown>;

			const result: Partial<Tool> = {
				name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
				description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
				inputSchema: frontmatter.inputSchema as Tool['inputSchema'],
			};

			// Validate required fields
			if (!result.name) {
				return { _error: 'Missing required field: name' };
			}
			if (!result.inputSchema) {
				return { _error: 'Missing required field: inputSchema' };
			}

			return result;
		} catch {
			return { _error: 'YAML parse error' };
		}
	}

	/**
	 * Sets available tools from an external source (MCP client).
	 *
	 * Clears existing tools and adds new ones from the provided array.
	 * Useful for syncing with the MCP client's available tools.
	 *
	 * @param tools - Array of tools from an external source
	 *
	 * @example
	 * ```typescript
	 * // Sync with MCP client tools
	 * const mcpTools = await mcpClient.listTools();
	 * registry.setTools(mcpTools);
	 * ```
	 */
	public setTools(tools: Tool[]): void {
		this.clear();
		for (const tool of tools) {
			try {
				this.addTool(tool);
			} catch (error) {
				this.log(`Error adding tool '${tool.name}':`, {
					toolName: tool.name,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		this.log(`Set ${tools.length} tools from external source`, { toolCount: tools.length });
	}
}
