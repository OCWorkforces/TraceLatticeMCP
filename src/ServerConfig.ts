export interface ServerConfigOptions {
	maxHistorySize?: number;
	maxBranches?: number;
	maxBranchSize?: number;
}

/**
 * ServerConfig validates and provides configuration for the sequential thinking server.
 * Ensures configuration values are within acceptable ranges.
 */
export class ServerConfig {
	public maxHistorySize: number;
	public maxBranches: number;
	public maxBranchSize: number;

	constructor(options: ServerConfigOptions = {}) {
		this.maxHistorySize = this.validateMaxHistorySize(options.maxHistorySize);
		this.maxBranches = this.validateMaxBranches(options.maxBranches);
		this.maxBranchSize = this.validateMaxBranchSize(options.maxBranchSize);
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

	public toJSON(): ServerConfigOptions {
		return {
			maxHistorySize: this.maxHistorySize,
			maxBranches: this.maxBranches,
			maxBranchSize: this.maxBranchSize,
		};
	}
}
