import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container, createDefaultContainer } from '../di/Container.js';
import type { Logger, LogLevel } from '../logger/StructuredLogger.js';
import { ServerConfig } from '../ServerConfig.js';

// Test classes and interfaces
interface ILogger {
	log(message: string): void;
}

class ConsoleLogger implements ILogger, Logger {
	constructor(public prefix: string = '') {}

	log(message: string): void {
		console.log(`${this.prefix}${message}`);
	}

	debug(message: string, _meta?: Record<string, unknown>): void { this.log(message); }
	info(message: string, _meta?: Record<string, unknown>): void { this.log(message); }
	warn(message: string, _meta?: Record<string, unknown>): void { this.log(message); }
	error(message: string, _meta?: Record<string, unknown>): void { this.log(message); }
	setLevel(_level: LogLevel): void {}
	getLevel(): LogLevel { return 'info'; }
	createChild(context: string): Logger { return new ConsoleLogger(`${this.prefix}${context}:`); }
	async flush(): Promise<void> {}
}

interface IConfig {
	get(key: string): unknown;
}

class TestConfig implements IConfig {
	constructor(private data: Record<string, unknown>) {}

	get(key: string): unknown {
		return this.data[key];
	}
}

class ServiceWithDependencies {
	constructor(
		public logger: ILogger,
		public config: IConfig
	) {}
}

