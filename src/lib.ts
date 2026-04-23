// Library exports for tracelattice
// This module contains all public API exports with NO CLI side effects.
// For the CLI entry point, see cli.ts.

import { EventEmitter } from 'node:events';
import * as v from 'valibot';
import { ThoughtData } from './core/thought.js';
import { SEQUENTIAL_THINKING_TOOL, SequentialThinkingSchema } from './schema.js';
import { IDisposable } from './types/disposable.js';
import { getErrorMessage } from './errors.js';

// New component imports
import { DiscoveryCache } from './cache/DiscoveryCache.js';
import type { ConfigFileOptions } from './config/ConfigLoader.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { HistoryManager } from './core/HistoryManager.js';
import { EdgeStore } from './core/graph/EdgeStore.js';
import { InMemorySummaryStore } from './core/compression/InMemorySummaryStore.js';
import { CompressionService } from './core/compression/CompressionService.js';
import type { ISummaryStore } from './contracts/summary.js';
import { InMemorySuspensionStore } from './core/tools/InMemorySuspensionStore.js';
import type { ISuspensionStore } from './contracts/suspension.js';
import { ThoughtEvaluator } from './core/ThoughtEvaluator.js';
import { Calibrator } from './core/evaluator/Calibrator.js';
import { OutcomeRecorder } from './core/reasoning/OutcomeRecorder.js';
import { createReasoningStrategy } from './core/reasoning/strategies/StrategyFactory.js';
import { ThoughtFormatter } from './core/ThoughtFormatter.js';
import { ThoughtProcessor, type CallToolResult } from './core/ThoughtProcessor.js';
import { Container } from './di/Container.js';
import { StructuredLogger } from './logger/StructuredLogger.js';
import { Metrics } from './metrics/metrics.impl.js';
import type { PersistenceBackend } from './contracts/PersistenceBackend.js';
import { createPersistenceBackend } from './persistence/PersistenceFactory.js';
import { SkillRegistry } from './registry/SkillRegistry.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { ServerConfig } from './ServerConfig.js';
import type { SseTransportOptions } from './transport/SseTransport.js';
import { SkillWatcher } from './watchers/SkillWatcher.js';
import { ToolWatcher } from './watchers/ToolWatcher.js';
import type { IReasoningStrategy } from './contracts/strategy.js';

export interface ServerOptions {
	maxHistorySize?: number;
	maxBranches?: number;
	maxBranchSize?: number;
	logger?: StructuredLogger;
	enableWatcher?: boolean;
	config?: ServerConfig;
	fileConfig?: ConfigFileOptions;
	container?: Container;
	/**
	 * Enable automatic skill discovery on server startup
	 * @default true
	 */
	autoDiscover?: boolean;
	/**
	 * Enable lazy discovery (discover on first access instead of startup)
	 * @default false
	 */
	lazyDiscovery?: boolean;
	/**
	 * Load history from persistence on initialization
	 * @default true
	 */
	loadFromPersistence?: boolean;
	/**
	 * Transport type to use
	 * @default 'stdio'
	 */
	transport?: 'stdio' | 'sse';
	/**
	 * SSE transport options (used when transport: 'sse')
	 */
	sseTransportOptions?: SseTransportOptions;
}

/**
 * Server error events for event-driven error handling
 */
interface ServerEvents {
	persistenceError: { operation: string; error: Error };
	discoveryError: { directory: string; error: Error };
	transportError: { transport: string; error: Error };
	thoughtProcessed: { thoughtNumber: number; duration: number };
}

/**
 * Public API contract for the tool-aware sequential thinking server.
 *
 * Extends {@link IDisposable} for resource cleanup. Concrete implementations
 * are expected to also extend Node's `EventEmitter` to support the typed
 * `emit`/`on` overloads.
 */
export interface IToolAwareSequentialThinkingServer extends IDisposable {
	/** Direct access to the history manager. */
	readonly history: HistoryManager;

	/** Direct access to the tool registry. */
	readonly tools: ToolRegistry;

	/** Direct access to the skill registry. */
	readonly skills: SkillRegistry;

	/** Server configuration. */
	readonly config: ServerConfig;

