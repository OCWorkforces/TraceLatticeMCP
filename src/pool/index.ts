/**
 * Connection pool exports for multi-user session management.
 *
 * This module re-exports the `ConnectionPool` class and its type
 * definitions for convenient importing.
 *
 * @example
 * ```typescript
 * import { ConnectionPool, createConnectionPool } from './pool/index.js';
 * import type { SessionOptions, SessionInfo } from './pool/index.js';
 *
 * const pool = createConnectionPool({
 *   maxSessions: 100,
 *   sessionTimeout: 1800000
 * });
 *
 * const session = pool.getSession('user-123');
 * console.log(`Session for ${session.userId} has ${session.history.size()} thoughts`);
 * ```
 * @module pool
 */

export { ConnectionPool, createConnectionPool } from './ConnectionPool.js';
export type { SessionOptions, SessionInfo } from './ConnectionPool.js';
