/**
 * Base registry providing shared CRUD, caching, and discovery logic.
 *
 * This abstract generic class extracts the common patterns from `ToolRegistry`
 * and `SkillRegistry` into a single reusable base. Subclasses only need to
 * implement item-specific parsing, file filtering, and error construction.
 *
 * @template T - The registry item type (must have a `name` property)
 * @module registry
 */

import type { Logger } from '../contracts/index.js';
import { NullLogger } from '../logger/NullLogger.js';
import { DiscoveryCache } from '../cache/DiscoveryCache.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Configuration options for creating a `BaseRegistry` instance.
 */
export interface BaseRegistryOptions {
	/** Optional logger for diagnostics. */
	logger?: Logger;

	/** Optional cache for lookups. */
	cache?: DiscoveryCache<{ name: string }>;

	/**
	 * Directory paths to search for items.
	 */
	searchDirs?: string[];

	/**
	 * Enable lazy discovery (discover on first access instead of startup).
	 * @default false
	 */
	lazyDiscovery?: boolean;
}

/**
 * Abstract base registry for managing named items with discovery and caching.
 *
 * Provides shared CRUD operations, filesystem discovery with deduplication,
 * and optional LRU caching. Subclasses implement item-specific parsing logic
 * and error construction.
 *
 * @template T - The registry item type (must have a `name` property)
 */
export abstract class BaseRegistry<T extends { name: string }> {
	/** Internal storage for items indexed by name. */
	protected _items: Map<string, T>;

	/** Logger for diagnostics. */
	protected _logger: Logger;

	/** Optional cache for lookups. */
	protected _cache: DiscoveryCache<T>;

	/** Directory paths to search for items. */
	protected _searchDirs: string[];

	/** Whether discovery has been performed. */
	protected _discovered: boolean = false;

	/** Promise for in-progress discovery (null if not in progress). */
	protected _discoveryPromise: Promise<number> | null = null;

	/** File extensions to match during discovery. */
	protected abstract readonly _fileExtensions: string[];

	/**
	 * Creates an error for invalid item data.
	 * @param reason - The reason for the validation failure
	 */
	protected abstract _createInvalidError(reason: string): Error;

	/**
	 * Creates an error for duplicate items.
	 * @param name - The name of the duplicate item
	 */
	protected abstract _createDuplicateError(name: string): Error;

	/**
	 * Creates an error for items not found.
	 * @param name - The name of the missing item
	 * @param action - The action that was attempted
	 */
	protected abstract _createNotFoundError(name: string, action: string): Error;

	/**
	 * Parses frontmatter content into a partial item.
	 * @param content - The file content to parse
	 * @returns A partial item, with an `_error` property if parsing failed
	 */
	protected abstract _parseFrontmatter(content: string): Partial<T> & { _error?: string };

	/**
	 * Determines whether a file should be skipped during discovery.
	 * @param fileName - The name of the file to check
	 * @returns true if the file should be skipped
	 */
	protected abstract _shouldSkipFile(fileName: string): boolean;

	/**
	 * Constructs a complete item from parsed frontmatter data.
	 * Returns null if the parsed data is insufficient.
	 * @param parsed - The parsed frontmatter data
	 * @returns A complete item, or null if data is insufficient
	 */
	protected abstract _buildItem(parsed: Partial<T>): T | null;

	/**
	 * The entity name used in log messages (e.g., 'tool', 'skill').
	 */
	protected abstract readonly _entityName: string;

	constructor(options: BaseRegistryOptions & Record<string, unknown>) {
		this._items = new Map();
		this._logger = (options.logger ?? new NullLogger()) as Logger;
		this._cache = (options.cache ||
			new DiscoveryCache<T>({ maxSize: 50, ttl: 300000 })) as DiscoveryCache<T>;
		this._searchDirs = (options.searchDirs ?? []) as string[];
	}

	/**
	 * Internal logging method.
	 * @param message - The message to log
	 * @param meta - Optional metadata
	 */
	protected log(message: string, meta?: Record<string, unknown>): void {
		this._logger.info(message, meta);
	}

	/**
	 * Adds an item to the registry.
	 *
	 * @param item - The item to add
	 * @throws If item already exists or name is invalid
	 */
	public add(item: T): void {
		if (!item.name) {
			throw this._createInvalidError(`${this._entityName} must have a valid name`);
		}
		if (this._items.has(item.name)) {
			throw this._createDuplicateError(item.name);
		}
		this._items.set(item.name, item);
		this.log(`Added ${this._entityName}: ${item.name}`, { [`${this._entityName}Name`]: item.name });
		// Invalidate cache when adding a new item
		this._cache?.invalidate('all');
	}

