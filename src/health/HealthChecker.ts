/**
 * Aggregate health checking system.
 *
 * Provides liveness and readiness checks by aggregating the health
 * status of registered backend components (persistence, pool, etc.).
 *
 * @module health
 */

import type { PersistenceBackend } from '../persistence/PersistenceBackend.js';
import type { Logger } from '../contracts/index.js';

/**
 * Health status of an individual component.
 */
export interface HealthComponent {
	name: string;
	healthy: boolean;
	details?: string;
	latencyMs?: number;
}

/**
 * Aggregate health check result.
 */
export interface HealthCheckResult {
	status: 'ok' | 'degraded' | 'unhealthy';
	timestamp: string;
	components: Record<string, HealthComponent>;
}

/**
 * Options for constructing a HealthChecker.
 */
export interface HealthCheckerOptions {
	persistence?: PersistenceBackend | null;
	logger?: Logger;
}

/**
 * No-op logger used when none is provided.
 */
class NoopLogger implements Pick<Logger, 'info' | 'warn' | 'error' | 'debug'> {
	info(): void {}
	warn(): void {}
	error(): void {}
	debug(): void {}
}

/**
 * Aggregates component health into liveness and readiness checks.
 *
 * - `checkLiveness()` always returns 'ok' if the process is running.
 * - `checkReadiness()` checks all registered backends and returns an aggregate status.
 *
 * @example
 * ```typescript
 * const checker = new HealthChecker({ persistence: myBackend });
 * const readiness = await checker.checkReadiness();
 * // { status: 'ok', timestamp: '...', components: { persistence: { ... } } }
 * ```
 */
export class HealthChecker {
	private _persistence: PersistenceBackend | null;
	private _logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>;

	constructor(options: HealthCheckerOptions = {}) {
		this._persistence = options.persistence ?? null;
		this._logger = options.logger ?? new NoopLogger();
	}

	/**
	 * Liveness check — returns 'ok' if the process is alive.
	 *
	 * This is a synchronous check that always succeeds; if this code
	 * can execute, the process is alive.
	 */
	checkLiveness(): HealthCheckResult {
		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
			components: {},
		};
	}

	/**
	 * Readiness check — aggregates health of all registered backends.
	 *
	 * Checks each component and returns:
	 * - 'ok' if all components are healthy (or no components registered)
	 * - 'degraded' if some components are unhealthy
	 * - 'unhealthy' if all components are unhealthy
	 */
	async checkReadiness(): Promise<HealthCheckResult> {
		const components: Record<string, HealthComponent> = {};
		let healthyCount = 0;
		let totalCount = 0;

		// Check persistence backend
		if (this._persistence) {
			totalCount++;
			const component = await this._checkPersistence();
			components['persistence'] = component;
			if (component.healthy) {
				healthyCount++;
			}
		}

		// Determine aggregate status
		let status: 'ok' | 'degraded' | 'unhealthy';
		if (totalCount === 0 || healthyCount === totalCount) {
			status = 'ok';
		} else if (healthyCount === 0) {
			status = 'unhealthy';
		} else {
			status = 'degraded';
		}

		const result: HealthCheckResult = {
			status,
			timestamp: new Date().toISOString(),
			components,
		};

		if (status !== 'ok') {
			this._logger.warn('Readiness check returned non-ok status', {
				status,
				components,
			});
		}

		return result;
	}

	/**
	 * Check persistence backend health with latency measurement.
	 */
	private async _checkPersistence(): Promise<HealthComponent> {
		const start = Date.now();
		try {
			const healthy = await this._persistence!.healthy();
			return {
				name: 'persistence',
				healthy,
				latencyMs: Date.now() - start,
				details: healthy ? 'Backend is responsive' : 'Backend reported unhealthy',
			};
		} catch (error) {
			this._logger.error('Persistence health check failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				name: 'persistence',
				healthy: false,
				latencyMs: Date.now() - start,
				details: `Health check error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
