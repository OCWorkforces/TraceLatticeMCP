# LOGGER MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e

## OVERVIEW

Structured logging primitives: JSON or pretty output, level filtering, null sink.

## WHERE TO LOOK

- `src/logger/StructuredLogger.ts` - core logger, format selection, stderr output, child context.
- `src/logger/NullLogger.ts` - no-op logger for disabled logging paths.

## CONVENTIONS

- Output formats: pretty (default) or JSON via `pretty` option.
- Levels: `debug` < `info` < `warn` < `error`; filter is minimum level.
- Env config: `LOG_LEVEL`, `PRETTY_LOG`; config keys `logLevel`, `prettyLog`.
- Default context: `SequentialThinking`; child loggers append with `:`.
- `NullLogger` provided for testing/disabled paths (no-op implementation).