describe('Container', () => {
	let container: Container;

	beforeEach(() => {
		container = new Container();
	});

	describe('Instance Registration', () => {
		it('should register and resolve an instance', () => {
			const logger = new ConsoleLogger('[TEST] ');
			container.registerInstance('Logger', logger);

			const resolved = container.resolve('Logger') as unknown as ConsoleLogger;

			expect(resolved).toBe(logger);
			expect(resolved.prefix).toBe('[TEST] ');
		});

		it('should return the same instance on multiple resolves', () => {
			const logger = new ConsoleLogger('[TEST] ');
			container.registerInstance('Logger', logger);

			const first = container.resolve('Logger') as unknown as ConsoleLogger;
			const second = container.resolve('Logger') as unknown as ConsoleLogger;

			expect(first).toBe(second);
			expect(first).toBe(logger);
		});
	});

	describe('Factory Registration (Singleton)', () => {
		it('should register and resolve a factory', () => {
			container.register('Logger', () => new ConsoleLogger('[FACTORY] '));

			const resolved = container.resolve('Logger') as unknown as ConsoleLogger;

			expect(resolved).toBeInstanceOf(ConsoleLogger);
			expect(resolved.prefix).toBe('[FACTORY] ');
		});

		it('should cache factory result (singleton behavior)', () => {
			let callCount = 0;
			container.register('Logger', () => {
				callCount++;
				return new ConsoleLogger(`[CALL-${callCount}] `);
			});

			const first = container.resolve('Logger') as unknown as ConsoleLogger;
			const second = container.resolve('Logger') as unknown as ConsoleLogger;

			expect(callCount).toBe(1);
			expect(first).toBe(second);
			expect(first.prefix).toBe('[CALL-1] ');
		});

		it('should resolve dependencies from container', () => {
			const logger = new ConsoleLogger('[DEP] ');
			container.registerInstance('Logger', logger);

			container.register('Service', () => {
				const resolvedLogger = container.resolve('Logger') as unknown as ConsoleLogger;
				return new ServiceWithDependencies(resolvedLogger, new TestConfig({ key: 'value' }));
			});

			const service = (container.resolveDynamic('Service') as ServiceWithDependencies);

			expect(service).toBeInstanceOf(ServiceWithDependencies);
			expect(service.logger).toBe(logger);
			expect(service.config.get('key')).toBe('value');
		});
	});

	describe('Transient Factory Registration', () => {
		it('should create new instance on each resolve', () => {
			container.registerFactory('Logger', () => new ConsoleLogger('[TRANSIENT] '));

			const first = container.resolve('Logger') as unknown as ConsoleLogger;
			const second = container.resolve('Logger') as unknown as ConsoleLogger;

			expect(first).not.toBe(second);
			expect(first).toBeInstanceOf(ConsoleLogger);
			expect(second).toBeInstanceOf(ConsoleLogger);
		});

		it('should call factory on every resolve', () => {
			let callCount = 0;
			container.registerFactory('Counter', () => {
				callCount++;
				return { count: callCount };
			});

			const first = container.resolveDynamic('Counter') as { count: number };
			const second = container.resolveDynamic('Counter') as { count: number };
			const third = container.resolveDynamic('Counter') as { count: number };

			expect(first.count).toBe(1);
			expect(second.count).toBe(2);
			expect(third.count).toBe(3);
			expect(callCount).toBe(3);
		});
	});

	describe('Duplicate Registration', () => {
		it('should throw error when registering duplicate instance', () => {
			container.registerInstance('Logger', new ConsoleLogger());

			expect(() => {
				container.registerInstance('Logger', new ConsoleLogger());
			}).toThrow("Service 'Logger' is already registered");
		});

		it('should throw error when registering duplicate factory', () => {
			container.register('Logger', () => new ConsoleLogger());

			expect(() => {
				container.register('Logger', () => new ConsoleLogger());
			}).toThrow("Service 'Logger' is already registered");
		});

		it('should throw error when registering duplicate transient factory', () => {
			container.registerFactory('Logger', () => new ConsoleLogger());

			expect(() => {
				container.registerFactory('Logger', () => new ConsoleLogger());
			}).toThrow("Service 'Logger' is already registered");
		});

		it('should throw error when mixing registration types', () => {
			container.registerInstance('Logger', new ConsoleLogger());

			expect(() => {
				container.register('Logger', () => new ConsoleLogger());
			}).toThrow("Service 'Logger' is already registered");

			expect(() => {
				container.registerFactory('Logger', () => new ConsoleLogger());
			}).toThrow("Service 'Logger' is already registered");
		});
	});

	describe('Service Not Found', () => {
		it('should throw error when resolving unregistered service', () => {
			expect(() => {
				container.resolveDynamic('NonExistent');
			}).toThrow('Service not found: NonExistent');
		});

		it('should include helpful message in error', () => {
			expect(() => {
				container.resolveDynamic('MyService');
			}).toThrow('Service not found: MyService. Did you forget to register it?');
		});
	});

	describe('has() method', () => {
		it('should return true for registered instance', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			expect(container.has('Logger')).toBe(true);
		});

		it('should return true for registered factory', () => {
			container.register('Logger', () => new ConsoleLogger());
			expect(container.has('Logger')).toBe(true);
		});

		it('should return true for registered transient factory', () => {
			container.registerFactory('Logger', () => new ConsoleLogger());
			expect(container.has('Logger')).toBe(true);
		});

		it('should return false for unregistered service', () => {
			expect(container.has('NonExistent')).toBe(false);
		});

		it('should return true after factory is resolved (cached)', () => {
			container.register('Logger', () => new ConsoleLogger());
			container.resolve('Logger') as unknown as ConsoleLogger;
			expect(container.has('Logger')).toBe(true);
		});
	});

	describe('unregister() method', () => {
		it('should remove registered instance', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			expect(container.has('Logger')).toBe(true);

			const result = container.unregister('Logger');

			expect(result).toBe(true);
			expect(container.has('Logger')).toBe(false);
		});

		it('should remove registered factory', () => {
			container.register('Logger', () => new ConsoleLogger());
			expect(container.has('Logger')).toBe(true);

			const result = container.unregister('Logger');

			expect(result).toBe(true);
			expect(container.has('Logger')).toBe(false);
		});

		it('should remove registered transient factory', () => {
			container.registerFactory('Logger', () => new ConsoleLogger());
			expect(container.has('Logger')).toBe(true);

			const result = container.unregister('Logger');

			expect(result).toBe(true);
			expect(container.has('Logger')).toBe(false);
		});

		it('should return false when unregistering non-existent service', () => {
			const result = container.unregister('NonExistent');
			expect(result).toBe(false);
		});

		it('should allow re-registration after unregister', () => {
			container.registerInstance('Logger', new ConsoleLogger('first'));
			container.unregister('Logger');

			// Should not throw
			container.registerInstance('Logger', new ConsoleLogger('second'));

			const resolved = container.resolve('Logger') as unknown as ConsoleLogger;
			expect(resolved.prefix).toBe('second');
		});
	});

	describe('clear() method', () => {
		it('should remove all registered services', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.register('Config', () => new TestConfig({}));
			container.registerFactory(
				'Service',
				() => new ServiceWithDependencies(new ConsoleLogger(), new TestConfig({}))
			);

			expect(container.size).toBe(3);

			container.clear();

			expect(container.size).toBe(0);
			expect(container.has('Logger')).toBe(false);
			expect(container.has('Config')).toBe(false);
			expect(container.has('Service')).toBe(false);
		});

		it('should allow new registrations after clear', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.clear();

			// Should not throw
			container.registerInstance('Logger', new ConsoleLogger());

			expect(container.has('Logger')).toBe(true);
		});
	});

	describe('size property', () => {
		it('should return 0 for empty container', () => {
			expect(container.size).toBe(0);
		});

		it('should count registered instances', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.registerInstance('Config', new TestConfig({}));

			expect(container.size).toBe(2);
		});

		it('should count registered factories', () => {
			container.register('Logger', () => new ConsoleLogger());
			container.register('Config', () => new TestConfig({}));

			expect(container.size).toBe(2);
		});

		it('should count registered transient factories', () => {
			container.registerFactory('Logger', () => new ConsoleLogger());
			container.registerFactory('Config', () => new TestConfig({}));

			expect(container.size).toBe(2);
		});

		it('should count mixed registration types', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.register('Config', () => new TestConfig({}));
			container.registerFactory(
				'Service',
				() => new ServiceWithDependencies(new ConsoleLogger(), new TestConfig({}))
			);

			expect(container.size).toBe(3);
		});

		it('should decrease size when unregistering', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.register('Config', () => new TestConfig({}));

			expect(container.size).toBe(2);

			container.unregister('Logger');

			expect(container.size).toBe(1);
		});

		it('should not change size when factory is resolved (cached)', () => {
			container.register('Logger', () => new ConsoleLogger());

			expect(container.size).toBe(1);

			container.resolve('Logger') as unknown as ConsoleLogger;

			expect(container.size).toBe(1);
		});
	});

	describe('registeredServices() method', () => {
		it('should return empty array for empty container', () => {
			const services = container.registeredServices();
			expect(services).toEqual([]);
		});

		it('should return names of registered instances', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.registerInstance('Config', new TestConfig({}));

			const services = container.registeredServices();

			expect(services).toContain('Logger');
			expect(services).toContain('Config');
			expect(services).toHaveLength(2);
		});

		it('should return names of registered factories', () => {
			container.register('Logger', () => new ConsoleLogger());
			container.register('Config', () => new TestConfig({}));

			const services = container.registeredServices();

			expect(services).toContain('Logger');
			expect(services).toContain('Config');
			expect(services).toHaveLength(2);
		});

		it('should return names of registered transient factories', () => {
			container.registerFactory('Logger', () => new ConsoleLogger());
			container.registerFactory('Config', () => new TestConfig({}));

			const services = container.registeredServices();

			expect(services).toContain('Logger');
			expect(services).toContain('Config');
			expect(services).toHaveLength(2);
		});

		it('should return unique names when mixing types', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.register('Config', () => new TestConfig({}));
			container.registerFactory(
				'Service',
				() => new ServiceWithDependencies(new ConsoleLogger(), new TestConfig({}))
			);

			const services = container.registeredServices();

			expect(services).toEqual(expect.arrayContaining(['Logger', 'Config', 'Service']));
			expect(services).toHaveLength(3);
		});
	});

	describe('Container Disposal', () => {
		describe('registerDisposable()', () => {
			it('should register a disposable instance by name', async () => {
				const mockDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };

				container.registerDisposable('Logger', mockDisposable);
				await container.dispose();

				expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
			});

			it('should register multiple disposables', async () => {
				const firstDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };
				const secondDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };

				container.registerDisposable('First', firstDisposable);
				container.registerDisposable('Second', secondDisposable);
				await container.dispose();

				expect(firstDisposable.dispose).toHaveBeenCalledTimes(1);
				expect(secondDisposable.dispose).toHaveBeenCalledTimes(1);
			});

			it('should allow registering disposable for unregistered service name', async () => {
				const mockDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };

				expect(() => {
					container.registerDisposable('UnregisteredService', mockDisposable);
				}).not.toThrow();

				await container.dispose();
				expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
			});
		});

		describe('dispose()', () => {
			it('should call dispose() on all registered disposables', async () => {
				const loggerDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };
				const configDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };

				container.registerDisposable('Logger', loggerDisposable);
				container.registerDisposable('Config', configDisposable);

				await expect(container.dispose()).resolves.toBeUndefined();

				expect(loggerDisposable.dispose).toHaveBeenCalledTimes(1);
				expect(configDisposable.dispose).toHaveBeenCalledTimes(1);
			});

			it('should dispose services in reverse registration order', async () => {
				const callOrder: string[] = [];
				const firstDisposable = {
					dispose: vi.fn().mockImplementation(async () => {
						callOrder.push('First');
					}),
				};
				const secondDisposable = {
					dispose: vi.fn().mockImplementation(async () => {
						callOrder.push('Second');
					}),
				};
				const thirdDisposable = {
					dispose: vi.fn().mockImplementation(async () => {
						callOrder.push('Third');
					}),
				};

				container.registerDisposable('First', firstDisposable);
				container.registerDisposable('Second', secondDisposable);
				container.registerDisposable('Third', thirdDisposable);

				await container.dispose();

				expect(callOrder).toEqual(['Third', 'Second', 'First']);
			});

			it('should throw aggregate error when one or more disposables fail', async () => {
				const okDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };
				const failingDisposable = {
					dispose: vi.fn().mockRejectedValue(new Error('failed to dispose resource')),
				};

				container.registerDisposable('OkService', okDisposable);
				container.registerDisposable('FailingService', failingDisposable);

				await expect(container.dispose()).rejects.toThrow('Failed to dispose services:');
			});

			it('should include failed service names in aggregate error message', async () => {
				container.registerDisposable('ConnectionPool', {
					dispose: vi.fn().mockRejectedValue(new Error('pool failure')),
				});
				container.registerDisposable('Cache', {
					dispose: vi.fn().mockRejectedValue(new Error('cache failure')),
				});

				await expect(container.dispose()).rejects.toThrow(
					'Failed to dispose services: Cache: cache failure, ConnectionPool: pool failure'
				);
			});

			it('should continue disposing remaining services after first error', async () => {
				const firstDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };
				const failingDisposable = {
					dispose: vi.fn().mockRejectedValue(new Error('dispose failed')),
				};
				const lastDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };

				container.registerDisposable('First', firstDisposable);
				container.registerDisposable('Failing', failingDisposable);
				container.registerDisposable('Last', lastDisposable);

				await expect(container.dispose()).rejects.toThrow('Failed to dispose services:');

				expect(lastDisposable.dispose).toHaveBeenCalledTimes(1);
				expect(failingDisposable.dispose).toHaveBeenCalledTimes(1);
				expect(firstDisposable.dispose).toHaveBeenCalledTimes(1);
			});

			it('should not throw when all dispose() calls succeed', async () => {
				container.registerDisposable('Logger', {
					dispose: vi.fn().mockResolvedValue(undefined),
				});
				container.registerDisposable('Config', {
					dispose: vi.fn().mockResolvedValue(undefined),
				});

				await expect(container.dispose()).resolves.toBeUndefined();
			});

			it('should work correctly when no disposables are registered', async () => {
				await expect(container.dispose()).resolves.toBeUndefined();
			});

			it('should be idempotent when dispose() is called multiple times', async () => {
				const mockDisposable = { dispose: vi.fn().mockResolvedValue(undefined) };

				container.registerDisposable('Logger', mockDisposable);

				await expect(container.dispose()).resolves.toBeUndefined();
				await expect(container.dispose()).resolves.toBeUndefined();

				expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
			});

			it('should aggregate synchronous throw and promise rejection errors', async () => {
				container.registerDisposable('SyncThrower', {
					dispose: vi.fn().mockImplementation(() => {
						throw new Error('sync failure');
					}),
				});
				container.registerDisposable('AsyncRejector', {
					dispose: vi.fn().mockRejectedValue(new Error('async failure')),
				});

				await expect(container.dispose()).rejects.toThrow(
					'Failed to dispose services: AsyncRejector: async failure, SyncThrower: sync failure'
				);
			});

			it('should clear tracked disposables even when dispose throws', async () => {
				const failingDisposable = {
					dispose: vi.fn().mockRejectedValue(new Error('failed once')),
				};

				container.registerDisposable('Failing', failingDisposable);

				await expect(container.dispose()).rejects.toThrow('Failed to dispose services:');
				await expect(container.dispose()).resolves.toBeUndefined();

				expect(failingDisposable.dispose).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe('Resolution Order Priority', () => {
		it('should check instances before factories when checking has()', () => {
			const instance = new ConsoleLogger('[INSTANCE] ');
			container.registerInstance('Logger', instance);

			// Should find it in services, not factories
			expect(container.has('Logger')).toBe(true);
		});

		it('should check factories before transient factories when checking has()', () => {
			container.register('Logger', () => new ConsoleLogger('[FACTORY] '));

			// Should find it in factories, not transient factories
			expect(container.has('Logger')).toBe(true);
		});

		it('should check transient factories when nothing else registered', () => {
			container.registerFactory('Logger', () => new ConsoleLogger('[TRANSIENT] '));

			// Should find it in transient factories
			expect(container.has('Logger')).toBe(true);
		});
	});
});

