/**
 * Configuration loading exports for server configuration.
 *
 * This module re-exports the `ConfigLoader` class and its type
 * definitions for convenient importing.
 *
 * @example
 * ```typescript
 * import { ConfigLoader } from './config/index.js';
 * import type { ConfigFileOptions } from './config/index.js';
 *
 * const loader = new ConfigLoader();
 * const config = loader.load();
 * ```
 * @module config
 */

export { ConfigLoader } from './ConfigLoader.js';
export type { ConfigFileOptions } from './ConfigLoader.js';
