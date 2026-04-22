/**
 * Configuration file loading with environment variable override support.
 *
 * This module provides the `ConfigLoader` class which handles loading configuration
 * from YAML and JSON files in standard locations, with automatic environment variable
 * overrides for all settings.
 *
 * @module config
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { PersistenceConfig } from '../contracts/PersistenceBackend.js';
import { getErrorMessage } from '../errors.js';
import type { FeatureFlags } from '../ServerConfig.js';

/**
 * Configuration options loaded from config files.
 *
 * These options represent the structure of configuration files (JSON or YAML)
 * that can be loaded from standard locations. All values can be overridden
 * by environment variables.
 *
 * @example
 * ```yaml
 * # .claude/config.yaml
 * maxHistorySize: 500
 * maxBranches: 25
 * logLevel: debug
 * prettyLog: true
 * skillDirs:
 *   - ./custom-skills
 * discoveryCache:
 *   ttl: 600000
 *   maxSize: 200
 * persistence:
 *   enabled: true
 *   backend: sqlite
 *   options:
 *     dbPath: ./data/history.db
 * ```
 */
export interface ConfigFileOptions {
	/**
	 * Maximum number of thoughts to keep in history.
	 * Can be overridden by `MAX_HISTORY_SIZE` environment variable.
	 */
	maxHistorySize?: number;

	/**
	 * Maximum number of branches to maintain.
	 * Can be overridden by `MAX_BRANCHES` environment variable.
	 */
	maxBranches?: number;

	/**
	 * Maximum size of each branch.
	 * Can be overridden by `MAX_BRANCH_SIZE` environment variable.
	 */
	maxBranchSize?: number;

	/**
	 * Logging level for the application.
	 * Can be overridden by `LOG_LEVEL` environment variable.
	 */
	logLevel?: 'debug' | 'info' | 'warn' | 'error';

	/**
	 * Whether to enable pretty (formatted) logging output.
	 * Can be overridden by `PRETTY_LOG` environment variable (set to "false" to disable).
	 */
	prettyLog?: boolean;

	/**
	 * Directory paths to search for skills.
	 * Can be overridden by `SKILL_DIRS` environment variable (colon-separated).
	 */
	skillDirs?: string[];

	/**
	 * Discovery cache configuration.
	 * Can be overridden by `DISCOVERY_CACHE_TTL` and `DISCOVERY_CACHE_MAX_SIZE` environment variables.
	 */
	discoveryCache?: {
		/**
		 * Time-to-live for cache entries in milliseconds.
		 * Environment variable `DISCOVERY_CACHE_TTL` accepts seconds.
		 */
		ttl?: number;
		/**
		 * Maximum number of entries in the cache.
		 */
		maxSize?: number;
	};

	/**
	 * Persistence configuration for storing history and state.
	 */
	persistence?: PersistenceConfig;

	/**
	 * Feature flag overrides. Each field can be set independently.
	 * Can be overridden by `TRACELATTICE_FEATURES_*` environment variables.
	 */
	features?: Partial<FeatureFlags>;

	/**
	 * TTL in milliseconds for suspended tool-interleave entries.
	 * Can be overridden by `TRACELATTICE_TOOL_INTERLEAVE_TTL_MS` environment variable.
	 */
	toolInterleaveTtlMs?: number;

	/**
	 * Sweep interval in milliseconds for SuspensionStore expiration cleanup.
	 * Can be overridden by `TRACELATTICE_TOOL_INTERLEAVE_SWEEP_MS` environment variable.
	 */
	toolInterleaveSweepMs?: number;
}

