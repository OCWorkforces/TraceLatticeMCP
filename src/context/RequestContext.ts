/**
 * Request context management using AsyncLocalStorage for correlation IDs.
 *
 * Provides zero-cost request ID propagation across async boundaries
 * via Node.js AsyncLocalStorage.
 *
 * @module context
 */

import { AsyncLocalStorage } from 'node:async_hooks';

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
 * Get the current request ID from context.
 *
 * Returns undefined if called outside of a runWithContext() call.
 *
 * @returns The current request ID or undefined
 */
export function getRequestId(): string | undefined {
	return store.getStore()?.requestId;
}
