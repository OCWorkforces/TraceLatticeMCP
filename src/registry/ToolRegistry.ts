import type { Tool } from '../types.js';
import type { StructuredLogger } from '../logger/StructuredLogger.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';

/**
 * ToolRegistry manages MCP tool CRUD operations with discovery support.
 * Provides a clean abstraction for tool management separate from business logic.
 */
export class ToolRegistry {
	private _tools: Map<string, Tool>;
	private _logger: StructuredLogger | null;
	private _cache: DiscoveryCache<Tool>;

	constructor(logger?: StructuredLogger, cache?: DiscoveryCache<Tool>) {
		this._tools = new Map();
		this._logger = logger || null;
		// Create cache internally if not provided
		this._cache = cache || new DiscoveryCache<Tool>({ maxSize: 50, ttl: 300000 });
	}

	private log(message: string, meta?: Record<string, unknown>): void {
		if (this._logger) {
			this._logger.info(message, meta);
		} else {
			console.error(message); // Fallback for backward compatibility
		}
	}

	/**
	 * Add a tool to the registry
	 * @throws Error if tool already exists or name is invalid
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
	 * Remove a tool from the registry
	 * @throws Error if tool not found
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
	 * Update an existing tool
	 * @throws Error if tool not found
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
	 * Check if a tool exists
	 */
	public hasTool(name: string): boolean {
		return this._tools.has(name);
	}

	/**
	 * Get a tool by name
	 * Uses cache if available for performance
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
	 * Get all tools as an array
	 * Uses cache if available for performance
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
	 * Get tool names as an array
	 */
	public getNames(): string[] {
		return Array.from(this._tools.keys());
	}

	/**
	 * Clear all tools from the registry
	 */
	public clear(): void {
		this._tools.clear();
		this.log('Cleared all tools');
		// Invalidate cache when clearing all tools
		this._cache?.clear();
	}

	/**
	 * Get the number of tools in the registry
	 */
	public size(): number {
		return this._tools.size;
	}

	/**
	 * Set available tools from an external source (MCP client)
	 * Clears existing tools and adds new ones
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
