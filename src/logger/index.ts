/**
 * Logging exports for structured logging.
 *
 * This module re-exports the `StructuredLogger` class and its related
 * type definitions for convenient importing.
 *
 * @example
 * ```typescript
 * import { StructuredLogger } from './logger/index.js';
 * import type { LogLevel, LogEntry, LoggerOptions } from './logger/index.js';
 *
 * const logger = new StructuredLogger({
 *   level: 'info',
 *   context: 'MyApp',
 *   pretty: true
 * });
 * ```
 * @module logger
 */

export { StructuredLogger } from './StructuredLogger.js';
export { NullLogger } from './NullLogger.js';
export type { LogLevel, LogEntry, LoggerOptions, Logger } from './StructuredLogger.js';
