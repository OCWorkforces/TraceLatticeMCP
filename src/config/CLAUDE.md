# CLAUDE.md

This directory contains configuration loading and management components.

## Files

- `ConfigLoader.ts` - File-based configuration loader
- `index.ts` - Module exports and factory function

## Configuration Loading

The `ConfigLoader` class loads configuration from YAML files in standard locations:

### Config File Locations (in priority order)

1. `.claude/config.yml` / `.claude/config.yaml` - Project-local config
2. `~/.claude/config.yml` / `~/.claude/config.yaml` - User-global config
3. `.mcp-seq-thinking.yml` / `.mcp-seq-thinking.yaml` - Legacy project-local config
4. `~/.config/mcp-seq-thinking/config.yml` - Legacy user-global config

### Configuration Schema

```yaml
# Server settings
maxHistorySize: 1000
maxBranches: 100
maxBranchSize: 100

# Logging
logLevel: info  # debug, info, warn, error
prettyLog: true

# Transport settings
transport:
  type: stdio   # stdio, sse, or http
  port: 9108    # Port for SSE/HTTP transport
  host: 127.0.0.1  # Host for SSE/HTTP transport
  path: /mcp    # Path for HTTP transport

# CORS settings
cors:
  enabled: true
  origin: "*"

# Rate limiting
rateLimit:
  enabled: true
  maxRequestsPerMinute: 100

# Skill discovery
skillDirs:
  - .claude/skills
  - ~/.claude/skills

# Discovery cache
discoveryCache:
  ttl: 300        # seconds
  maxSize: 100    # entries

# Persistence
persistence:
  enabled: false
  backend: file   # file, sqlite, memory
  options:
    dataDir: ./data
```

## Environment Variables

All config values can be overridden by environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_HISTORY_SIZE` | Max thoughts in history | 1000 |
| `MAX_BRANCHES` | Max number of branches | 100 |
| `LOG_LEVEL` | Logging level | info |
| `PRETTY_LOG` | Enable pretty logging | true |
| `SKILL_DIRS` | Colon-separated skill directories | .claude/skills:~/.claude/skills |
| `DISCOVERY_CACHE_TTL` | Discovery cache TTL (seconds) | 300 |
| `DISCOVERY_CACHE_MAX_SIZE` | Discovery cache max entries | 100 |
| `TRANSPORT_TYPE` | Transport type (stdio/sse/http) | stdio |
| `SSE_PORT` / `HTTP_PORT` | Transport port | 9108 |
| `SSE_HOST` / `HTTP_HOST` | Transport host | 127.0.0.1 |
| `HTTP_PATH` | HTTP endpoint path | /mcp |
| `CORS_ORIGIN` | CORS origin | * |
| `ENABLE_CORS` | Enable CORS | true |
| `ENABLE_RATE_LIMIT` | Enable rate limiting | true |
| `MAX_REQUESTS_PER_MINUTE` | Rate limit threshold | 100 |

## Usage

```typescript
import { ConfigLoader } from './config/ConfigLoader.js';

const loader = new ConfigLoader();
const config = loader.load();

console.log(config.maxHistorySize);
console.log(config.logLevel);
```

## Error Handling

The `ConfigLoader` handles errors gracefully:
- Missing config files: Returns empty config (uses defaults)
- Invalid YAML: Logs error and returns empty config
- Permission errors: Logs error and continues

## Configuration Merge Strategy

Configuration values are merged in the following priority order (highest to lowest):

1. **Environment Variables** - Always override file-based config
2. **Project-local Config** - `.mcp-seq-thinking.yml` in current directory
3. **User-global Config** - `~/.config/mcp-seq-thinking/config.yml`
4. **Code Defaults** - Built-in default values