	/**
	 * Discover skills asynchronously without blocking server startup.
	 *
	 * @returns The number of skills discovered
	 */
	discoverSkillsAsync(): Promise<number>;

	/**
	 * Get all branches from the history manager.
	 *
	 * @returns Map of branch IDs to thought arrays
	 */
	getBranches(): Record<string, ThoughtData[]>;

	/**
	 * Process a thought through the configured pipeline.
	 *
	 * @param input - Validated thought input matching the schema
	 * @returns The processing result
	 */
	processThought(input: v.InferInput<typeof SequentialThinkingSchema>): Promise<CallToolResult>;

	/**
	 * Export the current Prometheus metrics snapshot.
	 */
	getMetricsSnapshot(): string;

	/**
	 * Get the DI container used by this server.
	 * Useful for testing and advanced customizations.
	 */
	getContainer(): Container;

	/**
	 * Stop the server and clean up watchers, suspension stores, and persistence.
	 */
	stop(): Promise<void>;

	/**
	 * Clear all server state (history, tools, skills).
	 */
	clear(): void;

	/**
	 * Dispose of the server and all container services.
	 */
	dispose(): Promise<void>;
}

export class ToolAwareSequentialThinkingServer extends EventEmitter implements IToolAwareSequentialThinkingServer {
	/**
	 * Factory method to create a new server instance with async initialization.
	 * This is the recommended way to create server instances.
	 *
	 * @param options - Server configuration options
	 * @returns A Promise that resolves to a configured server instance
	 */
	static async create(options: ServerOptions = {}): Promise<ToolAwareSequentialThinkingServer> {
		// Create the async container first
		const container = await ToolAwareSequentialThinkingServer._createContainerAsyncStatic(options);

		// Create a minimal server with the container
		const server = new ToolAwareSequentialThinkingServer({
			...options,
			container,
		});

		// Load from persistence if enabled (default: true)
		if (options.loadFromPersistence !== false) {
			await server.history.loadFromPersistence();
		}

		// Perform async discovery if enabled (default: true)
		if (options.autoDiscover !== false) {
			await server.discoverSkillsAsync();
		}

		return server;
	}

	// Type-safe event emission
	override emit<K extends keyof ServerEvents>(event: K, payload: ServerEvents[K]): boolean {
		return super.emit(event, payload);
	}

	override on<K extends keyof ServerEvents>(
		event: K,
		listener: (payload: ServerEvents[K]) => void
	): this {
		return super.on(event, listener);
	}

	// DI Container for managing dependencies
	private _container: Container;

	// Component instances (private)
	private _logger: StructuredLogger;
	private _historyManager: HistoryManager;
	private _thoughtProcessor: ThoughtProcessor;
	private _metrics: Metrics;
	private _skillWatcher: SkillWatcher | null = null;
	private _toolWatcher: ToolWatcher | null = null;
	private _config: ServerConfig;

	// Public manager properties (recommended API)
	/**
	 * Direct access to the history manager
	 * @example
	 * ```typescript
	 * server.history.getHistory();
	 * server.history.clear();
	 * ```
	 */
	public readonly history: HistoryManager;

	/**
	 * Direct access to the tool registry
	 * @example
	 * ```typescript
	 * server.tools.addTool(tool);
	 * server.tools.getTool('my-tool');
	 * ```
	 */
	public readonly tools: ToolRegistry;

	/**
	 * Direct access to the skill registry
	 * @example
	 * ```typescript
	 * server.skills.addSkill(skill);
	 * server.skills.getSkill('my-skill');
	 * ```
	 */
	public readonly skills: SkillRegistry;

	/**
	 * Server configuration
	 * @example
	 * ```typescript
	 * console.log(server.config.maxHistorySize);
	 * ```
	 */
	public readonly config: ServerConfig;

