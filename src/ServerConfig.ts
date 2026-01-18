/**
 * Server configuration management with validation.
 *
 * This module provides the `ServerConfig` class which handles all server configuration
 * with built-in validation and sensible defaults. Configuration values are validated
 * on construction and warnings are emitted for out-of-range values.
 *
 * @module ServerConfig
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PersistenceConfig } from './persistence/PersistenceBackend.js';

/**
 * Configuration options for creating a `ServerConfig` instance.
 *
 * All properties are optional with sensible defaults applied during validation.
 *
 * @example
 * ```typescript
 * const options: ServerConfigOptions = {
 *   maxHistorySize: 500,
 *   maxBranches: 25,
 *   skillDirs: ['./custom-skills'],
 *   persistence: { enabled: true, backend: 'sqlite' }
 * };
 * ```
 */
export interface ServerConfigOptions {
	/**
	 * Maximum number of thoughts to keep in history.
	 * @default 1000
	 */
	maxHistorySize?: number;

	/**
	 * Maximum number of branches to maintain.
	 * @default 50
	 */
	maxBranches?: number;

	/**
	 * Maximum size of each branch.
	 * @default 100
	 */
	maxBranchSize?: number;

	/**
	 * Directory paths to search for skills.
	 * @default ['.claude/skills', '~/.claude/skills']
	 */
	skillDirs?: string[];

	/**
	 * Discovery cache configuration.
	 */
	discoveryCache?: {
		/**
		 * Time-to-live for cache entries in milliseconds.
		 * @default 300000 (5 minutes)
		 */
		ttl?: number;
		/**
		 * Maximum number of entries in the cache.
		 * @default 100
		 */
		maxSize?: number;
	};

	/**
	 * Persistence configuration for storing history and state.
	 */
	persistence?: PersistenceConfig;
}

/**
 * Server configuration with validation and defaults.
 *
 * This class manages all server configuration including history limits,
 * branch limits, skill directories, discovery cache settings, and persistence.
 * All values are validated on construction with appropriate defaults applied.
 *
 * @remarks
 * - Values outside recommended ranges trigger warnings but are still applied
 * - Environment variables override file-based configuration
 * - The `toJSON()` method provides a plain object representation
 *
 * @example
 * ```typescript
 * // Using defaults
 * const config1 = new ServerConfig();
 * console.log(config1.maxHistorySize); // 1000
 *
 * // With custom options
 * const config2 = new ServerConfig({
 *   maxHistorySize: 500,
 *   persistence: { enabled: true, backend: 'file', options: { dataDir: './data' } }
 * });
 *
 * // Export as plain object
 * const json = config2.toJSON();
 * ```
 */
export class ServerConfig {
	/** Maximum number of thoughts to keep in history. */
	public maxHistorySize: number;

	/** Maximum number of branches to maintain. */
	public maxBranches: number;

	/** Maximum size of each branch. */
	public maxBranchSize: number;

	/** Directory paths to search for skills. */
	public skillDirs: string[];

	/** Discovery cache configuration. */
	public discoveryCache: { ttl: number; maxSize: number };

	/** Persistence configuration. */
	public persistence: PersistenceConfig;

	/**
	 * Creates a new ServerConfig instance with validation.
	 *
	 * All values are validated and defaults are applied for undefined options.
	 * Warnings are emitted to console for values outside recommended ranges.
	 *
	 * @param options - Optional configuration overrides
	 *
	 * @example
	 * ```typescript
	 * const config = new ServerConfig({
	 *   maxHistorySize: 500,
	 *   skillDirs: ['./my-skills']
	 * });
	 * ```
	 */
	constructor(options: ServerConfigOptions = {}) {
		this.maxHistorySize = this.validateMaxHistorySize(options.maxHistorySize);
		this.maxBranches = this.validateMaxBranches(options.maxBranches);
		this.maxBranchSize = this.validateMaxBranchSize(options.maxBranchSize);
		this.skillDirs = this.validateSkillDirs(options.skillDirs);
		this.discoveryCache = this.validateDiscoveryCache(options.discoveryCache);
		this.persistence = this.validatePersistence(options.persistence);
	}

