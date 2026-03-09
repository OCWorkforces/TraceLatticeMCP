#!/usr/bin/env node

// adapted from https://github.com/modelcontextprotocol/servers/blob/main/src/sequentialthinking/index.ts
// for use with mcp tools

import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { StdioTransport } from '@tmcp/transport-stdio';
import * as v from 'valibot';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { SequentialThinkingSchema, SEQUENTIAL_THINKING_TOOL } from './schema.js';
import { ThoughtData } from './types.js';

// New component imports
import { HistoryManager } from './HistoryManager.js';
import { ThoughtProcessor } from './processor/ThoughtProcessor.js';
import { ThoughtFormatter } from './formatter/ThoughtFormatter.js';
import { ServerConfig } from './ServerConfig.js';
import { StructuredLogger } from './logger/StructuredLogger.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { SkillWatcher } from './watchers/SkillWatcher.js';
import { ToolWatcher } from './watchers/ToolWatcher.js';
import { Container } from './di/index.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { SkillRegistry } from './registry/SkillRegistry.js';
import { DiscoveryCache } from './cache/DiscoveryCache.js';
import { Metrics } from './metrics/metrics.impl.js';
import {
	createPersistenceBackend,
	type PersistenceBackend,
} from './persistence/PersistenceBackend.js';
import type { SseTransportOptions } from './transport/SseTransport.js';
import type { ConfigFileOptions } from './config/ConfigLoader.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const package_json = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const { name, version } = package_json;

// Handle CLI arguments
const args = process.argv.slice(2);
const shouldShowVersion = args.includes('--version') || args.includes('-v');

if (shouldShowVersion) {
	console.log(`${name} v${version}`);
	process.exit(0);
}

// Create MCP server with tmcp
const adapter = new ValibotJsonSchemaAdapter();
const server = new McpServer(
	{
		name,
		version,
		description: 'MCP server for Sequential Thinking Tools',
	},
	{
		adapter,
		capabilities: {
			tools: { listChanged: true },
		},
	}
);

interface ServerOptions {
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

export class ToolAwareSequentialThinkingServer extends EventEmitter {
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

	override on<K extends keyof ServerEvents>(event: K, listener: (payload: ServerEvents[K]) => void): this {
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
		this._container = options.container ?? this._createContainerSync(options);

		// Resolve dependencies from container
		this._logger = this._container.resolve<StructuredLogger>('Logger');
		this._historyManager = this._container.resolve<HistoryManager>('HistoryManager');
		this._thoughtProcessor = this._container.resolve<ThoughtProcessor>('ThoughtProcessor');
		this._metrics = this._container.resolve<Metrics>('Metrics');
		this._config = this._container.resolve<ServerConfig>('Config');

		// Expose managers as public properties (recommended API)
		this.history = this._historyManager;
		this.tools = this._historyManager.tools;
		this.skills = this._historyManager.skills;
		this.config = this._config;

		// Always include the sequential thinking tool
		this.tools.addTool(SEQUENTIAL_THINKING_TOOL);

		// Note: For async discovery, users should call discoverSkillsAsync() after construction
		if (options.autoDiscover !== false && !options.lazyDiscovery) {
			// Synchronous discovery has been removed - use discoverSkillsAsync() instead
			// TODO: Update to use await this.skills.discoverAsync() instead
			// For now, comment out to prevent breaking
			// this.skills.discover();
		}

		// Initialize watchers if enabled
		if (options.enableWatcher) {
			this._skillWatcher = new SkillWatcher(this._historyManager.skills);
			this._toolWatcher = new ToolWatcher(this._historyManager.tools);
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
					cache: config.discoveryCache ? new DiscoveryCache(config.discoveryCache) : undefined,
				})
		);
		container.register(
			'SkillRegistry',
			() =>
				new SkillRegistry({
					logger,
					cache: config.discoveryCache ? new DiscoveryCache(config.discoveryCache) : undefined,
					skillDirs: config.skillDirs,
					lazyDiscovery: options.lazyDiscovery,
				})
		);

		// Register HistoryManager with lazy initialization
		container.register('HistoryManager', () => {
			const cfg = container.resolve<ServerConfig>('Config');
			const log = container.resolve<StructuredLogger>('Logger');
			const pers = container.resolve('Persistence') as PersistenceBackend | null;
			const tools = container.resolve<ToolRegistry>('ToolRegistry');
			const skills = container.resolve<SkillRegistry>('SkillRegistry');
			return new HistoryManager({
				maxHistorySize: cfg.maxHistorySize,
				maxBranches: cfg.maxBranches,
				maxBranchSize: cfg.maxBranchSize,
				logger: log,
				skillDirs: cfg.skillDirs,
				discoveryCache: cfg.discoveryCache,
				lazyDiscovery: options.lazyDiscovery,
				persistence: pers,
				tools,
				skills,
			});
		});

