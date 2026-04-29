import type { Logger } from '../logger/StructuredLogger.js';
import type { ServerConfig } from '../ServerConfig.js';
import type { ConfigFileOptions } from '../config/ConfigLoader.js';

import type { IDisposable } from '../types/disposable.js';
import type { ServiceKey, ServiceRegistry } from './ServiceRegistry.js';

/**
 * Lightweight dependency injection container for managing service dependencies.
 *
 * This container supports:
 * - Instance registration (singleton-like behavior)
 * - Factory registration (lazy instantiation with caching)
 * - Transient factory registration (new instance each time)
 *
 * The container is type-safe when using ServiceKey from ServiceRegistry.
 * For dynamic/unknown services, use string keys with generic type parameters.
 *
 * @example
 * ```typescript
 * const container = new Container();
 *
 * // Type-safe registration with ServiceKey (recommended)
 * container.registerInstance('Logger', new StructuredLogger());
 *
 * // Type inference works automatically
 * const logger = container.resolve('Logger');  // Type: StructuredLogger
 *
 * // Register a factory with caching (singleton per container)
 * container.register('HistoryManager', () =>
 *   new HistoryManager({ logger: container.resolve('Logger') })
 * );
 *
 * // Register a transient factory (new instance each time)
 * container.registerFactory('RequestContext', () =>
 *   new RequestContext()
 * );
 *
 * // For dynamic services not in ServiceRegistry
 * container.registerInstance<MyService>('MyService', myService);
 * const service = container.resolve<MyService>('MyService');
 * ```
 */
export class Container {
	private _services: Map<string, unknown> = new Map();
	private _factories: Map<string, () => unknown> = new Map();
	private _transientFactories: Map<string, () => unknown> = new Map();
	private _resolving: Set<string> = new Set();
	private _disposables: Map<string, IDisposable> = new Map();

	/**
	 * Register a singleton instance that will be returned for all resolutions.
	 *
	 * @param name - The unique name/identifier for the service
	 * @param instance - The instance to register
	 *
	 * @example
	 * ```typescript
	 * container.registerInstance('Config', new ServerConfig({ ... }));
	 * ```
	 */
	registerInstance<K extends ServiceKey>(name: K, instance: ServiceRegistry[K]): void;
	registerInstance<T>(name: string, instance: T): void;
	registerInstance(name: string, instance: unknown): void {
		if (
			this._services.has(name) ||
			this._factories.has(name) ||
			this._transientFactories.has(name)
		) {
			throw new Error(`Service '${name}' is already registered`);
		}
		this._services.set(name, instance);
	}

	/**
	 * Register a factory function that will be called once and cached.
	 * The first call to `resolve` will invoke the factory and cache the result.
	 * Subsequent calls will return the cached instance (singleton behavior).
	 *
	 * @param name - The unique name/identifier for the service
	 * @param factory - A factory function that creates the service
	 *
	 * @example
	 * ```typescript
	 * container.register('HistoryManager', () =>
	 *   new HistoryManager({ logger: container.resolve('Logger') })
	 * );
	 * ```
	 */
	register<K extends ServiceKey>(name: K, factory: () => ServiceRegistry[K]): void;
	register<T>(name: string, factory: () => T): void;
	register(name: string, factory: () => unknown): void {
		if (
			this._services.has(name) ||
			this._factories.has(name) ||
			this._transientFactories.has(name)
		) {
			throw new Error(`Service '${name}' is already registered`);
		}
		this._factories.set(name, factory);
	}

	/**
	 * Register a transient factory function that will be called on every resolution.
	 * Each call to `resolve` will invoke the factory and return a new instance.
	 *
	 * @param name - The unique name/identifier for the service
	 * @param factory - A factory function that creates the service
	 *
	 * @example
	 * ```typescript
	 * container.registerFactory('RequestContext', () =>
	 *   new RequestContext()
	 * );
	 * ```
	 */
	registerFactory<K extends ServiceKey>(name: K, factory: () => ServiceRegistry[K]): void;
	registerFactory<T>(name: string, factory: () => T): void;
	registerFactory(name: string, factory: () => unknown): void {
		if (
			this._services.has(name) ||
			this._factories.has(name) ||
			this._transientFactories.has(name)
		) {
			throw new Error(`Service '${name}' is already registered`);
		}
		this._transientFactories.set(name, factory);
	}

	/**
	 * Resolve a service by name.
	 *
	 * Resolution order:
	 * 1. If a registered instance exists, return it
	 * 2. If a cached factory exists, return it
	 * 3. If a factory exists, invoke it, cache the result, and return it
	 * 4. If a transient factory exists, invoke it and return a new instance
	 * 5. Throw an error if the service is not found
	 *
	 * @param name - The name/identifier of service to resolve
	 * @returns The resolved service instance
	 * @throws {Error} If the service is not registered
	 *
	 * @example
	 * ```typescript
	 * // Type-safe: ServiceRegistry provides autocomplete
	 * const logger = container.resolve('Logger');  // Type: StructuredLogger
	 * const config = container.resolve('Config');  // Type: ServerConfig
 * ```
 */
	resolve<K extends ServiceKey>(name: K): ServiceRegistry[K];
	resolve(name: string): unknown {
		if (this._resolving.has(name)) {
			throw new Error(`Circular dependency detected while resolving service: ${name}`);
		}

		this._resolving.add(name);

		try {
			// Check for registered instance first
			if (this._services.has(name)) {
				return this._services.get(name);
			}

			// Check for cached factory result
			if (this._factories.has(name)) {
				const factory = this._factories.get(name)!;
				const instance = factory();
				// Cache the result for future calls (singleton behavior)
				this._services.set(name, instance);
				this._factories.delete(name);
				return instance;
			}

			// Check for transient factory (call every time)
			if (this._transientFactories.has(name)) {
				const factory = this._transientFactories.get(name)!;
				return factory();
			}

			throw new Error(`Service not found: ${name}. Did you forget to register it?`);
		} finally {
			this._resolving.delete(name);
		}
	}

