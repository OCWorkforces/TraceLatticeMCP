/**
 * Tool registry for managing MCP tool CRUD operations.
 *
 * This module provides the `ToolRegistry` class which manages the registration,
 * retrieval, update, and removal of MCP tools. It supports optional caching
 * for improved performance and integrates with the logging system.
 *
 * @module registry
 */

import type { Tool } from '../types.js';
import type { StructuredLogger } from '../logger/StructuredLogger.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';

/**
 * Registry for managing MCP tool operations.
 *
 * This class provides a clean abstraction for tool management separate from
 * business logic. It supports CRUD operations on tools, with optional caching
 * for improved performance on frequently accessed tools.
 *
 * @remarks
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
 * const registry = new ToolRegistry(logger);
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

	/** Optional logger for diagnostics. */
	private _logger: StructuredLogger | null;

	/** Optional cache for tool lookups. */
	private _cache: DiscoveryCache<Tool>;

	/**
	 * Creates a new ToolRegistry instance.
	 *
	 * @param logger - Optional logger for diagnostics
	 * @param cache - Optional cache for tool lookups (created internally if not provided)
	 *
	 * @example
	 * ```typescript
	 * const registry1 = new ToolRegistry();
	 *
	 * const registry2 = new ToolRegistry(
	 *   new StructuredLogger({ context: 'Tools' }),
	 *   new DiscoveryCache({ ttl: 300000, maxSize: 50 })
	 * );
	 * ```
	 */
	constructor(logger?: StructuredLogger, cache?: DiscoveryCache<Tool>) {
		this._tools = new Map();
		this._logger = logger || null;
		// Create cache internally if not provided
		this._cache = cache || new DiscoveryCache<Tool>({ maxSize: 50, ttl: 300000 });
	}

	/**
	 * Internal logging method with fallback.
	 * @param message - The message to log
	 * @param meta - Optional metadata
	 * @private
	 */
	private log(message: string, meta?: Record<string, unknown>): void {
		if (this._logger) {
			this._logger.info(message, meta);
		} else {
			console.error(message); // Fallback for backward compatibility
		}
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
				this.log(
					`Error adding tool '${tool.name}':`,
					{ toolName: tool.name, error: error instanceof Error ? error.message : String(error) }
				);
			}
		}
		this.log(`Set ${tools.length} tools from external source`, { toolCount: tools.length });
	}
}
