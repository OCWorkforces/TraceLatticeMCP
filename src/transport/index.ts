/**
 * Transport exports for MCP server communication.
 *
 * This module re-exports the `SseTransport` class and its type
 * definition for convenient importing.
 *
 * @example
 * ```typescript
 * import { SseTransport, createSseTransport } from './transport/index.js';
 * import type { SseTransportOptions } from './transport/index.js';
 *
 * const transport = createSseTransport({
 *   port: 3000,
 *   host: 'localhost',
 *   corsOrigin: '*'
 * });
 * ```
 * @module transport
 */

export { SseTransport, createSseTransport } from './SseTransport.js';
export type { SseTransportOptions } from './SseTransport.js';