	/**
	 * Removes an item from the registry.
	 *
	 * @param name - The name of the item to remove
	 * @throws If item not found
	 */
	public remove(name: string): void {
		if (!this._items.has(name)) {
			throw this._createNotFoundError(name, 'remove');
		}
		this._items.delete(name);
		this.log(`Removed ${this._entityName}: ${name}`, { [`${this._entityName}Name`]: name });
		// Invalidate cache when removing an item
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	/**
	 * Updates an existing item with partial data.
	 *
	 * @param name - The name of the item to update
	 * @param updates - Partial item data with fields to update
	 * @throws If item not found
	 */
	public update(name: string, updates: Partial<T>): void {
		if (!this._items.has(name)) {
			throw this._createNotFoundError(name, 'update');
		}
		const existing = this._items.get(name)!;
		const updated = { ...existing, ...updates };
		this._items.set(name, updated);
		this.log(`Updated ${this._entityName}: ${name}`, { [`${this._entityName}Name`]: name });
		// Invalidate cache when updating an item
		this._cache?.invalidate('all');
		this._cache?.invalidate(name);
	}

	/**
	 * Gets an item by name.
	 *
	 * @param name - The name of the item to get
	 * @returns The item if found, undefined otherwise
	 */
	public get(name: string): T | undefined {
		return this._items.get(name);
	}

	/**
	 * Gets all items as an array.
	 *
	 * Uses cache if available for performance.
	 *
	 * @returns An array of all registered items
	 */
	public getAll(): T[] {
		// Check cache first
		if (this._cache) {
			const cached = this._cache.get('all');
			if (cached) {
				return cached;
			}
		}
		// Get from storage
		const items = Array.from(this._items.values());
		// Cache the result
		this._cache?.set('all', items);
		return items;
	}

	/**
	 * Checks if an item exists in the registry.
	 *
	 * @param name - The name of the item to check
	 * @returns true if the item exists, false otherwise
	 */
	public has(name: string): boolean {
		return this._items.has(name);
	}

	/**
	 * Gets all item names as an array.
	 *
	 * @returns An array of item names
	 */
	public getNames(): string[] {
		return Array.from(this._items.keys());
	}

	/**
	 * Clears all items from the registry.
	 */
	public clear(): void {
		this._items.clear();
		this.log(`Cleared all ${this._entityName}s`);
		// Invalidate cache when clearing all items
		this._cache?.clear();
	}

	/**
	 * Gets the number of items in the registry.
	 *
	 * @returns The count of registered items
	 */
	public size(): number {
		return this._items.size;
	}

	/**
	 * Asynchronously discovers items from the configured directories.
	 *
	 * Multiple concurrent calls share the same discovery promise.
	 * Subsequent calls return cached results if discovery has already completed.
	 *
	 * @returns A Promise resolving to the number of items discovered
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
	 * Performs the actual discovery operation.
	 *
	 * Scans configured directories for item files, parses their frontmatter,
	 * and adds valid items to the registry.
	 *
	 * @returns A Promise resolving to the number of items discovered
	 */
	protected async _performDiscovery(): Promise<number> {
		let discoveredCount = 0;

		for (const dir of this._searchDirs) {
			try {
				if (!existsSync(dir)) {
					continue;
				}

				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					if (this._shouldSkipFile(entry.name)) {
						continue;
					}

					if (entry.isFile() && this._fileExtensions.some((ext) => entry.name.endsWith(ext))) {
						const filePath = join(dir, entry.name);
						try {
							const content = await readFile(filePath, 'utf-8');
							const parsed = this._parseFrontmatter(content);
							if (parsed._error) {
								this.log(`Skipped ${entry.name}: ${parsed._error}`);
								continue;
							}
							if (parsed.name) {
								// Check if already exists before adding
								if (!this._items.has(parsed.name)) {
									const item = this._buildItem(parsed);
									if (item) {
										this._items.set(item.name, item);
										discoveredCount++;
									}
								}
							}
						} catch (readError) {
							this.log(`Failed to read ${this._entityName} file ${entry.name}`, {
								error: readError instanceof Error ? readError.message : String(readError),
							});
						}
					}
				}
			} catch (error) {
				this.log(`Failed to scan ${this._entityName} directory: ${dir}`, {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		this._discovered = true;
		this._cache?.set('all', Array.from(this._items.values()));
		this.log(`Discovery complete: found ${discoveredCount} ${this._entityName}s`, {
			discoveredCount,
		});
		return discoveredCount;
	}

	/**
	 * Parses YAML frontmatter from file content.
	 *
	 * This is a shared utility for subclasses that parse YAML frontmatter.
	 *
	 * @param content - The file content to parse
	 * @returns The parsed YAML object, or null if no frontmatter found
	 */
	protected _extractFrontmatter(content: string): Record<string, unknown> | null {
		const match = content.match(/^---\n([\s\S]+?)\n---/);
		if (!match) {
			return null;
		}
		return parseYaml(match[1]!) as Record<string, unknown>;
	}

	/**
	 * Sets items from an external source.
	 *
	 * Clears existing items and adds new ones from the provided array.
	 *
	 * @param items - Array of items from an external source
	 */
	public setAll(items: T[]): void {
		this.clear();
		for (const item of items) {
			try {
				this.add(item);
			} catch (error) {
				this.log(`Error adding ${this._entityName} '${item.name}':`, {
					[`${this._entityName}Name`]: item.name,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		this.log(`Set ${items.length} ${this._entityName}s from external source`, {
			[`${this._entityName}Count`]: items.length,
		});
	}
}