describe('createDefaultContainer', () => {
	it('should create empty container when no options provided', () => {
		const container = createDefaultContainer();

		expect(container).toBeInstanceOf(Container);
		expect(container.size).toBe(0);
	});

	it('should register logger if provided', () => {
		const logger = new ConsoleLogger('[CUSTOM] ');
		const container = createDefaultContainer({ logger });

		expect(container.has('Logger')).toBe(true);
		const resolved = container.resolve('Logger') as unknown as ConsoleLogger;
		expect(resolved).toBe(logger);
	});

	it('should register config if provided', () => {
		const config = new ServerConfig();
		const container = createDefaultContainer({ config });

		expect(container.has('Config')).toBe(true);
		const resolved = container.resolve('Config');
		expect(resolved).toBe(config);
	});

	it('should register both logger and config if provided', () => {
		const logger = new ConsoleLogger('[CUSTOM] ');
		const config = new ServerConfig();
		const container = createDefaultContainer({ logger, config });
		expect(container.has('Logger')).toBe(true);
		expect(container.has('Config')).toBe(true);
	});

	it('should accept fileConfig option without error', () => {
		const fileConfig = { skillDirs: ['.claude/skills'] };
		const container = createDefaultContainer({ fileConfig });

		// fileConfig is accepted but not automatically registered
		// as it's used for ConfigLoader initialization
		expect(container).toBeInstanceOf(Container);
	});
});