		// Register ThoughtFormatter (can be transient)
		container.registerFactory('ThoughtFormatter', () => new ThoughtFormatter());

		// Register ThoughtProcessor
		container.register('ThoughtProcessor', () => {
			const history = container.resolve<HistoryManager>('HistoryManager');
			const formatter = container.resolve<ThoughtFormatter>('ThoughtFormatter');
			const log = container.resolve<StructuredLogger>('Logger');
			return new ThoughtProcessor(history, formatter, log);
		});

		return container;
	}

	/**
	 * Create and configure the DI container synchronously (without persistence)
	 * This is used for backward compatibility when createServer is not used.
	 */
	private _createContainerSync(options: ServerOptions): Container {
		const configLoader = new ConfigLoader();
		const fileConfig = configLoader.load();

		return ToolAwareSequentialThinkingServer._createContainerCore(options, fileConfig, null);
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
		const discovered = await this._historyManager.skills.discoverAsync();
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
		const thoughtInput = input as ThoughtData;
		this._metrics.counter('thought_requests_total', 1, {}, 'Total thought processing requests');
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

		// Close persistence backend if available
		const persistence = this._container.resolve<PersistenceBackend | null>('Persistence');
		if (persistence) {
			try {
				await persistence.close();
				this._logger.info('Persistence backend closed');
			} catch (error) {
				this._logger.error('Error closing persistence backend', {
					error: error instanceof Error ? error.message : String(error),
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
async function initializeServer(): Promise<ToolAwareSequentialThinkingServer> {
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

async function main() {
	// Initialize the server
	const thinkingServer = await initializeServer();

	server.tool(
		{
			name: 'sequentialthinking_tools',
			description: SEQUENTIAL_THINKING_TOOL.description,
			schema: SequentialThinkingSchema,
		},
		async (input) => {
			return thinkingServer.processThought(input);
		}
	);

	// Get transport type from environment variable or default to stdio
	const transportType = process.env.TRANSPORT_TYPE || 'stdio';

	if (transportType === 'sse') {
		// Use SSE transport for multi-user support
		const { SseTransport } = await import('./transport/SseTransport.js');
		const port = parseInt(process.env.SSE_PORT || '3000', 10);
		const host = process.env.SSE_HOST || 'localhost';

		const sseTransport = new SseTransport({
			port,
			host,
			corsOrigin: process.env.CORS_ORIGIN || '*',
			enableCors: process.env.ENABLE_CORS !== 'false',
			allowedHosts: process.env.ALLOWED_HOSTS?.split(',').map((hostValue) => hostValue.trim()),
		});

		// Connect the SSE transport
		await sseTransport.connect(server);

		const shutdown = async (): Promise<void> => {
			await sseTransport.stop();
			await thinkingServer.stop();
		};

		process.once('SIGINT', () => {
			shutdown()
				.then(() => process.exit(0))
				.catch(() => process.exit(1));
		});

		process.once('SIGTERM', () => {
			shutdown()
				.then(() => process.exit(0))
				.catch(() => process.exit(1));
		});

		thinkingServer['_logger'].info(
			`Sequential Thinking MCP Server running on SSE transport at http://${host}:${port}`
		);
	} else {
		// Use stdio transport (default, single-user)
		const transport = new StdioTransport(server);
		transport.listen();

		const shutdown = async (): Promise<void> => {
			const forceExit = setTimeout(() => {
				thinkingServer['_logger'].error('Graceful shutdown timed out after 30s - forcing exit');
				process.exit(1);
			}, 30_000).unref(); // 30s timeout, don't keep process alive

			try {
				await thinkingServer.stop();
				clearTimeout(forceExit);
				process.exit(0);
			} catch (error) {
				thinkingServer['_logger'].error('Error during shutdown', {
					error: error instanceof Error ? error.message : String(error),
				});
				process.exit(1);
			}
		};

		process.once('SIGINT', () => void shutdown());
		process.once('SIGTERM', () => void shutdown());

		process.once('SIGINT', shutdown);
		process.once('SIGTERM', shutdown);

		thinkingServer['_logger'].info('Sequential Thinking MCP Server running on stdio');
	}
}

main().catch((error) => {
	const logger = new StructuredLogger({
		level: 'error',
		context: 'SequentialThinking',
		pretty: true,
	});
	logger.error('Fatal error running server', {
		error: error instanceof Error ? error.message : String(error),
	});
	process.exit(1);
});
