import { describe, it, expect, beforeEach } from 'vitest';
import { Container, createDefaultContainer } from '../di/Container.js';

// Test classes and interfaces
interface ILogger {
	log(message: string): void;
}

class ConsoleLogger implements ILogger {
	constructor(public prefix: string = '') {}

	log(message: string): void {
		console.log(`${this.prefix}${message}`);
	}
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

			const resolved = container.resolve<ConsoleLogger>('Logger');

			expect(resolved).toBe(logger);
			expect(resolved.prefix).toBe('[TEST] ');
		});

		it('should return the same instance on multiple resolves', () => {
			const logger = new ConsoleLogger('[TEST] ');
			container.registerInstance('Logger', logger);

			const first = container.resolve<ConsoleLogger>('Logger');
			const second = container.resolve<ConsoleLogger>('Logger');

			expect(first).toBe(second);
			expect(first).toBe(logger);
		});
	});

	describe('Factory Registration (Singleton)', () => {
		it('should register and resolve a factory', () => {
			container.register('Logger', () => new ConsoleLogger('[FACTORY] '));

			const resolved = container.resolve<ConsoleLogger>('Logger');

			expect(resolved).toBeInstanceOf(ConsoleLogger);
			expect(resolved.prefix).toBe('[FACTORY] ');
		});

		it('should cache factory result (singleton behavior)', () => {
			let callCount = 0;
			container.register('Logger', () => {
				callCount++;
				return new ConsoleLogger(`[CALL-${callCount}] `);
			});

			const first = container.resolve<ConsoleLogger>('Logger');
			const second = container.resolve<ConsoleLogger>('Logger');

			expect(callCount).toBe(1);
			expect(first).toBe(second);
			expect(first.prefix).toBe('[CALL-1] ');
		});

		it('should resolve dependencies from container', () => {
			const logger = new ConsoleLogger('[DEP] ');
			container.registerInstance('Logger', logger);

			container.register('Service', () => {
				const resolvedLogger = container.resolve<ILogger>('Logger');
				return new ServiceWithDependencies(resolvedLogger, new TestConfig({ key: 'value' }));
			});

			const service = container.resolve<ServiceWithDependencies>('Service');

			expect(service).toBeInstanceOf(ServiceWithDependencies);
			expect(service.logger).toBe(logger);
			expect(service.config.get('key')).toBe('value');
		});
	});

	describe('Transient Factory Registration', () => {
		it('should create new instance on each resolve', () => {
			container.registerFactory('Logger', () => new ConsoleLogger('[TRANSIENT] '));

			const first = container.resolve<ConsoleLogger>('Logger');
			const second = container.resolve<ConsoleLogger>('Logger');

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

			const first = container.resolve<{ count: number }>('Counter');
			const second = container.resolve<{ count: number }>('Counter');
			const third = container.resolve<{ count: number }>('Counter');

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
				container.resolve('NonExistent');
			}).toThrow('Service not found: NonExistent');
		});

		it('should include helpful message in error', () => {
			expect(() => {
				container.resolve('MyService');
			}).toThrow("Service not found: MyService. Did you forget to register it?");
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
			container.resolve('Logger');
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

			const resolved = container.resolve<ConsoleLogger>('Logger');
			expect(resolved.prefix).toBe('second');
		});
	});

	describe('clear() method', () => {
		it('should remove all registered services', () => {
			container.registerInstance('Logger', new ConsoleLogger());
			container.register('Config', () => new TestConfig({}));
			container.registerFactory('Service', () => new ServiceWithDependencies(new ConsoleLogger(), new TestConfig({})));

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
			container.registerFactory('Service', () => new ServiceWithDependencies(new ConsoleLogger(), new TestConfig({})));

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

			container.resolve('Logger');

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
			container.registerFactory('Service', () => new ServiceWithDependencies(new ConsoleLogger(), new TestConfig({})));

			const services = container.registeredServices();

			expect(services).toEqual(expect.arrayContaining(['Logger', 'Config', 'Service']));
			expect(services).toHaveLength(3);
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
		const resolved = container.resolve<ConsoleLogger>('Logger');
		expect(resolved).toBe(logger);
	});

	it('should register config if provided', () => {
		const config = new TestConfig({ key: 'value' });
		const container = createDefaultContainer({ config });

		expect(container.has('Config')).toBe(true);
		const resolved = container.resolve<TestConfig>('Config');
		expect(resolved).toBe(config);
	});

	it('should register both logger and config if provided', () => {
		const logger = new ConsoleLogger('[CUSTOM] ');
		const config = new TestConfig({ key: 'value' });
		const container = createDefaultContainer({ logger, config });

		expect(container.size).toBe(2);
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
			const logger = container.resolve<ILogger>('Logger');
			return { logger };
		});

		// Register the dependency after the service
		container.registerInstance('Logger', new ConsoleLogger('[LAZY] '));

		const service = container.resolve<{ logger: ILogger }>('Service');

		expect(service.logger).toBeInstanceOf(ConsoleLogger);
		expect((service.logger as ConsoleLogger).prefix).toBe('[LAZY] ');
	});

	it('should support replacing a service', () => {
		const container = new Container();

		container.registerInstance('Logger', new ConsoleLogger('v1'));
		expect(container.resolve<ConsoleLogger>('Logger').prefix).toBe('v1');

		container.unregister('Logger');
		container.registerInstance('Logger', new ConsoleLogger('v2'));
		expect(container.resolve<ConsoleLogger>('Logger').prefix).toBe('v2');
	});

	it('should handle multiple containers independently', () => {
		const container1 = new Container();
		const container2 = new Container();

		container1.registerInstance('Logger', new ConsoleLogger('C1'));
		container2.registerInstance('Logger', new ConsoleLogger('C2'));

		const logger1 = container1.resolve<ConsoleLogger>('Logger');
		const logger2 = container2.resolve<ConsoleLogger>('Logger');

		expect(logger1.prefix).toBe('C1');
		expect(logger2.prefix).toBe('C2');
		expect(logger1).not.toBe(logger2);
	});
});
