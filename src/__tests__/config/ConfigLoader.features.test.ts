import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
	readFileSync: vi.fn(),
	existsSync: vi.fn(),
}));
vi.mock('node:os', () => ({
	homedir: vi.fn(() => '/home/testuser'),
}));

import { readFileSync, existsSync } from 'node:fs';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { ServerConfig } from '../../ServerConfig.js';

const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;

const FEATURE_ENV_VARS = [
	'TRACELATTICE_FEATURES_DAG_EDGES',
	'TRACELATTICE_FEATURES_REASONING_STRATEGY',
	'TRACELATTICE_FEATURES_CALIBRATION',
	'TRACELATTICE_FEATURES_COMPRESSION',
	'TRACELATTICE_FEATURES_TOOL_INTERLEAVE',
	'TRACELATTICE_FEATURES_NEW_THOUGHT_TYPES',
	'TRACELATTICE_FEATURES_OUTCOME_RECORDING',
];

describe('ConfigLoader feature flags', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockExistsSync.mockReturnValue(false);
		mockReadFileSync.mockImplementation(() => '');
		for (const v of FEATURE_ENV_VARS) delete process.env[v];
	});

	afterEach(() => {
		for (const v of FEATURE_ENV_VARS) delete process.env[v];
		vi.restoreAllMocks();
	});

	it('defaults all feature flags to OFF when no env vars or file set them', () => {
		const loader = new ConfigLoader();
		const loaded = loader.load();
		const opts = loader.toServerConfigOptions(loaded ?? {});
		const config = new ServerConfig(opts);

		expect(config.features.dagEdges).toBe(false);
		expect(config.features.calibration).toBe(false);
		expect(config.features.compression).toBe(false);
		expect(config.features.toolInterleave).toBe(false);
		expect(config.features.newThoughtTypes).toBe(false);
		expect(config.features.outcomeRecording).toBe(false);
		expect(config.features.reasoningStrategy).toBe('sequential');
	});

	it('TRACELATTICE_FEATURES_DAG_EDGES=true enables dagEdges', () => {
		process.env.TRACELATTICE_FEATURES_DAG_EDGES = 'true';
		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.dagEdges).toBe(true);
		// Other flags remain off.
		expect(config.features.calibration).toBe(false);
	});

	it('TRACELATTICE_FEATURES_REASONING_STRATEGY=tot sets reasoningStrategy', () => {
		process.env.TRACELATTICE_FEATURES_REASONING_STRATEGY = 'tot';
		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.reasoningStrategy).toBe('tot');
	});

	it('invalid reasoningStrategy value falls back to sequential and warns', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		process.env.TRACELATTICE_FEATURES_REASONING_STRATEGY = 'bogus';

		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.reasoningStrategy).toBe('sequential');
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('TRACELATTICE_FEATURES_REASONING_STRATEGY')
		);
	});

	it('all boolean feature flags respond to env vars', () => {
		process.env.TRACELATTICE_FEATURES_DAG_EDGES = 'true';
		process.env.TRACELATTICE_FEATURES_CALIBRATION = '1';
		process.env.TRACELATTICE_FEATURES_COMPRESSION = 'true';
		process.env.TRACELATTICE_FEATURES_TOOL_INTERLEAVE = 'TRUE';
		process.env.TRACELATTICE_FEATURES_NEW_THOUGHT_TYPES = '1';
		process.env.TRACELATTICE_FEATURES_OUTCOME_RECORDING = 'true';

		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.dagEdges).toBe(true);
		expect(config.features.calibration).toBe(true);
		expect(config.features.compression).toBe(true);
		expect(config.features.toolInterleave).toBe(true);
		expect(config.features.newThoughtTypes).toBe(true);
		expect(config.features.outcomeRecording).toBe(true);
	});

	it('boolean flags also accept false / 0 to disable', () => {
		// File enables; env disables — env wins.
		mockExistsSync.mockImplementation((path: string) => path === '.claude/config.json');
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				features: { dagEdges: true, compression: true },
			})
		);
		process.env.TRACELATTICE_FEATURES_DAG_EDGES = 'false';
		process.env.TRACELATTICE_FEATURES_COMPRESSION = '0';

		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.dagEdges).toBe(false);
		expect(config.features.compression).toBe(false);
	});

	it('invalid boolean values are warned and ignored (default OFF preserved)', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		process.env.TRACELATTICE_FEATURES_DAG_EDGES = 'maybe';

		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.dagEdges).toBe(false);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('TRACELATTICE_FEATURES_DAG_EDGES')
		);
	});

	it('feature flags from JSON config file merge with env var overrides (env wins)', () => {
		mockExistsSync.mockImplementation((path: string) => path === '.claude/config.json');
		mockReadFileSync.mockReturnValue(
			JSON.stringify({
				features: {
					dagEdges: true,
					reasoningStrategy: 'tot',
					calibration: true,
				},
			})
		);
		// Env overrides one boolean and the strategy; calibration stays true from file.
		process.env.TRACELATTICE_FEATURES_DAG_EDGES = 'false';
		process.env.TRACELATTICE_FEATURES_REASONING_STRATEGY = 'tot';

		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.dagEdges).toBe(false); // env wins
		expect(config.features.reasoningStrategy).toBe('tot'); // env wins
		expect(config.features.calibration).toBe(true); // from file
		expect(config.features.compression).toBe(false); // default
	});

	it('feature flags from YAML config file are loaded', () => {
		mockExistsSync.mockImplementation((path: string) => path === '.claude/config.yaml');
		mockReadFileSync.mockReturnValue(
			[
				'features:',
				'  dagEdges: true',
				'  reasoningStrategy: tot',
				'  outcomeRecording: true',
			].join('\n')
		);

		const loader = new ConfigLoader();
		const loaded = loader.load();
		const config = new ServerConfig(loader.toServerConfigOptions(loaded ?? {}));

		expect(config.features.dagEdges).toBe(true);
		expect(config.features.reasoningStrategy).toBe('tot');
		expect(config.features.outcomeRecording).toBe(true);
		expect(config.features.calibration).toBe(false);
	});

	it('toJSON includes the features field', () => {
		const config = new ServerConfig({ features: { dagEdges: true } });
		const json = config.toJSON();
		expect(json.features).toEqual({
			dagEdges: true,
			reasoningStrategy: 'sequential',
			calibration: false,
			compression: false,
			toolInterleave: false,
			newThoughtTypes: false,
			outcomeRecording: false,
		});
	});
});
