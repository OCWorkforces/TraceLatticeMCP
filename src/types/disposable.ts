/**
 * Interface for services that need resource cleanup.
 *
 * Implement this on any service that holds resources (connections, file handles, timers, etc.)
 *
 * @module types/disposable
 *
 * @example
 * ```typescript
 * class MyService implements IDisposable {
 *   async dispose(): Promise<void> {
 *     await this.closeConnections();
 *     this.clearTimers();
 *   }
 * }
 * ```
 */
export interface IDisposable {
	/** Release all resources held by this service. */
	dispose(): Promise<void>;
}
