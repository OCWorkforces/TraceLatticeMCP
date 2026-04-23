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
	owner?: string;
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

/**
 * Run a function with the given request context. The context propagates
 * across async boundaries via AsyncLocalStorage.
 *
 * @param ctx - Request context to install (requestId, optional owner)
 * @param fn - Function to execute within the context
 * @returns The return value of `fn`
 */
export function runWithContext<T>(ctx: RequestCtx, fn: () => T): T {
	return store.run(ctx, fn);
}

/**
 * Get the current owner identifier from context.
 *
 * Returns undefined when called outside of a runWithContext() call or when
 * the context did not specify an owner (e.g. stdio transport).
 *
 * @returns The current owner or undefined
 */
export function getOwner(): string | undefined {
	return store.getStore()?.owner;
}
