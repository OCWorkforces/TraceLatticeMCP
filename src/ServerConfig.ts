import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PersistenceConfig } from './persistence/PersistenceBackend.js';

export interface ServerConfigOptions {
	maxHistorySize?: number;
	maxBranches?: number;
	maxBranchSize?: number;
	skillDirs?: string[];
	discoveryCache?: {
		ttl?: number;
		maxSize?: number;
	};
	persistence?: PersistenceConfig;
}

export class ServerConfig {
	public maxHistorySize: number;
	public maxBranches: number;
	public maxBranchSize: number;
	public skillDirs: string[];
	public discoveryCache: { ttl: number; maxSize: number };
	public persistence: PersistenceConfig;

	constructor(options: ServerConfigOptions = {}) {
		this.maxHistorySize = this.validateMaxHistorySize(options.maxHistorySize);
		this.maxBranches = this.validateMaxBranches(options.maxBranches);
		this.maxBranchSize = this.validateMaxBranchSize(options.maxBranchSize);
		this.skillDirs = this.validateSkillDirs(options.skillDirs);
		this.discoveryCache = this.validateDiscoveryCache(options.discoveryCache);
		this.persistence = this.validatePersistence(options.persistence);
	}

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

	private validateSkillDirs(value?: string[]): string[] {
		const defaultValue = ['.claude/skills', join(homedir(), '.claude/skills')];
		if (!value) return defaultValue;
		return value;
	}

	private validateDiscoveryCache(value?: { ttl?: number; maxSize?: number }): {
		ttl: number;
		maxSize: number;
	} {
		return {
			ttl: value?.ttl ?? 300000,
			maxSize: value?.maxSize ?? 100,
		};
	}

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
