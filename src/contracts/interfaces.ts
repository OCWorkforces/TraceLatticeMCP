/**
 * Shared interface contracts for dependency injection.
 *
 * This module centralizes all cross-module interface definitions so that
 * the DI container (ServiceRegistry) and other modules can depend on
 * interfaces rather than concrete implementations.
 *
 * By importing from contracts/ instead of individual module files,
 * we reduce lateral coupling and keep the dependency graph shallow.
 *
 * @module contracts
 */

// Re-export Logger from logger module (already an interface)
export type { Logger, LogLevel, LogEntry, LoggerOptions } from '../logger/StructuredLogger.js';

// Re-export IDisposable from types (already an interface)
export type { IDisposable } from '../types.js';

// Re-export PersistenceBackend from persistence (already an interface)
export type { PersistenceBackend, PersistenceConfig } from '../persistence/PersistenceBackend.js';

// Local import for use within this file
import type { PersistenceConfig as PersistenceConfigType } from '../persistence/PersistenceBackend.js';

/**
 * Metrics interface for observability.
 *
 * Defines the contract for metrics collection used across modules.
 * Implementations include the Prometheus-compatible Metrics class.
 */
export interface IMetrics {
	counter(name: string, value?: number, labels?: Record<string, string>, help?: string): void;
	gauge(name: string, value: number, labels?: Record<string, string>, help?: string): void;
	histogram(name: string, value: number, labels?: Record<string, string>, buckets?: number[]): void;
	get(name: string, labels?: Record<string, string>): number | undefined;
	inc(name: string, labels?: Record<string, string>): void;
	dec(name: string, labels?: Record<string, string>): void;
	reset(): void;
	export(): string;
}

/**
 * Discovery cache interface for caching tool/skill discovery results.
 *
 * Defines the contract for LRU+TTL caching used by registries.
 * Implementations include the DiscoveryCache class.
 *
 * @template T - The type of data being cached
 */
export interface IDiscoveryCache<T> {
	get(key: string): T[] | null;
	set(key: string, data: T[]): void;
	has(key: string): boolean;
	invalidate(key: string): void;
	clear(): void;
	dispose(): void;
	size(): number;
	getStats(): { size: number; keys: string[] };
}

/**
 * Configuration options for creating a discovery cache.
 */
export interface DiscoveryCacheOptions {
	maxSize?: number;
	ttl?: number;
	cleanupInterval?: number;
	metrics?: IMetrics;
}

/**
 * History manager interface for thought state management.
 *
 * Defines the contract for history operations used by the server
 * and other modules that need access to thought history.
 */
export interface IHistoryManager {
	getHistory(): Record<string, unknown>[];
	clear(): void;
	shutdown(): Promise<void>;
	loadFromPersistence(): Promise<void>;
	setEventEmitter(emitter: { emit(event: string, payload: unknown): boolean }): void;
}

/**
 * Thought processor interface for processing thought data.
 *
 * Defines the contract for the main processing pipeline.
 */
export interface IThoughtProcessor {
	process(input: unknown): Promise<unknown>;
}

/**
 * Server configuration interface.
 *
 * Defines the contract for server configuration used by the DI container.
 */
export interface IServerConfig {
	maxHistorySize: number;
	maxBranches: number;
	maxBranchSize: number;
	skillDirs?: string[];
	discoveryCache?: DiscoveryCacheOptions;
	persistence?: PersistenceConfigType;
	persistenceBufferSize?: number;
	persistenceFlushInterval?: number;
	persistenceMaxRetries?: number;
}

/**
 * Tool registry interface for managing MCP tools.
 *
 * Defines the contract for tool registration and discovery.
 */
export interface IToolRegistry {
	addTool(tool: unknown): void;
	getTool(name: string): unknown;
	listTools(): unknown[];
	discover(): void;
	discoverAsync(): Promise<number>;
}

/**
 * Skill registry interface for managing Claude skills.
 *
 * Defines the contract for skill registration and discovery.
 */
export interface ISkillRegistry {
	addSkill(skill: unknown): void;
	getSkill(name: string): unknown;
	listSkills(): unknown[];
	discover(): void;
	discoverAsync(): Promise<number>;
}