	constructor(options: ServerOptions = {}) {
		// Use provided container or create a new one
		super();
		if (!options.container) {
			throw new Error('Container is required. Use createServer() or provide a container.');
		}
		this._container = options.container;

		// Resolve dependencies from container
		this._logger = this._container.resolve<StructuredLogger>('Logger');
		this._historyManager = this._container.resolve<HistoryManager>('HistoryManager');
		this._thoughtProcessor = this._container.resolve<ThoughtProcessor>('ThoughtProcessor');
		this._metrics = this._container.resolve<Metrics>('Metrics');
		this._config = this._container.resolve<ServerConfig>('Config');

		// Expose managers as public properties (recommended API)
		this.history = this._historyManager;

		// Wire up persistence error event emitter
		this._historyManager.setEventEmitter(this);
		this.tools = this._container.resolve<ToolRegistry>('ToolRegistry');
		this.skills = this._container.resolve<SkillRegistry>('SkillRegistry');
		this.config = this._config;

		// Always include the sequential thinking tool
		this.tools.addTool(SEQUENTIAL_THINKING_TOOL);


		// Initialize watchers if enabled
		if (options.enableWatcher) {
			this._skillWatcher = new SkillWatcher(this.skills);
			this._toolWatcher = new ToolWatcher(this.tools);
		}
	}

	/**
	 * Shared core logic for container creation.
	 * This method contains all common initialization logic between sync and async paths.
	 */
	private static _createContainerCore(
		options: ServerOptions,
		fileConfig: ConfigFileOptions | null,
		persistence: PersistenceBackend | null
	): Container {
		const container = new Container();
		const metrics = new Metrics({
			prefix: 'sequentialthinking',
		});

		// Initialize config with file defaults overridden by constructor options
		const config = new ServerConfig({
			maxHistorySize: options.maxHistorySize ?? fileConfig?.maxHistorySize,
			maxBranches: options.maxBranches ?? fileConfig?.maxBranches,
			maxBranchSize: options.maxBranchSize ?? fileConfig?.maxBranchSize,
			skillDirs: fileConfig?.skillDirs,
			discoveryCache: fileConfig?.discoveryCache,
			persistence: fileConfig?.persistence,
		});

		// Initialize logger
		const logger =
			options.logger ??
			new StructuredLogger({
				level: fileConfig?.logLevel ?? 'info',
				context: 'SequentialThinking',
				pretty: fileConfig?.prettyLog ?? true,
			});

		// Register all services in the container
		container.registerInstance('Logger', logger);
		container.registerInstance('Config', config);
		container.registerInstance('FileConfig', fileConfig || {});
		container.registerInstance('Persistence', persistence);
		container.registerInstance('Metrics', metrics);
		container.register(
			'ToolRegistry',
			() =>
				new ToolRegistry({
					logger,
					cache: config.discoveryCache
						? new DiscoveryCache({ ...config.discoveryCache, metrics })
						: undefined,
				})
		);
		container.register(
			'SkillRegistry',
			() =>
				new SkillRegistry({
					logger,
					cache: config.discoveryCache
						? new DiscoveryCache({ ...config.discoveryCache, metrics })
						: undefined,
					skillDirs: config.skillDirs,
					lazyDiscovery: options.lazyDiscovery,
				})
		);

		// Register EdgeStore as a lazy singleton (always registered; flag gates writes)
		container.register('EdgeStore', () => new EdgeStore());

		// Register SummaryStore as a lazy singleton (always registered; flag gates writes)
		container.register('summaryStore', () => new InMemorySummaryStore());

		// Register SuspensionStore as a lazy singleton (only when toolInterleave flag is on)
		if (config.features.toolInterleave) {
			container.register('suspensionStore', () => {
				const store = new InMemorySuspensionStore({
					ttlMs: config.toolInterleaveTtlMs,
					sweepIntervalMs: config.toolInterleaveSweepMs,
					logger,
				});
				store.start();
				return store;
			});
		}

		// Register CompressionService as a lazy singleton (always registered; flag gates invocation)
		container.register('compressionService', () => {
			const historyManager = container.resolve<HistoryManager>('HistoryManager');
			const edgeStore = container.resolve<EdgeStore>('EdgeStore');
			const summaryStore = container.resolve<ISummaryStore>('summaryStore');
			const log = container.resolve<StructuredLogger>('Logger');
			return new CompressionService({ historyManager, edgeStore, summaryStore, logger: log });
		});

		// Register ReasoningStrategy as a lazy singleton (selected via feature flag)
		container.register('reasoningStrategy', () =>
			createReasoningStrategy(config.features.reasoningStrategy),
		);

		// Register HistoryManager with lazy initialization
		container.register('HistoryManager', () => {
			const cfg = container.resolve<ServerConfig>('Config');
			const log = container.resolve<StructuredLogger>('Logger');
			const pers = container.resolve('Persistence') as PersistenceBackend | null;
			const componentMetrics = container.resolve<Metrics>('Metrics');
			const edgeStore = container.resolve<EdgeStore>('EdgeStore');
			return new HistoryManager({
				maxHistorySize: cfg.maxHistorySize,
				maxBranches: cfg.maxBranches,
				maxBranchSize: cfg.maxBranchSize,
				logger: log,
				persistence: pers,
				metrics: componentMetrics,
				persistenceBufferSize: cfg.persistenceBufferSize,
				persistenceFlushInterval: cfg.persistenceFlushInterval,
				persistenceMaxRetries: cfg.persistenceMaxRetries,
				edgeStore,
			});
		});

		// Register ThoughtFormatter (can be transient)
		container.registerFactory('ThoughtFormatter', () => new ThoughtFormatter());

		// Register OutcomeRecorder as a lazy singleton (gated by feature flag)
		container.register(
			'outcomeRecorder',
			() => new OutcomeRecorder({ enabled: config.features.outcomeRecording ?? false }),
		);

		// Register Calibrator as a lazy singleton (gated by feature flag)
		container.register(
			'calibrator',
			() =>
				new Calibrator(
					container.resolve('outcomeRecorder'),
					config.features.calibration ?? false,
				),
		);

		// Register ThoughtEvaluator (stateless, transient) with injected calibrator
		container.registerFactory(
			'ThoughtEvaluator',
			() => new ThoughtEvaluator(container.resolve('calibrator')),
		);

		// Register ThoughtProcessor
		container.register('ThoughtProcessor', () => {
			const history = container.resolve<HistoryManager>('HistoryManager');
			const formatter = container.resolve<ThoughtFormatter>('ThoughtFormatter');
			const evaluator = container.resolve<ThoughtEvaluator>('ThoughtEvaluator');
			const log = container.resolve<StructuredLogger>('Logger');
			const strategy = container.resolve<IReasoningStrategy>('reasoningStrategy');
			const compressionService = config.features.compression
				? container.resolve<CompressionService>('compressionService')
				: undefined;
			const suspensionStore = config.features.toolInterleave
				? container.resolve<ISuspensionStore>('suspensionStore')
				: undefined;
			return new ThoughtProcessor(
				history,
				formatter,
				evaluator,
				log,
				strategy,
				compressionService,
				suspensionStore,
				config.features,
			);
		});

		return container;
	}


