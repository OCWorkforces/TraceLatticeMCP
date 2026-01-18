import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { PersistenceConfig } from '../persistence/PersistenceBackend.js';

export interface ConfigFileOptions {
	maxHistorySize?: number;
	maxBranches?: number;
	maxBranchSize?: number;
	logLevel?: 'debug' | 'info' | 'warn' | 'error';
	prettyLog?: boolean;
	skillDirs?: string[];
	discoveryCache?: {
		ttl?: number;
		maxSize?: number;
	};
	persistence?: PersistenceConfig;
}

export class ConfigLoader {
	private _configPaths: string[];

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
						error instanceof Error ? error.message : String(error)
					);
				}
			}
		}

		return this.applyEnvironmentOverrides(config || {});
	}

	private applyEnvironmentOverrides(config: ConfigFileOptions): ConfigFileOptions {
		const result: ConfigFileOptions = { ...config };

		if (process.env.MAX_HISTORY_SIZE) {
			result.maxHistorySize = parseInt(process.env.MAX_HISTORY_SIZE, 10);
		}
		if (process.env.MAX_BRANCHES) {
			result.maxBranches = parseInt(process.env.MAX_BRANCHES, 10);
		}
		if (process.env.MAX_BRANCH_SIZE) {
			result.maxBranchSize = parseInt(process.env.MAX_BRANCH_SIZE, 10);
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
			const ttl = parseInt(process.env.DISCOVERY_CACHE_TTL, 10) * 1000;
			result.discoveryCache = result.discoveryCache || {};
			result.discoveryCache.ttl = ttl;
		}
		if (process.env.DISCOVERY_CACHE_MAX_SIZE) {
			const maxSize = parseInt(process.env.DISCOVERY_CACHE_MAX_SIZE, 10);
			result.discoveryCache = result.discoveryCache || {};
			result.discoveryCache.maxSize = maxSize;
		}

		return result;
	}

	private parseConfig(filePath: string): ConfigFileOptions {
		const content = readFileSync(filePath, 'utf-8');
		const ext = filePath.split('.').pop()?.toLowerCase();

		if (ext === 'yaml' || ext === 'yml') {
			return parseYaml(content) as ConfigFileOptions;
		}

		return JSON.parse(content) as ConfigFileOptions;
	}

	toServerConfigOptions(config: ConfigFileOptions): {
		maxHistorySize?: number;
		maxBranches?: number;
		maxBranchSize?: number;
	} {
		return {
			maxHistorySize: config.maxHistorySize,
			maxBranches: config.maxBranches,
			maxBranchSize: config.maxBranchSize,
		};
	}
}
