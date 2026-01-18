/**
 * Cache exports for discovery caching functionality.
 *
 * This module re-exports the `DiscoveryCache` class and its type
 * definitions for convenient importing.
 *
 * @example
 * ```typescript
 * import { DiscoveryCache } from './cache/index.js';
 * import type { CacheEntry, DiscoveryCacheOptions } from './cache/index.js';
 *
 * const cache = new DiscoveryCache({
 *   ttl: 300000,
 *   maxSize: 100
 * });
 * ```
 * @module cache
 */

export { DiscoveryCache } from './DiscoveryCache.js';
export type { CacheEntry, DiscoveryCacheOptions } from './DiscoveryCache.js';
