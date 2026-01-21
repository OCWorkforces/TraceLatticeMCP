# CLAUDE.md

This directory contains structured logging components.

## Files

- `StructuredLogger.ts` - JSON-based structured logger

## StructuredLogger

The `StructuredLogger` class provides structured logging with support for different log levels and output formats.

### Configuration

```typescript
interface LoggerOptions {
  level?: LogLevel;    // debug, info, warn, error
  context?: string;    // Logging context/module name
  pretty?: boolean;    // Enable pretty printing (default: true)
}
```

### Usage

```typescript
import { StructuredLogger } from './logger/StructuredLogger.js';

const logger = new StructuredLogger({
  level: 'info',
  context: 'SequentialThinking',
  pretty: true
});

// Log at different levels
logger.debug('Detailed debugging info', { detail: 'value' });
logger.info('Information message', { key: 'value' });
logger.warn('Warning message', { issue: 'description' });
logger.error('Error message', { error: err.message });
```

### Output Formats

**Pretty Output** (default):
```
[2026-01-18T02:49:34.678Z] [INFO] [SequentialThinking] Server started {"port":3000}
```

**JSON Output** (pretty: false):
```json
{"timestamp":"2026-01-18T02:49:34.678Z","level":"info","context":"SequentialThinking","message":"Server started","data":{"port":3000}}
```

## Environment Configuration

The logger is configured via:
- Environment variable `LOG_LEVEL` (default: `info`)
- Environment variable `PRETTY_LOG` (default: `true`)
- Config file `logLevel` and `prettyLog` settings

## Log Levels

| Level | Description |
|-------|-------------|
| `debug` | Detailed debugging information |
| `info` | General informational messages |
| `warn` | Warning messages for potential issues |
| `error` | Error messages for failures |

## LogEntry Type

```typescript
interface LogEntry {
    timestamp: string;    // ISO 8601 timestamp
    level: LogLevel;      // debug, info, warn, error
    context: string;      // Module/context name
    message: string;      // Log message
    data?: Record<string, unknown>;  // Additional data
}
```
