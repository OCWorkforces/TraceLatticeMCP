/**
 * Transport exports for MCP server communication.
 *
 * This module re-exports all available transport classes and their type
 * definitions for convenient importing.
 *
 * @example
 * ```typescript
 * import { SseTransport, createSseTransport, BaseTransport } from './transport/index.js';
 * import type { SseTransportOptions } from './transport/index.js';
 *
 * // SSE for real-time streaming
 * const sseTransport = createSseTransport({
 *   port: 3000,
 *   host: 'localhost',
 *   corsOrigin: '*'
 * });
 * ```
 * @module transport
 */

export { BaseTransport } from './BaseTransport.js';
export type { ITransport, TransportOptions } from './BaseTransport.js';

export { SseTransport, createSseTransport } from './SseTransport.js';
export type { SseTransportOptions } from './SseTransport.js';

export { HttpTransport, createHttpTransport } from './HttpTransport.js';
export type { HttpTransportOptions } from './HttpTransport.js';

export { StreamableHttpTransport, createStreamableHttpTransport } from './StreamableHttpTransport.js';
export type { StreamableHttpTransportOptions } from './StreamableHttpTransport.js';
