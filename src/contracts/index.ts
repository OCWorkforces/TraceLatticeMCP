/**
 * Contracts module — shared interface definitions for DI and cross-module dependencies.
 *
 * All modules that need to reference other modules' interfaces should import
 * from here instead of directly from the implementation module.
 *
 * @module contracts
 */

export {
	type DiscoveryCacheOptions,
	type IDiscoveryCache,
	type IMetrics,
	type IServerConfig,
	type ISkillRegistry,
	type IThoughtProcessor,
	type IToolRegistry,
} from './interfaces.js';

