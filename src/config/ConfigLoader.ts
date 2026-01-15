/**
 * Configuration file loader supporting JSON and YAML formats.
 * Searches for config files in project-local and user-global directories.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';

export interface ConfigFileOptions {
	maxHistorySize?: number;
	maxBranches?: number;
	maxBranchSize?: number;
	logLevel?: 'debug' | 'info' | 'warn' | 'error';
	prettyLog?: boolean;
	skillDirs?: string[];
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

	/**
	 * Load configuration from the first available config file.
	 * Returns null if no config file is found.
	 */
	load(): ConfigFileOptions | null {
		for (const configPath of this._configPaths) {
			if (existsSync(configPath)) {
				try {
					return this.parseConfig(configPath);
				} catch (error) {
					console.error(`Failed to load config from ${configPath}:`, error instanceof Error ? error.message : String(error));
				}
			}
		}
		return null; // No config file found
	}

	/**
	 * Parse configuration file based on its extension.
	 */
	private parseConfig(filePath: string): ConfigFileOptions {
		const content = readFileSync(filePath, 'utf-8');
		const ext = filePath.split('.').pop()?.toLowerCase();

		if (ext === 'yaml' || ext === 'yml') {
			return parseYaml(content) as ConfigFileOptions;
		}

		// Default to JSON
		return JSON.parse(content) as ConfigFileOptions;
	}

	/**
	 * Convert config file options to ServerConfig options format.
	 */
	toServerConfigOptions(config: ConfigFileOptions): { maxHistorySize?: number; maxBranches?: number; maxBranchSize?: number } {
		return {
			maxHistorySize: config.maxHistorySize,
			maxBranches: config.maxBranches,
			maxBranchSize: config.maxBranchSize,
		};
	}
}
