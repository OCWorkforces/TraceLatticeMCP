/**
 * Context module exports.
 *
 * Provides request correlation ID management via AsyncLocalStorage.
 *
 * @module context
 */

export { runWithContext, getRequestId, generateRequestId } from './RequestContext.js';