	/**
	 * Create and configure the DI container with async persistence initialization.
	 * This is used internally by the static create() factory.
	 */
	private static async _createContainerAsyncStatic(options: ServerOptions): Promise<Container> {
		const configLoader = new ConfigLoader();
		const fileConfig = configLoader.load();

		// Initialize persistence backend (async)
		const persistence = await createPersistenceBackend(
			fileConfig?.persistence ?? { enabled: false }
		);

		return ToolAwareSequentialThinkingServer._createContainerCore(options, fileConfig, persistence);
	}

	/**
	 * Get the DI container used by this server
	 * Useful for testing and advanced customizations
	 */
	public getContainer(): Container {
		return this._container;
	}

	/**
	 * Discover skills asynchronously without blocking server startup.
	 * This is the recommended method for skill discovery.
	 * @returns Promise<number> - The number of skills discovered
	 */
	public async discoverSkillsAsync(): Promise<number> {
		const discovered = await this.skills.discoverAsync();
		return discovered;
	}

	/**
	 * Get all branches from the history manager
	 * @returns Record<string, ThoughtData[]> - Map of branch IDs to thought arrays
	 */
	public getBranches(): Record<string, ThoughtData[]> {
		return this._historyManager.getBranches();
	}

	// Main processing method - delegate to ThoughtProcessor
	public async processThought(input: v.InferInput<typeof SequentialThinkingSchema>) {
		const startTime = Date.now();
		const thoughtInput = input as ThoughtData & { register_branch_id?: string };
		if (typeof thoughtInput.register_branch_id === 'string' && thoughtInput.register_branch_id.length > 0) {
			try {
				this._historyManager.registerBranch(
					thoughtInput.session_id,
					thoughtInput.register_branch_id
				);
			} catch (err) {
				this._logger.warn('registerBranch skipped', {
					branch_id: thoughtInput.register_branch_id,
					error: err instanceof Error ? err.message : String(err),
				});
			}
			delete thoughtInput.register_branch_id;
		}
		const result = await this._thoughtProcessor.process(thoughtInput);
		const durationSeconds = (Date.now() - startTime) / 1000;
		this._metrics.histogram('thought_processing_duration_seconds', durationSeconds, {});
		return result;
	}

