/**
 * Transport exports for MCP server communication.
 *
 * This module re-exports all available transport classes and their type
 * definitions for convenient importing.
 *
 * @example
 * ```typescript
 * import { SseTransport, HttpTransport, createSseTransport, createHttpTransport } from './transport/index.js';
 * import type { SseTransportOptions, HttpTransportOptions } from './transport/index.js';
 *
 * // SSE for real-time streaming
 * const sseTransport = createSseTransport({
 *   port: 3000,
 *   host: 'localhost',
 *   corsOrigin: '*'
 * });
 *
 * // HTTP for request-response
 * const httpTransport = createHttpTransport({
 *   port: 3001,
 *   host: 'localhost'
 * });
 * ```
 * @module transport
 */

export { SseTransport, createSseTransport } from './SseTransport.js';
export type { SseTransportOptions } from './SseTransport.js';

export { HttpTransport, createHttpTransport } from './HttpTransport.js';
export type { HttpTransportOptions } from './HttpTransport.js';
