/**
 * Request context management using AsyncLocalStorage for correlation IDs.
 *
 * This module provides a way to track request IDs across async operations
 * without explicit parameter passing. Uses Node.js AsyncLocalStorage for
 * zero-cost context propagation.
 *
 * @module context
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Internal context structure stored per-request.
 */
interface RequestCtx {
	requestId: string;
}

/**
 * AsyncLocalStorage instance for request context.
 * Stores requestId that propagates across async boundaries.
 */
const store = new AsyncLocalStorage<RequestCtx>();

/**
 * Run a function within a request context.
 *
 * The requestId will be available via getRequestId() inside the callback
 * and any async operations it spawns.
 *
 * @param requestId - The correlation ID for this request
 * @param fn - The function to run within the context
 * @returns The return value of fn
 *
 * @example
 * ```typescript
 * await runWithContext('req-123', async () => {
 *   console.log(getRequestId()); // 'req-123'
 *   await someAsyncOperation();
 *   console.log(getRequestId()); // still 'req-123'
 * });
 * ```
 */
export function runWithContext<T>(requestId: string, fn: () => T | Promise<T>): T | Promise<T> {
	return store.run({ requestId }, fn);
}

/**
 * Get the current request ID from context.
 *
 * Returns undefined if called outside of a runWithContext() call.
 *
 * @returns The current request ID or undefined
 *
 * @example
 * ```typescript
 * // Outside context
 * getRequestId(); // undefined
 *
 * // Inside context
 * runWithContext('abc', () => {
 *   getRequestId(); // 'abc'
 * });
 * ```
 */
export function getRequestId(): string | undefined {
	return store.getStore()?.requestId;
}

/**
 * Generate a new unique request ID using UUID v4.
 *
 * @returns A UUID string in standard format
 *
 * @example
 * ```typescript
 * const id = generateRequestId();
 * // '550e8400-e29b-41d4-a716-446655440000'
 * ```
 */
export function generateRequestId(): string {
	return randomUUID();
}