	public getMetricsSnapshot(): string {
		return this._metrics.export();
	}

	/**
	 * Stop the server and clean up watchers.
	 * Closes persistence backend gracefully to ensure data is flushed.
	 */
	public async stop(): Promise<void> {
		this._skillWatcher?.stop();
		this._toolWatcher?.stop();

		// Stop suspension store sweeper if registered
		if (this._config.features.toolInterleave && this._container.has('suspensionStore')) {
			try {
				const suspensionStore = this._container.resolve<ISuspensionStore>('suspensionStore');
				suspensionStore.stop();
			} catch (error) {
				this._logger.error('Error stopping suspension store', {
					error: getErrorMessage(error),
				});
			}
		}

		// Flush any buffered writes before closing persistence
		try {
			await this._historyManager.shutdown();
		} catch (error) {
			this._logger.error('Error flushing write buffer during shutdown', {
				error: getErrorMessage(error),
			});
		}

		// Close persistence backend if available
		const persistence = this._container.resolve<PersistenceBackend | null>('Persistence');
		if (persistence) {
			try {
				await persistence.close();
				this._logger.info('Persistence backend closed');
			} catch (error) {
				this._logger.error('Error closing persistence backend', {
					error: getErrorMessage(error),
				});
			}
		}

		this._logger.info('Server stopped, watchers cleaned up');
	}

	/**
	 * Clear all server state (history, tools, skills)
	 * Useful for testing to reset state between tests
	 */
	public clear(): void {
		this._historyManager.clear();
		this._logger.info('Server state cleared');
	}

	/**
	 * Dispose of the server and all container services.
	 * Implements the IDisposable interface.
	 * Calls stop() for existing cleanup, then disposes the DI container.
	 */
	public async dispose(): Promise<void> {
		await this.stop();
		await this._container.dispose();
		this._logger.info('Server disposed, all resources released');
	}
}

/**
 * Factory function to create a new server instance with async initialization.
 *
 * This is the recommended way to create server instances, especially for testing,
 * as it allows for proper async initialization, dependency injection, and persistence.
 *
 * @param options - Server configuration options
 * @returns A Promise that resolves to a configured server instance
 *
 * @example
 * ```typescript
 * // Basic usage (with async discovery and persistence)
 * const server = await createServer();
 *
 * // With custom options
 * const server = await createServer({
 *   autoDiscover: false,
 *   lazyDiscovery: true,
 *   maxHistorySize: 500,
 *   loadFromPersistence: true
 * });
 *
 * // With custom container for testing
 * const mockContainer = new Container();
 * mockContainer.registerInstance('Logger', mockLogger);
 * const server = await createServer({ container: mockContainer });
 * ```
 */
export async function createServer(
	options: ServerOptions = {}
): Promise<ToolAwareSequentialThinkingServer> {
	return ToolAwareSequentialThinkingServer.create(options);
}

// Initialize server
export async function initializeServer(): Promise<ToolAwareSequentialThinkingServer> {
	// Create logger for initialization
	const configLoader = new ConfigLoader();
	const fileConfig = configLoader.load();

	const logger = new StructuredLogger({
		level: fileConfig?.logLevel ?? 'info',
		context: 'SequentialThinking',
		pretty: fileConfig?.prettyLog ?? true,
	});

	// Create server instance
	const thinkingServer = await createServer({
		logger,
		enableWatcher: true,
	});

	logger.info('Server initialized successfully');
	return thinkingServer;
}
