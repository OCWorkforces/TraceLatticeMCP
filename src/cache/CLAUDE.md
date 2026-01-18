# CLAUDE.md

This directory contains caching functionality for skill and tool discovery results.

## Files

- `DiscoveryCache.ts` - Caching layer for discovery operations

## DiscoveryCache

The `DiscoveryCache` class provides time-based caching for skill discovery results to avoid repeated filesystem operations.

### Configuration

```typescript
interface DiscoveryCacheOptions {
  ttl?: number;      // Time-to-live in seconds (default: 300)
  maxSize?: number;  // Maximum cache entries (default: 100)
}
```

### Usage

```typescript
import { DiscoveryCache } from './cache/DiscoveryCache.js';

const cache = new DiscoveryCache({ ttl: 300, maxSize: 100 });

// Check cache
const cached = cache.get('key');
if (cached) {
  return cached;
}

// Set cache
cache.set('key', value);

// Clear cache
cache.clear();
```

## Integration

The cache is used by:
- `ToolRegistry` - for caching tool discovery results
- `SkillRegistry` - for caching skill discovery results

Cache configuration is passed through environment variables:
- `DISCOVERY_CACHE_TTL` - TTL in seconds (default: 300)
- `DISCOVERY_CACHE_MAX_SIZE` - Max entries (default: 100)