/**
 * Loads configuration from files with environment variable overrides.
 *
 * This class searches for configuration files in standard locations and applies
 * environment variable overrides. Files are searched in priority order, with the
 * first match being used. Environment variables always take precedence over file values.
 *
 * @remarks
 * **Config File Search Order (priority):**
 * 1. Custom path (if provided to constructor)
 * 2. `.claude/config.json` (project-local)
 * 3. `.claude/config.yaml` (project-local)
 * 4. `.claude/config.yml` (project-local)
 * 5. `~/.claude/config.json` (user-global)
 * 6. `~/.claude/config.yaml` (user-global)
 * 7. `~/.claude/config.yml` (user-global)
 *
 * **Environment Variable Overrides:**
 * | Variable | Type | Description |
 * |----------|------|-------------|
 * | `MAX_HISTORY_SIZE` | number | Max thoughts in history |
 * | `MAX_BRANCHES` | number | Max number of branches |
 * | `MAX_BRANCH_SIZE` | number | Max size of each branch |
 * | `LOG_LEVEL` | string | Logging level (debug/info/warn/error) |
 * | `PRETTY_LOG` | string | "false" to disable pretty logging |
 * | `SKILL_DIRS` | string | Colon-separated directory paths |
 * | `DISCOVERY_CACHE_TTL` | number | TTL in seconds (converted to ms) |
 * | `DISCOVERY_CACHE_MAX_SIZE` | number | Max cache entries |
 *
 * @example
 * ```typescript
 * // Use default search paths
 * const loader1 = new ConfigLoader();
 * const config1 = loader1.load();
 *
 * // Use custom config path
 * const loader2 = new ConfigLoader('./my-config.yaml');
 * const config2 = loader2.load();
 *
 * // Convert to ServerConfig options
 * const serverOptions = loader2.toServerConfigOptions(config2);
 * ```
 */
export class ConfigLoader {
	/** Array of config file paths to search, in priority order. */
	private _configPaths: string[];

	/**
	 * Creates a new ConfigLoader instance.
	 *
	 * @param customPath - Optional custom config file path. If provided, only this path will be checked.
	 *
	 * @example
	 * ```typescript
	 * // Use default search paths
	 * const loader1 = new ConfigLoader();
	 *
	 * // Use a specific config file
	 * const loader2 = new ConfigLoader('./custom-config.json');
	 * ```
	 */
	constructor(customPath?: string) {
		this._configPaths = customPath
			? [customPath]
			: [
					'.claude/config.json',
					'.claude/config.yaml',
					'.claude/config.yml',
					join(homedir(), '.claude/config.json'),
					join(homedir(), '.claude/config.yaml'),
					join(homedir(), '.claude/config.yml'),
				];
	}

	/**
	 * Loads configuration from files and applies environment overrides.
	 *
	 * Searches for config files in the configured paths (in priority order),
	 * parses the first match, and applies environment variable overrides.
	 * Returns null if no config file is found and no environment overrides are set.
	 *
	 * @returns The loaded configuration with environment overrides applied, or null if no config found
	 *
	 * @example
	 * ```typescript
	 * const loader = new ConfigLoader();
	 * const config = loader.load();
	 *
	 * if (config) {
	 *   console.log('Max history size:', config.maxHistorySize);
	 *   console.log('Log level:', config.logLevel);
	 * }
	 * ```
	 */
	load(): ConfigFileOptions | null {
		let config: ConfigFileOptions | null = null;

		for (const configPath of this._configPaths) {
			if (existsSync(configPath)) {
				try {
					config = this.parseConfig(configPath);
					break;
				} catch (error) {
					console.error(
						`Failed to load config from ${configPath}:`,
						getErrorMessage(error)
					);
				}
			}
		}

		return this.applyEnvironmentOverrides(config || {});
	}

