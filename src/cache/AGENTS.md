# CACHE MODULE

## OVERVIEW

LRU + TTL cache for tool/skill discovery results.

## WHERE TO LOOK

- `src/cache/DiscoveryCache.ts` - cache implementation (LRU, TTL, eviction)
- `src/cache/index.ts` - exports and factory surface

## CONVENTIONS

- `DiscoveryCache` caches discovery results for `ToolRegistry` and `SkillRegistry`.
- `DiscoveryCacheOptions` supports `ttl` (ms) and `maxSize` with defaults 300000 and 100.
- `CacheEntry<T>` stores `value` and `expiresAt` (unix ms).
- Expired entries are removed on access; setting existing keys refreshes expiry.
- Eviction is insertion-order LRU when `maxSize` exceeded.
- Cache config comes from `DISCOVERY_CACHE_TTL` and `DISCOVERY_CACHE_MAX_SIZE`.
