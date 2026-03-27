/**
 * Contracts module — shared interface definitions for DI and cross-module dependencies.
 *
 * All modules that need to reference other modules' interfaces should import
 * from here instead of directly from the implementation module.
 *
 * @module contracts
 */

export {
	type Logger,
	type LogLevel,
	type LogEntry,
	type LoggerOptions,
	type IDisposable,
	type PersistenceBackend,
	type PersistenceConfig,
	type IMetrics,
	type IDiscoveryCache,
	type DiscoveryCacheOptions,
	type IHistoryManager,
	type IThoughtProcessor,
	type IServerConfig,
	type IToolRegistry,
	type ISkillRegistry,
} from './interfaces.js';