	/**
	 * Applies environment variable overrides to the configuration.
	 *
	 * Environment variables take precedence over file-based configuration.
	 * Supported environment variables:
	 * - `MAX_HISTORY_SIZE`, `MAX_BRANCHES`, `MAX_BRANCH_SIZE` (numbers)
	 * - `LOG_LEVEL` (debug/info/warn/error)
	 * - `PRETTY_LOG` ("false" to disable)
	 * - `SKILL_DIRS` (colon-separated paths)
	 * - `DISCOVERY_CACHE_TTL` (in seconds, converted to ms)
	 * - `DISCOVERY_CACHE_MAX_SIZE` (number)
	 *
	 * @param config - The configuration to apply overrides to
	 * @returns A new configuration object with environment overrides applied
	 * @private
	 */
	private applyEnvironmentOverrides(config: ConfigFileOptions): ConfigFileOptions {
		const result: ConfigFileOptions = { ...config };

		if (process.env.MAX_HISTORY_SIZE) {
			const parsed = parseInt(process.env.MAX_HISTORY_SIZE, 10);
			if (Number.isFinite(parsed)) {
				result.maxHistorySize = parsed;
			}
		}
		if (process.env.MAX_BRANCHES) {
			const parsed = parseInt(process.env.MAX_BRANCHES, 10);
			if (Number.isFinite(parsed)) {
				result.maxBranches = parsed;
			}
		}
		if (process.env.MAX_BRANCH_SIZE) {
			const parsed = parseInt(process.env.MAX_BRANCH_SIZE, 10);
			if (Number.isFinite(parsed)) {
				result.maxBranchSize = parsed;
			}
		}
		if (
			process.env.LOG_LEVEL &&
			['debug', 'info', 'warn', 'error'].includes(process.env.LOG_LEVEL)
		) {
			result.logLevel = process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
		}
		if (process.env.PRETTY_LOG === 'false') {
			result.prettyLog = false;
		}
		if (process.env.SKILL_DIRS) {
			result.skillDirs = process.env.SKILL_DIRS.split(':');
		}
		if (process.env.DISCOVERY_CACHE_TTL) {
			const parsed = parseInt(process.env.DISCOVERY_CACHE_TTL, 10);
			if (Number.isFinite(parsed)) {
				result.discoveryCache = result.discoveryCache || {};
				result.discoveryCache.ttl = parsed * 1000;
			}
		}
		if (process.env.DISCOVERY_CACHE_MAX_SIZE) {
			const parsed = parseInt(process.env.DISCOVERY_CACHE_MAX_SIZE, 10);
			if (Number.isFinite(parsed)) {
				result.discoveryCache = result.discoveryCache || {};
				result.discoveryCache.maxSize = parsed;
			}
		}
		if (process.env.TRACELATTICE_TOOL_INTERLEAVE_TTL_MS) {
			const parsed = parseInt(process.env.TRACELATTICE_TOOL_INTERLEAVE_TTL_MS, 10);
			if (Number.isFinite(parsed)) {
				result.toolInterleaveTtlMs = parsed;
			}
		}
		if (process.env.TRACELATTICE_TOOL_INTERLEAVE_SWEEP_MS) {
			const parsed = parseInt(process.env.TRACELATTICE_TOOL_INTERLEAVE_SWEEP_MS, 10);
			if (Number.isFinite(parsed)) {
				result.toolInterleaveSweepMs = parsed;
			}
		}

		this.applyFeatureFlagOverrides(result);

		return result;
	}