	/**
	 * Validates the max history size value.
	 * @param value - The value to validate
	 * @returns The validated value or default (1000)
	 * @private
	 */
	private validateMaxHistorySize(value?: number): number {
		const defaultValue = 1000;
		if (!value) return defaultValue;
		if (value < 1) {
			console.warn(`maxHistorySize must be at least 1, using ${defaultValue}`);
			return defaultValue;
		}
		if (value > 10000) {
			console.warn(`maxHistorySize ${value} exceeds recommended maximum 10000, using anyway`);
		}
		return value;
	}

	/**
	 * Validates the max branches value.
	 * @param value - The value to validate
	 * @returns The validated value or default (50)
	 * @private
	 */
	private validateMaxBranches(value?: number): number {
		const defaultValue = 50;
		if (!value) return defaultValue;
		if (value < 0) {
			console.warn(`maxBranches must be non-negative, using ${defaultValue}`);
			return defaultValue;
		}
		if (value > 1000) {
			console.warn(`maxBranches ${value} exceeds recommended maximum 1000, using anyway`);
		}
		return value;
	}

	/**
	 * Validates the max branch size value.
	 * @param value - The value to validate
	 * @returns The validated value or default (100)
	 * @private
	 */
	private validateMaxBranchSize(value?: number): number {
		const defaultValue = 100;
		if (!value) return defaultValue;
		if (value < 1) {
			console.warn(`maxBranchSize must be at least 1, using ${defaultValue}`);
			return defaultValue;
		}
		if (value > 1000) {
			console.warn(`maxBranchSize ${value} exceeds recommended maximum 1000, using anyway`);
		}
		return value;
	}

	/**
	 * Validates the skill directories value.
	 * @param value - The value to validate
	 * @returns The validated value or default ['.claude/skills', '~/.claude/skills']
	 * @private
	 */
	private validateSkillDirs(value?: string[]): string[] {
		const defaultValue = ['.claude/skills', join(homedir(), '.claude/skills')];
		if (!value) return defaultValue;
		return value;
	}

	/**
	 * Validates the discovery cache configuration.
	 * @param value - The value to validate
	 * @returns The validated value with defaults applied
	 * @private
	 */
	private validateDiscoveryCache(value?: { ttl?: number; maxSize?: number }): {
		ttl: number;
		maxSize: number;
	} {
		return {
			ttl: value?.ttl ?? 300000,
			maxSize: value?.maxSize ?? 100,
		};
	}

	/**
	 * Validates the persistence configuration.
	 * @param value - The value to validate
	 * @returns The validated value with defaults applied
	 * @private
	 */
	private validatePersistence(value?: PersistenceConfig): PersistenceConfig {
		if (!value) {
			// Default to in-memory (no actual persistence, just consistency)
			return {
				enabled: false,
				backend: 'memory',
			};
		}

		// Validate backend type
		const validBackends = ['file', 'sqlite', 'memory'];
		const backend = value.backend ?? 'memory';
		if (!validBackends.includes(backend)) {
			console.warn(
				`Invalid persistence backend: ${backend}. Defaulting to 'memory'. Valid options: ${validBackends.join(', ')}`
			);
			return { enabled: false, backend: 'memory' };
		}

		return {
			enabled: value.enabled ?? false,
			backend,
			options: value.options ?? {},
		};
	}

	/**
	 * Converts the configuration to a plain object.
	 *
	 * Useful for serialization, logging, or when a plain object representation
	 * is preferred over the ServerConfig instance.
	 *
	 * @returns A plain object representation of the configuration
	 *
	 * @example
	 * ```typescript
	 * const config = new ServerConfig({ maxHistorySize: 500 });
	 * const json = config.toJSON();
	 * console.log(JSON.stringify(json, null, 2));
	 * ```
	 */
	public toJSON(): ServerConfigOptions {
		return {
			maxHistorySize: this.maxHistorySize,
			maxBranches: this.maxBranches,
			maxBranchSize: this.maxBranchSize,
			skillDirs: this.skillDirs,
			discoveryCache: this.discoveryCache,
			persistence: this.persistence,
		};
	}
}