	/**
	 * Resolve a service by name with an `unknown` return type.
	 * Use this when the service key is not in ServiceRegistry.
	 *
	 * @param name - The name/identifier of the service
	 * @returns The service instance as `unknown` — caller must narrow
	 */
	resolveDynamic(name: string): unknown {
		return this.resolve(name as never);
	}

	/**
	 * Check if a service is registered (either as instance or factory).
	 *
	 * @param name - The name/identifier of the service to check
	 * @returns `true` if the service is registered, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * if (!container.has('Logger')) {
	 *   container.registerInstance('Logger', new StructuredLogger());
	 * }
	 * ```
	 */
	has(name: string): boolean {
		return (
			this._services.has(name) || this._factories.has(name) || this._transientFactories.has(name)
		);
	}

	/**
	 * Remove a registered service from the container.
	 *
	 * @param name - The name/identifier of the service to unregister
	 * @returns `true` if the service was found and removed, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * container.unregister('HistoryManager');
	 * ```
	 */
	unregister(name: string): boolean {
		const hadInstance = this._services.delete(name);
		const hadFactory = this._factories.delete(name);
		const hadTransient = this._transientFactories.delete(name);
		this._disposables.delete(name);
		return hadInstance || hadFactory || hadTransient;
	}

	/**
	 * Clear all registered services and factories from the container.
	 *
	 * @example
	 * ```typescript
	 * container.clear();
	 * ```
	 */
	clear(): void {
		this._services.clear();
		this._factories.clear();
		this._transientFactories.clear();
		this._resolving.clear();
		this._disposables.clear();
	}

	/**
	 * Get the number of registered services (including instances, factories, and transient factories).
	 *
	 * @returns The total count of registered services
	 *
	 * @example
	 * ```typescript
	 * console.log(`Registered services: ${container.size}`);
	 * ```
	 */
	get size(): number {
		return this._services.size + this._factories.size + this._transientFactories.size;
	}

	/**
	 * Get an array of all registered service names.
	 *
	 * @returns An array of service names
	 *
	 * @example
	 * ```typescript
	 * const names = container.registeredServices();
	 * console.log('Registered:', names.join(', '));
	 * ```
	 */
	registeredServices(): string[] {
		const names = new Set<string>();
		for (const name of this._services.keys()) names.add(name);
		for (const name of this._factories.keys()) names.add(name);
		for (const name of this._transientFactories.keys()) names.add(name);
		return Array.from(names);
	}

	/**
	 * Register an instance as disposable for lifecycle management.
	 * The instance will have its `dispose()` method called when the container is disposed.
	 *
	 * @param name - The service name (must already be registered)
	 * @param instance - The disposable instance to track
	 *
	 * @example
	 * ```typescript
	 * const pool = new ConnectionPool();
	 * container.registerInstance('ConnectionPool', pool);
	 * container.registerDisposable('ConnectionPool', pool);
	 * ```
	 */
	registerDisposable(name: string, instance: IDisposable): void {
		this._disposables.set(name, instance);
	}

	/**
	 * Dispose of all registered disposable services.
	 * Calls `dispose()` on each registered disposable in reverse registration order.
	 * Errors during individual disposal are caught and logged to prevent cascading failures.
	 *
	 * @example
	 * ```typescript
	 * await container.dispose();
	 * ```
	 */
	async dispose(): Promise<void> {
		const entries = Array.from(this._disposables.entries()).reverse();
		const errors: Array<{ name: string; error: unknown }> = [];

		for (const [name, disposable] of entries) {
			try {
				await disposable.dispose();
			} catch (error) {
				errors.push({ name, error });
			}
		}

		this._disposables.clear();

		if (errors.length > 0) {
			const messages = errors.map(
				(e) => `${e.name}: ${e.error instanceof Error ? e.error.message : String(e.error)}`
			);
			throw new Error(`Failed to dispose services: ${messages.join(', ')}`);
		}
	}
}

/**
 * Create a pre-configured container with all default services registered.
 *
 * This factory function creates a container with all standard services
 * for the ToolAwareSequentialThinkingServer.
 *
 * @param options - Configuration options for the container
 * @returns A configured container ready to use
 *
 * @example
 * ```typescript
 * const container = createDefaultContainer({
 *   logger: customLogger,
 *   config: customConfig
 * });
 * const server = new ToolAwareSequentialThinkingServer({ container });
 * ```
 */
export interface CreateContainerOptions {
	logger?: Logger;
	config?: ServerConfig;
	fileConfig?: ConfigFileOptions;
}

export function createDefaultContainer(options: CreateContainerOptions = {}): Container {
	const container = new Container();

	// Register logger if provided
	if (options.logger) {
		container.registerInstance('Logger', options.logger);
	}

	// Register config if provided
	if (options.config) {
		container.registerInstance('Config', options.config);
	}

	return container;
}
