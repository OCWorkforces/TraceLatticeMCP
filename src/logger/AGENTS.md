# LOGGER MODULE

**Generated:** 2026-01-29
**Parent:** ../AGENTS.md

## OVERVIEW

Structured logging primitives: JSON or pretty output, level filtering, null sink.

## WHERE TO LOOK

- `src/logger/StructuredLogger.ts` - core logger, format selection, stderr output, child context.
- `src/logger/NullLogger.ts` - no-op logger for disabled logging paths.
- `src/logger/index.ts` - public exports and types.
- `src/logger/CLAUDE.md` - local usage notes and examples.

## CONVENTIONS

- Output formats: pretty (default) or JSON via `pretty` option.
- Levels: `debug` < `info` < `warn` < `error`; filter is minimum level.
- Env config: `LOG_LEVEL`, `PRETTY_LOG`; config keys `logLevel`, `prettyLog`.
- Default context: `SequentialThinking`; child loggers append with `:`.