	/**
	 * Applies TRACELATTICE_FEATURES_* environment variable overrides for feature flags.
	 * Booleans accept 'true'/'false'/'1'/'0' (case-insensitive).
	 * Invalid reasoningStrategy values are warned and ignored (fall back to default).
	 *
	 * @param result - Configuration object to mutate with feature flag overrides
	 * @private
	 */
	private applyFeatureFlagOverrides(result: ConfigFileOptions): void {
		const boolMap: Record<string, Exclude<keyof FeatureFlags, 'reasoningStrategy'>> = {
			TRACELATTICE_FEATURES_DAG_EDGES: 'dagEdges',
			TRACELATTICE_FEATURES_CALIBRATION: 'calibration',
			TRACELATTICE_FEATURES_COMPRESSION: 'compression',
			TRACELATTICE_FEATURES_TOOL_INTERLEAVE: 'toolInterleave',
			TRACELATTICE_FEATURES_NEW_THOUGHT_TYPES: 'newThoughtTypes',
			TRACELATTICE_FEATURES_OUTCOME_RECORDING: 'outcomeRecording',
		};
		for (const [envVar, key] of Object.entries(boolMap)) {
			const raw = process.env[envVar];
			if (raw === undefined) continue;
			const parsed = this.parseBoolean(raw);
			if (parsed === undefined) {
				console.warn(
					`Invalid boolean value for ${envVar}: "${raw}" (expected true/false/1/0). Ignoring.`
				);
				continue;
			}
			const features: { -readonly [K in keyof FeatureFlags]?: FeatureFlags[K] } =
				result.features ?? {};
			features[key] = parsed;
			result.features = features;
		}

		const strategyRaw = process.env.TRACELATTICE_FEATURES_REASONING_STRATEGY;
		if (strategyRaw !== undefined) {
			const allowed = ['sequential', 'tot'] as const;
			if ((allowed as readonly string[]).includes(strategyRaw)) {
				const features: { -readonly [K in keyof FeatureFlags]?: FeatureFlags[K] } =
					result.features ?? {};
				features.reasoningStrategy = strategyRaw as 'sequential' | 'tot';
				result.features = features;
			} else {
				console.warn(
					`Invalid value for TRACELATTICE_FEATURES_REASONING_STRATEGY: "${strategyRaw}" ` +
						`(expected one of ${allowed.join(', ')}). Falling back to 'sequential'.`
				);
			}
		}
	}

	/**
	 * Parses a boolean from an environment variable string.
	 * Accepts 'true'/'false'/'1'/'0' case-insensitively.
	 *
	 * @param raw - Raw environment variable string
	 * @returns Parsed boolean, or undefined if the value is invalid
	 * @private
	 */
	private parseBoolean(raw: string): boolean | undefined {
		const v = raw.trim().toLowerCase();
		if (v === 'true' || v === '1') return true;
		if (v === 'false' || v === '0') return false;
		return undefined;
	}

	/**
	 * Parses a configuration file (JSON or YAML).
	 *
	 * Detects the file type by extension and uses the appropriate parser.
	 * Supports `.json`, `.yaml`, and `.yml` file extensions.
	 *
	 * @param filePath - Path to the configuration file to parse
	 * @returns The parsed configuration object
	 * @throws {Error} If the file cannot be parsed
	 * @private
	 */
	private parseConfig(filePath: string): ConfigFileOptions {
		const content = readFileSync(filePath, 'utf-8');
		const ext = filePath.split('.').pop()?.toLowerCase();

		if (ext === 'yaml' || ext === 'yml') {
			return parseYaml(content) as ConfigFileOptions;
		}

		return JSON.parse(content) as ConfigFileOptions;
	}

	/**
	 * Converts file-based configuration to ServerConfig options.
	 *
	 * This is a convenience method for extracting the ServerConfig-relevant
	 * options from a file-based configuration.
	 *
	 * @param config - The configuration to convert
	 * @returns An object with ServerConfig-compatible options
	 *
	 * @example
	 * ```typescript
	 * const loader = new ConfigLoader();
	 * const config = loader.load();
	 * if (config) {
	 *   const serverOpts = loader.toServerConfigOptions(config);
	 *   const serverConfig = new ServerConfig(serverOpts);
	 * }
	 * ```
	 */
	toServerConfigOptions(config: ConfigFileOptions): {
		maxHistorySize?: number;
		maxBranches?: number;
		maxBranchSize?: number;
		features?: Partial<FeatureFlags>;
		toolInterleaveTtlMs?: number;
		toolInterleaveSweepMs?: number;
	} {
		return {
			maxHistorySize: config.maxHistorySize,
			maxBranches: config.maxBranches,
			maxBranchSize: config.maxBranchSize,
			features: config.features,
			toolInterleaveTtlMs: config.toolInterleaveTtlMs,
			toolInterleaveSweepMs: config.toolInterleaveSweepMs,
		};
	}
}