describe('Complex Scenarios', () => {
	it('should handle circular dependencies through lazy resolution', () => {
		// This tests that dependencies can be resolved lazily
		// after the container is partially configured
		const container = new Container();

		// Register a service that will later depend on another
		container.register('Service', () => {
			// Resolve dependency at factory call time, not registration time
			const logger = container.resolve('Logger') as unknown as ConsoleLogger;
			return { logger };
		});

		// Register the dependency after the service
		container.registerInstance('Logger', new ConsoleLogger('[LAZY] '));

		const service = container.resolveDynamic('Service') as { logger: ILogger };

		expect(service.logger).toBeInstanceOf(ConsoleLogger);
		expect((service.logger as ConsoleLogger).prefix).toBe('[LAZY] ');
	});

	it('should support replacing a service', () => {
		const container = new Container();

		container.registerInstance('Logger', new ConsoleLogger('v1'));
		expect((container.resolve('Logger') as unknown as ConsoleLogger).prefix).toBe('v1');

		container.unregister('Logger');
		container.registerInstance('Logger', new ConsoleLogger('v2'));
		expect((container.resolve('Logger') as unknown as ConsoleLogger).prefix).toBe('v2');
	});

	it('should throw descriptive error on circular dependency resolution', () => {
		const container = new Container();

		container.register('A', () => ({ b: container.resolveDynamic('B') }));
		container.register('B', () => ({ a: container.resolveDynamic('A') }));

		expect(() => {
			container.resolveDynamic('A');
		}).toThrow('Circular dependency detected while resolving service: A');
	});

	it('should handle multiple containers independently', () => {
		const container1 = new Container();
		const container2 = new Container();

		container1.registerInstance('Logger', new ConsoleLogger('C1'));
		container2.registerInstance('Logger', new ConsoleLogger('C2'));

		const logger1 = container1.resolve('Logger');
		const logger2 = container2.resolve('Logger');

		expect((logger1 as unknown as ConsoleLogger).prefix).toBe('C1');
		expect((logger2 as unknown as ConsoleLogger).prefix).toBe('C2');
		expect(logger1).not.toBe(logger2);
	});
});
